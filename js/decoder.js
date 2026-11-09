// decoder.js — baseline / M0 / M1 / LOO model selection (판정·보정 모델, 순수 함수)
// Coordinates are in key units (u). Spec: 계획 PDF B4 + docs/decisions.md.
import { CALIB } from './config.js';
import { KEY_BY_ID, hitOrNearest } from './geometry.js';

// ---- Baseline: touch point straight into key rectangles (기준 판정) ----
export function decodeBaseline(p) {
  return hitOrNearest(p);
}

// ---- helpers ----
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
function std(xs, m = mean(xs)) { return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }

// Residuals d = touch - intended key center
export function residuals(taps) {
  return taps.map(t => {
    const k = KEY_BY_ID[t.target];
    return { ...t, cx: k.cx, cy: k.cy, dx: t.x - k.cx, dy: t.y - k.cy };
  });
}

export function removeOutliers(rs, maxPitch = CALIB.outlierPitch) {
  return rs.filter(r => Math.hypot(r.dx, r.dy) <= maxPitch);
}

// ---- M0: median offset (중앙값 오프셋) ----
export function fitM0(rs) {
  return { type: 'M0', ox: median(rs.map(r => r.dx)), oy: median(rs.map(r => r.dy)) };
}

// ---- M1: d = a + B·z(c), ridge on standardized key centers (위치 의존 오프셋) ----
function solve2(a11, a12, a22, b1, b2) {
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return [0, 0];
  return [(a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det];
}

export function fitM1(rs, lambda) {
  const cxs = rs.map(r => r.cx), cys = rs.map(r => r.cy);
  const mx = mean(cxs), my = mean(cys);
  let sx = std(cxs, mx), sy = std(cys, my);
  // A degenerate axis (all taps on one row) contributes nothing
  const zx = sx > 1e-6 ? cxs.map(v => (v - mx) / sx) : cxs.map(() => 0);
  const zy = sy > 1e-6 ? cys.map(v => (v - my) / sy) : cys.map(() => 0);
  if (sx <= 1e-6) sx = 1;
  if (sy <= 1e-6) sy = 1;
  let s11 = 0, s12 = 0, s22 = 0;
  for (let i = 0; i < rs.length; i++) { s11 += zx[i] ** 2; s12 += zx[i] * zy[i]; s22 += zy[i] ** 2; }
  const fitAxis = (ds) => {
    const a = mean(ds); // intercept is not penalized (features are centered)
    let b1 = 0, b2 = 0;
    for (let i = 0; i < rs.length; i++) { b1 += zx[i] * (ds[i] - a); b2 += zy[i] * (ds[i] - a); }
    const [w1, w2] = solve2(s11 + lambda, s12, s22 + lambda, b1, b2);
    return { a, w1, w2 };
  };
  return { type: 'M1', lambda, mx, my, sx, sy, fx: fitAxis(rs.map(r => r.dx)), fy: fitAxis(rs.map(r => r.dy)) };
}

// Offset predicted at a point (M0 constant, M1 position function)
export function offsetAt(model, p) {
  if (!model) return { x: 0, y: 0 };
  if (model.type === 'M0') return { x: model.ox, y: model.oy };
  const zx = (p.x - model.mx) / model.sx, zy = (p.y - model.my) / model.sy;
  return {
    x: model.fx.a + model.fx.w1 * zx + model.fx.w2 * zy,
    y: model.fy.a + model.fy.w1 * zx + model.fy.w2 * zy,
  };
}

// Corrected point p' = p - offset. M1 uses fixed-point iteration because the
// offset is a function of the (unknown) intended key center.
export function correctPoint(model, p) {
  if (!model) return { ...p };
  if (model.type === 'M0') return { x: p.x - model.ox, y: p.y - model.oy };
  let q = { ...p };
  for (let i = 0; i < CALIB.fixedPointIters; i++) {
    const o = offsetAt(model, q);
    q = { x: p.x - o.x, y: p.y - o.y };
  }
  return q;
}

export function decodeCalibrated(model, p) {
  const corrected = correctPoint(model, p);
  return { key: hitOrNearest(corrected), corrected };
}

// ---- LOO evaluation (하나 빼기 교차검증) ----
function fitByType(rs, type, lambda) {
  return type === 'M0' ? fitM0(rs) : fitM1(rs, lambda);
}

export function looEvaluate(rs, type, lambda) {
  let correct = 0, errSum = 0;
  for (let i = 0; i < rs.length; i++) {
    const train = rs.filter((_, j) => j !== i);
    const m = fitByType(train, type, lambda);
    const { key, corrected } = decodeCalibrated(m, rs[i]);
    if (key === rs[i].target) correct++;
    errSum += Math.hypot(corrected.x - rs[i].cx, corrected.y - rs[i].cy);
  }
  const n = rs.length || 1;
  return { acc: correct / n, meanErr: errSum / n };
}

export function looBaseline(rs) {
  const correct = rs.filter(r => decodeBaseline(r) === r.target).length;
  const meanErr = mean(rs.map(r => Math.hypot(r.dx, r.dy)));
  return { acc: correct / (rs.length || 1), meanErr };
}

// ---- Full fit with model selection (모델 학습 + 선택) ----
// taps: [{x, y, target}] in key units. policy: 'auto' (LOO choice) | 'M0' | 'M1' (fixed for every participant).
// Both models are always fitted and returned in `alt` for shadow logging (두 모델 모두 섀도 로깅).
export const MODEL_POLICIES = ['auto', 'M0', 'M1'];

export function fitCalibration(taps, policy = 'auto') {
  if (!MODEL_POLICIES.includes(policy)) policy = 'auto';
  const all = residuals(taps);
  const rs = removeOutliers(all);
  const report = {
    nTotal: all.length, nUsed: rs.length, nOutliers: all.length - rs.length, policy,
    baseline: looBaseline(rs), m0: null, m1: [], m1Lambda: null, auto: null, chosen: null, reason: '',
  };
  const pct = v => (v * 100).toFixed(1) + '%';
  report.m0 = looEvaluate(rs, 'M0');
  const m0 = Object.freeze(fitM0(rs));
  let m1 = null, best = null;
  if (rs.length >= CALIB.minTapsForM1) {
    for (const lambda of CALIB.lambdas) {
      const ev = looEvaluate(rs, 'M1', lambda);
      report.m1.push({ lambda, ...ev });
      // ties go to the larger lambda (simpler model)
      if (!best || ev.acc >= best.acc) best = { lambda, ...ev };
    }
    report.m1Lambda = best.lambda;
    m1 = Object.freeze(fitM1(rs, best.lambda));
  }
  // What the LOO rule would pick (ties → M0)
  let autoReason;
  if (!m1) {
    report.auto = 'M0';
    autoReason = `사용 가능한 탭이 ${rs.length}개로 ${CALIB.minTapsForM1}개 미만이라 M0로 폴백`;
  } else if (best.acc > report.m0.acc) {
    report.auto = 'M1';
    autoReason = `LOO 키 정확도 M1(λ=${best.lambda}) ${pct(best.acc)} > M0 ${pct(report.m0.acc)}`;
  } else {
    report.auto = 'M0';
    autoReason = best.acc === report.m0.acc
      ? `LOO 키 정확도 동률(${pct(best.acc)}) → 규칙상 단순한 M0`
      : `LOO 키 정확도 M0 ${pct(report.m0.acc)} > M1(λ=${best.lambda}) ${pct(best.acc)}`;
  }
  if (policy === 'auto') {
    report.chosen = report.auto;
    report.reason = autoReason;
  } else if (policy === 'M1' && !m1) {
    report.chosen = 'M0';
    report.reason = `M1 고정이지만 ${autoReason}`;
  } else {
    report.chosen = policy;
    report.reason = `${policy} 고정 설정 (자동이었다면 ${report.auto})`;
  }
  report.looAcc = report.chosen === 'M1' ? best.acc : report.m0.acc;
  const model = report.chosen === 'M1' ? m1 : m0;
  return Object.freeze({ model, alt: Object.freeze({ M0: m0, M1: m1 }), report });
}
