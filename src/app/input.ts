// Keyboard / mouse state shared by screens. UI elements stop propagation for their own clicks.
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mx = 0; my = 0;
  /** buttons held: 0 left, 1 middle, 2 right */
  buttons = new Set<number>();
  wheel = 0;
  /** pointer is over the game canvas (not UI) */
  overCanvas = false;
  focused = true;
  private listeners: ((e: KeyboardEvent) => void)[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      for (const l of this.listeners) l(e);
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); this.focused = false; });
    addEventListener('focus', () => { this.focused = true; });
    addEventListener('pointermove', (e) => { this.mx = e.clientX; this.my = e.clientY; this.overCanvas = e.target === canvas; });
    canvas.addEventListener('pointerdown', (e) => { this.buttons.add(e.button); });
    addEventListener('pointerup', (e) => { this.buttons.delete(e.button); });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mouseleave', () => { this.overCanvas = false; });
  }
  down(k: string) { return this.keys.has(k); }
  hit(k: string) { return this.pressed.has(k); }
  onKey(f: (e: KeyboardEvent) => void) { this.listeners.push(f); return () => { this.listeners = this.listeners.filter((x) => x !== f); }; }
  /** call at the end of each frame */
  endFrame() { this.pressed.clear(); this.wheel = 0; }
}
