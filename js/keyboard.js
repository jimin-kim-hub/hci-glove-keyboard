// keyboard.js — renders the QWERTY keyboard and turns touches into key-unit points
// (키보드 렌더링, touchstart 기준 좌표 변환). Geometry comes only from config.js.
import { KEYS, KEYBOARD_SIZE, EDGE_MARGIN_PX } from './config.js';

export class Keyboard {
  constructor(root, onTap) {
    this.root = root;
    this.onTap = onTap;
    this.keyEls = {};
    this.unitPx = 30;
    this.root.innerHTML = '';
    this.surface = document.createElement('div');
    this.surface.className = 'kb-surface';
    for (const k of KEYS) {
      const el = document.createElement('div');
      el.className = `key key-${k.kind}`;
      el.textContent = k.label;
      el.dataset.key = k.id;
      this.surface.appendChild(el);
      this.keyEls[k.id] = el;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'kb-overlay';
    this.surface.appendChild(this.canvas);
    this.root.appendChild(this.surface);
    this.drawOverlay = null;

    this.layout();
    new ResizeObserver(() => this.layout()).observe(this.root);

    // Touch: decide at touchstart; each contact handled independently (양엄지 동시 접촉)
    this.surface.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        this._emit(t.clientX, t.clientY, {
          source: 'touch', tid: t.identifier,
          rx: t.radiusX ?? null, ry: t.radiusY ?? null, force: t.force ?? null,
        });
      }
    }, { passive: false });
    // Mouse (desktop demo / simulation). Touch preventDefault suppresses emulated mouse events.
    this.surface.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this._emit(e.clientX, e.clientY, { source: 'mouse', tid: -1, rx: null, ry: null, force: null });
    });
    this.surface.addEventListener('contextmenu', e => e.preventDefault());
  }

  layout() {
    const width = this.root.clientWidth;
    if (!width) return;
    this.unitPx = (width - 2 * EDGE_MARGIN_PX) / KEYBOARD_SIZE.w;
    const u = this.unitPx;
    this.surface.style.width = `${KEYBOARD_SIZE.w * u}px`;
    this.surface.style.height = `${KEYBOARD_SIZE.h * u}px`;
    this.surface.style.marginLeft = `${EDGE_MARGIN_PX}px`;
    for (const k of KEYS) {
      const el = this.keyEls[k.id];
      el.style.left = `${k.x * u}px`;
      el.style.top = `${k.y * u}px`;
      el.style.width = `${k.w * u}px`;
      el.style.height = `${k.h * u}px`;
      el.style.fontSize = k.kind === 'char' ? `${Math.round(u * 0.62)}px` : `${Math.round(u * 0.42)}px`;
    }
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(KEYBOARD_SIZE.w * u * dpr);
    this.canvas.height = Math.round(KEYBOARD_SIZE.h * u * dpr);
    this.canvas.style.width = `${KEYBOARD_SIZE.w * u}px`;
    this.canvas.style.height = `${KEYBOARD_SIZE.h * u}px`;
    this.redraw();
    if (this.onLayout) this.onLayout(this.layoutInfo());
  }

  // Layout snapshot for the log so taps can be replayed offline (오프라인 재생용)
  layoutInfo() {
    const r = this.surface.getBoundingClientRect();
    const u = this.unitPx;
    return {
      unitPx: Math.round(u * 1000) / 1000, edgePx: EDGE_MARGIN_PX,
      kbLeft: Math.round(r.left), kbTop: Math.round(r.top),
      kbW: Math.round(r.width), kbH: Math.round(r.height),
      dpr: window.devicePixelRatio || 1, vw: window.innerWidth, vh: window.innerHeight,
      keys: KEYS.map(k => ({ k: k.id, x: +(k.x * u).toFixed(1), y: +(k.y * u).toFixed(1), w: +(k.w * u).toFixed(1), h: +(k.h * u).toFixed(1) })),
    };
  }

  _emit(clientX, clientY, extra) {
    const r = this.surface.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top; // keyboard-local px
    this.onTap({ px, py, x: px / this.unitPx, y: py / this.unitPx, ...extra });
  }

  setTarget(id) {
    for (const el of Object.values(this.keyEls)) el.classList.remove('target');
    if (id && this.keyEls[id]) this.keyEls[id].classList.add('target');
  }

  flash(id) {
    const el = this.keyEls[id];
    if (!el) return;
    el.classList.remove('pressed');
    void el.offsetWidth; // restart animation
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 140);
  }

  setOverlay(fn) { this.drawOverlay = fn; this.redraw(); }

  redraw() {
    const ctx = this.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.drawOverlay) return;
    // Draw in key units: 1 unit = unitPx CSS px
    ctx.setTransform(dpr * this.unitPx, 0, 0, dpr * this.unitPx, 0, 0);
    this.drawOverlay(ctx, this.unitPx);
  }
}
