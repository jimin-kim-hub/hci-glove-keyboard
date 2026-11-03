// logger.js — JSONL event log with localStorage backup and file export (로그 기록·내보내기)
import { STORAGE_KEY, APP_VERSION } from './config.js';

export class Logger {
  constructor() {
    this.events = [];
    this.sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this._saveTimer = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.events = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
    } catch (e) { console.warn('log restore failed', e); }
  }

  // Every event gets session id and a monotonic timestamp (performance.now, ms)
  log(ev, fields = {}) {
    const e = { ev, sid: this.sessionId, t: Math.round(performance.now() * 10) / 10, ...fields };
    this.events.push(e);
    this._scheduleSave();
    return e;
  }

  startSession(fields) {
    this.log('session_start', { app: APP_VERSION, wall: new Date().toISOString(), ua: navigator.userAgent, ...fields });
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 300);
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, this.toJSONL()); }
    catch (e) { console.warn('log save failed (storage full?)', e); }
  }

  toJSONL() { return this.events.map(e => JSON.stringify(e)).join('\n') + (this.events.length ? '\n' : ''); }

  export(pid) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob([this.toJSONL()], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `glovekb_${pid || 'P00'}_${stamp}.jsonl`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  clear() {
    this.events = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }
}

export function parseJSONL(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) { /* skip malformed line */ }
  }
  return out;
}
