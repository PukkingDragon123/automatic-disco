// Radio intercepts: enemy chatter Unit 07's receiver picks up, shown as typed subtitles under a stencilled tag
// ("[CONCORD NET] Unit Granite-4: deposit secured"), and the Austral's warnings when a wave is coming (a relay toast;
// the old story's Calder dialog when that legacy story runs).
import type { Game } from '../game';
import type { FactionId } from './plan';
import { FACTION_TAG } from './plan';
import { el, ui, toast } from '../../ui/kit';
import { sfx } from '../../audio/audio';

export type RadioEv = 'land' | 'deposit' | 'build' | 'wave' | 'raid' | 'sighted' | 'lost' | 'hit' | 'vsOther' | 'chatter' | 'eliminated' | 'exhausted' | 'arty' | 'truce' | 'refused' | 'capture' | 'leave';
const CALL: Record<FactionId, string[]> = {
  soviet: ['Unit Granite-4', 'Column Bastion-2', 'Base {B}', 'Armour group Tern', 'Battery Anvil-1', 'Drone Kite-7', 'Coordinator Varga'],
  prc: ['Unit Tidewater-7', 'Station {B}', 'Scout Skiff-3', 'Raid group Reef-2', 'Tower Lantern-6', 'Mech Breaker-4', 'Compliance officer Hale'],
  expedition: ['Party leader', 'Camp {B}', 'Rifleman Ortega', 'Engineer Halvorsen', 'Radio op Pell'],
};
const LINES: Record<FactionId, Partial<Record<RadioEv, string[]>>> = {
  // the Eurasian Concord: a disciplined bloc that works to a directive and says so
  soviet: {
    land: ['Touchdown confirmed. The Concord holds this ground.', 'Lander down. Deploying the base to directive.'],
    deposit: ['Deposit secured. Drilling begins.', 'Ore seam claimed. Output starts on the hour.', 'Rig {N} turning. The directive quota will be met.'],
    build: ['Assembly hall complete. Production to schedule.', 'Bunker poured. The perimeter holds.', 'Battery in position. Firing tables loaded.', 'Structure complete, Coordinator.'],
    wave: ['Column, advance. Target the UNAA works.', 'All units forward. Break their production.', 'Heavy group moving out. Steady pace, keep formation.', 'The directive calls for an offensive. Advance.'],
    sighted: ['UNAA pod sighted. Stationary. Logging it.', 'Enemy industry spotted, grid {G}.', 'Their conveyors run like ours. Somebody copied somebody.'],
    lost: ['We have lost a structure. Rebuild to directive.', 'Rig {N} is silent. Send a repair crew.', 'Bunker destroyed! Reinforce the line.'],
    hit: ['The base is under fire!', 'Contact at the perimeter!'],
    vsOther: ['Consortium units at our deposit. Engage them.', 'The Consortium depot is weak. Take it.', 'The Consortium has overreached. Push them back.'],
    chatter: ['Morning report: output at one hundred and four percent.', 'Granite-4, your treads are leaking oil again.', 'This weather is worse than the polar test range.', 'Reminder: contact with the native fauna is prohibited.', 'Rations cut to two meals. Morale holding.'],
    eliminated: ['Base {B} is lost... all units, the directive has failed...', 'Lander destroyed. Units, scatter... no response...'],
    exhausted: ['Deposit exhausted. Moving the rig.'],
    arty: ['Battery, fire for effect.', 'Shells away. Correct ten metres left.'],
  },
  // the Pacific Rim Consortium: a corporate bloc that counts everything
  prc: {
    land: ['Landing successful. Quarterly targets are within reach.', 'Station down. Expand at once.'],
    deposit: ['New deposit claimed. Expansion ahead of schedule.', 'Mining point {N} established. Keep moving.', 'Another seam is ours. The board will be pleased.'],
    build: ['Workshop running. Send more troopers.', 'Watchtower raised. We see everything.', 'Construction complete. Next site.'],
    wave: ['Raid group, move out. Hit their miners and belts.', 'Swarm, go wide. Circle their flank.', 'Their supply lines are long. Cut them.'],
    raid: ['Flank route clear. Strike the belts.', 'Raiders in position. Their workers are unguarded.'],
    sighted: ['UNAA base sighted, grid {G}. Lightly guarded.', 'Enemy conveyor line spotted. Marking it for the raid.', 'I see the UNAA pod. It is building.'],
    lost: ['Mining point lost! Rebuild farther out.', 'Tower down. Reposition the scouts.'],
    hit: ['Station under attack!', 'Hostiles at the workshop!'],
    vsOther: ['Concord column near our deposits. Harass them.', 'The Concord is slow. Strike their rigs.', 'Concord bunker spotted. Avoid it, take their ore.'],
    chatter: ['Production up again. Log it with the station.', 'Skiff-3, stop chasing the animals.', 'Compliance review at twenty hundred hours.', 'Our rigs outnumber theirs three to one.', 'Dust storm forecast tonight. Secure the tarpaulins.'],
    eliminated: ['Station {B} destroyed... all units, return... return...', 'We have lost the station. Signal fading...'],
    exhausted: ['Point {N} empty. Find the next seam.'],
  },
  expedition: {
    land: ['Down safe. Unload the team.', 'Camp {B}, we are on the ground. Rifles out.'],
    wave: ['Engineers, with me. We take their gear.', 'Move on their works. Quietly.'],
    capture: ['Got one! Wire it to our band.', 'It is ours now. Next.'],
    truce: ['Pleasure doing business, Unit Seven. We will keep to our side.', 'Deal. We will pack up when the hold is full.'],
    refused: ['Have it your way. Rifles up.', 'No deal. Then we take what we came for.'],
    leave: ['Pulling out. This rock is not worth it.', 'Lift-off in sixty. Everybody aboard.'],
    lost: ['We lost the tent! Fall back to the lander!'],
    chatter: ['Coffee is cold again.', 'Anybody else hear that thing breathing at night?', 'Ortega, quit polishing the rifle.'],
    eliminated: ['Lander is gone... we are stranded... '],
  },
};

