// logger.js — JSONL event log stored in IndexedDB, with merge/import and file export
// (로그 기록·병합·내보내기). IndexedDB because localStorage (~5 MB) cannot hold 12 participants.
import { STORAGE_KEY, APP_VERSION } from './config.js';
import { newEvents } from './aggregate.js';

const DB_NAME = 'glovekb';
const STORE = 'events';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class Logger {
  constructor() {
    this.events = [];
    this.sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.seq = 0;
    this.db = null;
    this.persistent = false;
    this._queue = [];
    this._timer = null;
  }

  async init() {
    try {
      this.db = await openDB();
      this.events = await new Promise((resolve, reject) => {
        const req = this.db.transaction(STORE).objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      // One-time migration from the old localStorage log (v0.1)
      const old = localStorage.getItem(STORAGE_KEY);
      if (old) {
        await this._append(newEvents(this.events, parseJSONL(old)));
        localStorage.removeItem(STORAGE_KEY);
      }
      // Ask the browser not to evict our data (지속 저장 요청)
      if (navigator.storage && navigator.storage.persist) this.persistent = await navigator.storage.persist();
    } catch (e) {
      console.warn('IndexedDB unavailable; logging in memory only', e);
      this.db = null;
    }
  }

  get storageLabel() {
    if (!this.db) return '⚠ 저장소 사용 불가 — 메모리에만 기록됨, 바로 내보내세요';
    return this.persistent ? '이 브라우저(IndexedDB, 지속 저장)' : '이 브라우저(IndexedDB) — 브라우저가 지울 수 있으니 세션마다 내보내세요';
  }

  // Every event gets session id, per-session sequence number and a monotonic timestamp (ms)
  log(ev, fields = {}) {
    const e = { ev, sid: this.sessionId, n: this.seq++, t: Math.round(performance.now() * 10) / 10, ...fields };
    this.events.push(e);
    this._queue.push(e);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 250);
    return e;
  }

  startSession(fields) {
    this.log('session_start', { app: APP_VERSION, wall: new Date().toISOString(), ua: navigator.userAgent, ...fields });
  }

  flush() {
    if (!this.db || !this._queue.length) return Promise.resolve();
    const batch = this._queue.splice(0);
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const e of batch) st.add(e);
      tx.oncomplete = () => resolve();
      tx.onerror = () => { console.warn('log write failed', tx.error); resolve(); };
    });
  }

  async _append(list) {
    this.events.push(...list);
    if (!this.db || !list.length) return;
    this._queue.push(...list);
    await this.flush();
  }

  // Merge events from other devices/files; duplicates (same session + seq) are skipped
  async importEvents(list) {
    const fresh = newEvents(this.events, list);
    await this._append(fresh);
    return { added: fresh.length, skipped: list.length - fresh.length };
  }

  toJSONL(filter = () => true) {
    const rows = this.events.filter(filter);
    return rows.map(e => JSON.stringify(e)).join('\n') + (rows.length ? '\n' : '');
  }

  // pid = null exports everything
  export(pid = null) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const text = this.toJSONL(pid ? (e => e.pid === pid) : undefined);
    this.download(`glovekb_${pid || 'ALL'}_${stamp}.jsonl`, text, 'application/x-ndjson');
  }

  download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async clear() {
    this.events = [];
    this._queue = [];
    if (!this.db) return;
    await new Promise((resolve) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = tx.onerror = () => resolve();
    });
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
