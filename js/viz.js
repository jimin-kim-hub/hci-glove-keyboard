// viz.js — overlay drawing in key units: tap dots, offset arrows, offset field (시각화)
import { KEYS } from './config.js';
import { KEY_BY_ID } from './geometry.js';
import { offsetAt } from './decoder.js';

export const COLORS = {
  raw: '#e8590c',       // actual touch (실제 터치)
  corrected: '#2b8a3e', // corrected point (보정 후)
  aim: '#1c7ed6',       // where the user aimed (simulation only)
  field: '#7048e8',     // learned offset field
  wrong: '#e03131',
};

function px(u) { return 1 / u; } // 1 CSS px expressed in key units

export function dot(ctx, u, p, color, r = 4, hollow = false) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * px(u), 0, Math.PI * 2);
  if (hollow) { ctx.lineWidth = 2 * px(u); ctx.strokeStyle = color; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1 * px(u); ctx.strokeStyle = '#fff'; ctx.stroke(); }
}

export function arrow(ctx, u, a, b, color, width = 2) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return;
  const head = Math.min(7 * px(u), len * 0.5);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = width * px(u);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
  ctx.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
}

// Learned offset at each letter key center: arrow from key center along the offset
export function offsetField(ctx, u, model) {
  if (!model) return;
  ctx.globalAlpha = 0.85;
  for (const k of KEYS) {
    if (k.kind !== 'char' && k.kind !== 'space') continue;
    const c = { x: k.cx, y: k.cy };
    const o = offsetAt(model, c);
    arrow(ctx, u, c, { x: c.x + o.x, y: c.y + o.y }, COLORS.field, 2);
  }
  ctx.globalAlpha = 1;
}

// Calibration taps: residual arrow from tap to intended key center
export function calibrationTaps(ctx, u, taps) {
  for (const t of taps) {
    const k = KEY_BY_ID[t.target];
    ctx.globalAlpha = 0.5;
    arrow(ctx, u, { x: t.x, y: t.y }, { x: k.cx, y: k.cy }, '#868e96', 1.2);
    ctx.globalAlpha = 1;
    dot(ctx, u, t, t.ok === false ? COLORS.wrong : COLORS.raw, 3);
  }
}
