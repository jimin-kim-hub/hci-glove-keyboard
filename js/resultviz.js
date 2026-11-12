// resultviz.js — end-of-session charts: grouped bars per metric, hand state × keyboard X/Y
// (결과 화면 시각화: 지표마다 맨손·장갑 × 키보드 X·Y 막대). Pure: returns SVG/HTML strings.
// Colors: categorical slot 1 (X) and 2 (Y), validated for light and dark (CSS vars --viz-x / --viz-y).

const fmt = (v, d) => (v == null ? '–' : v.toFixed(d));

// values: { bare: {X, Y}, glove: {X, Y} } (numbers or null)
// opts: { title, note, unit, digits, max }
export function groupedBars(values, { title, note, unit = '', digits = 1, max = null }) {
  const W = 300, H = 170, padL = 8, padR = 8, top = 22, bottom = 30;
  const plotH = H - top - bottom, base = top + plotH;
  const all = ['bare', 'glove'].flatMap(h => ['X', 'Y'].map(k => values[h]?.[k])).filter(v => v != null);
  const yMax = max ?? niceMax(Math.max(...all, 0));
  const groupW = (W - padL - padR) / 2, barW = 44, gap = 4; // 2px+ surface gap between adjacent bars
  const bars = [], labels = [];
  ['bare', 'glove'].forEach((h, gi) => {
    const cx = padL + groupW * gi + groupW / 2;
    ['X', 'Y'].forEach((k, ki) => {
      const v = values[h]?.[k];
      const x = cx + (ki === 0 ? -barW - gap / 2 : gap / 2);
      if (v == null) {
        labels.push(`<text x="${x + barW / 2}" y="${base - 6}" class="viz-val muted">–</text>`);
        return;
      }
      const hgt = yMax > 0 ? Math.max(1, (v / yMax) * plotH) : 1;
      const y = base - hgt, r = Math.min(4, hgt);
      // 4px rounded data end, square at the baseline (막대 끝만 둥글게)
      bars.push(`<path class="viz-bar viz-${k}" d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${base} Z">
        <title>${h === 'bare' ? '맨손' : '장갑'} · 키보드 ${k}: ${fmt(v, digits)}${unit}</title></path>`);
      labels.push(`<text x="${x + barW / 2}" y="${y - 6}" class="viz-val">${fmt(v, digits)}</text>`);
    });
    labels.push(`<text x="${cx}" y="${H - 8}" class="viz-axis">${h === 'bare' ? '맨손' : '장갑'}</text>`);
  });
  return `<figure class="viz-card">
    <figcaption><b>${title}</b><span>${note}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
      <line x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" class="viz-base"/>
      ${bars.join('')}${labels.join('')}
    </svg></figure>`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p * 1.15; // headroom for value labels
}

export function vizLegend() {
  return `<div class="viz-legend"><span><i class="viz-X"></i>키보드 X</span><span><i class="viz-Y"></i>키보드 Y</span></div>`;
}