export class Radio {
  private box: HTMLDivElement | null = null;
  private queue: { tag: string; who: string; text: string; f: FactionId | 'calder' }[] = [];
  private showT = 0; private gap = 0;
  private last = new Map<string, number>();
  muted = false;
  constructor(private g: Game) {}

  /** a line from a faction's net about an event (rate-limited per faction and event) */
  say(f: FactionId, ev: RadioEv, vars: { B?: string; N?: string | number; G?: string } = {}, cool = 25) {
    if (this.muted) return;
    const k = f + ev, now = this.g.world.time;
    if (now - (this.last.get(k) ?? -1e9) < cool) return;
    const pool = LINES[f][ev]; if (!pool?.length) return;
    this.last.set(k, now);
    const fill = (s: string) => s.replace('{B}', (vars.B ?? 'Base').toString()).replace('{N}', String(vars.N ?? Math.ceil(Math.random() * 9))).replace('{G}', vars.G ?? '?');
    const who = fill(CALL[f][Math.floor(Math.random() * CALL[f].length)]);
    this.push(FACTION_TAG[f], who, fill(pool[Math.floor(Math.random() * pool.length)]), f);
  }
  push(tag: string, who: string, text: string, f: FactionId | 'calder') {
    if (this.queue.length > 4) this.queue.shift();
    this.queue.push({ tag, who, text, f });
  }
  /** the warning voice: the Austral's lead scientist over the relay (the legacy story's Calder when it runs) */
  calder(text: string, expr: 'surprised' | 'think' | 'happy' | 'sad' = 'surprised') {
    const st = this.g.story as any;
    if (st && st.calder && !st.calder.dead && st.beat !== 'opening' && st.beat !== 'wake') { st.say([{ text, expr }]); return; }
    toast(`<b>DR. SOLANO · AUSTRAL</b> · ${text}`, 'story', 6500);
    sfx('open', 1, 0.4);
  }
  update(dt: number) {
    this.gap -= dt;
    if (this.showT > 0) { this.showT -= dt; if (this.showT <= 0) this.hide(); return; }
    if (this.gap > 0 || !this.queue.length) return;
    const m = this.queue.shift()!;
    this.show(m.tag, m.who, m.text, m.f);
  }
  private show(tag: string, who: string, text: string, f: FactionId | 'calder') {
    if (!this.box || !this.box.isConnected) {
      this.box = el('div', 'fx-radio', ui());
      this.box.style.cssText = 'position:fixed;left:50%;bottom:calc(5px * var(--s, 1));transform:translateX(-50%);width:max-content;max-width:min(36vw, 640px);pointer-events:none;z-index:19;' +
        'background:rgba(20,22,27,0.82);border-top:1px solid #3b3a36;border-bottom:1px solid #3b3a36;padding:5px 12px 6px;text-align:center;transition:opacity 300ms steps(4)';
    }
    const col = f === 'soviet' ? '#c8693a' : f === 'prc' ? '#6fb3aa' : f === 'expedition' ? '#c9a464' : '#d9d2bf';
    this.box.innerHTML = '';
    const t = el('span', '', this.box, `[${tag}]`);
    t.style.cssText = `font-family:'Superwide','VT',monospace;font-size:11px;letter-spacing:2px;color:${col};border:1px solid ${col};padding:1px 5px 0;margin-right:8px;display:inline-block;transform:rotate(-1.2deg);opacity:0.92`;
    const w = el('span', '', this.box, who + ': ');
    w.style.cssText = "font-family:'VT',monospace;font-size:15px;color:#bdb59f";
    const s = el('span', '', this.box, '');
    s.style.cssText = "font-family:'VT',monospace;font-size:15px;color:#e2dbc6";
    this.box.style.opacity = '1';
    // the line types itself out like a teleprinter
    let i = 0;
    const tick = () => { if (!this.box || this.box.style.opacity === '0') return; i += 2; s.textContent = text.slice(0, i); if (i < text.length) setTimeout(tick, 28); };
    tick();
    this.showT = 2.4 + text.length * 0.05;
    sfx('click', 2.4, 0.25);
  }
  private hide() { if (this.box) this.box.style.opacity = '0'; this.gap = 1.2; }
  dispose() { this.box?.remove(); this.box = null; }
}
