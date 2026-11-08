type Handler = (...args: any[]) => void;

/** Minimal typed-ish event bus used across systems. */
export class Emitter {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler): () => void {
    let s = this.map.get(ev);
    if (!s) { s = new Set(); this.map.set(ev, s); }
    s.add(fn);
    return () => s!.delete(fn);
  }
  once(ev: string, fn: Handler) {
    const off = this.on(ev, (...a) => { off(); fn(...a); });
    return off;
  }
  emit(ev: string, ...args: any[]) {
    const s = this.map.get(ev);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(...args); } catch (e) { console.error(`[event ${ev}]`, e); }
    }
  }
}

export const bus = new Emitter();
