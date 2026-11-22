// The people on the ground (v7): game.social (closeness), Teo Barrera at his camp, the subtitle strip, talking and
// gifts, the bond meter, and the small icon that floats over someone with something to say.
//   installSocial(game, quests) -> { social, subs, guide (after the pod is down), talk }
import * as THREE from 'three';
import type { Game } from '../game/game';
import { Social, PEOPLE } from './social';
import { Subs } from './subs';
import { Guide, GUIDE_DEF } from './guide';
import { Talk } from './talk';
import { BondMeter } from './bond';
import { portraitRenderer } from './portrait';
import { anyG } from '../research/util';
import { stepIcon } from '../story/icons';
import type { Quests } from '../story/quests';

export { Social, PEOPLE };
export interface SocialLayer { social: Social; subs: Subs; guide: Guide | null; talk: Talk | null; bond: BondMeter }

/** where Teo camps: a free spot ~10 m from the pod, toward the camera's side so the first shot holds both */
function campSpot(g: Game, pod: { x: number; z: number }): { x: number; z: number; yaw: number } {
  const G = anyG(g), R = G.region, N = R.N;
  const tries = [[7, 6], [-7, 7], [8, -4], [-6, -7], [10, 1], [1, 10]];
  for (const [dx, dz] of tries) {
    const x = Math.max(8, Math.min(N - 8, pod.x + dx)), z = Math.max(8, Math.min(N - 8, pod.z + dz));
    if (R.isWater?.(x, z)) continue;
    const f = R.freeNear?.(x, z, 4);
    const px = f ? f[0] : x, pz = f ? f[1] : z;
    if (Math.hypot(px - pod.x, pz - pod.z) < 6) continue;
    return { x: px, z: pz, yaw: Math.atan2(pod.x - px, pod.z - pz) };
  }
  return { x: pod.x + 7, z: pod.z + 6, yaw: 0 };
}

export function installSocial(g: Game, quests: Quests): SocialLayer {
  const G = anyG(g);
  const social = new Social();
  const subs = new Subs();
  const bond = new BondMeter(social);
  const L: SocialLayer = { social, subs, guide: null, talk: null, bond };
  portraitRenderer(G.engine.renderer);
  // the voices: Web Speech through the crew's cspeak when it is there
  void import('../ui/cineAudio').then((m) => {
    const cs = (m as unknown as { cspeak?: (t: string, v: unknown) => void }).cspeak;
    if (!cs) return;
    subs.voice = (who, text) => {
      const v = who === 'guide' ? GUIDE_DEF.voice : (G.crew?.member?.(who)?.voice ?? null);
      if (v) { try { cs(text, v); } catch { /* no speech */ } }
    };
  }).catch(() => { /* no cine audio */ });
  // the speaker's mouth and hands while a line plays
  subs.onLine = (who, sec) => {
    if (who === 'guide') L.guide?.speak(sec);
    else { const t = G.colony?.teammate?.(who); try { t?.crewModel?.rig?.say?.(sec); } catch { /* stand-in */ } }
  };
  quests.say = (who, lines) => subs.lines(who, lines);
  // a teammate who dies keeps their bond where it was; Teo has buried crew before
  let mourned = false;
  g.on('teammate-died', (d: { id?: string }) => {
    if (d?.id) social.gone.add(d.id);
    if (mourned) return; mourned = true;
    setTimeout(() => { subs.lines('guide', ['I am sorry, Seven. I know what that is.', 'We keep going. They would want the lights on.']); social.add('guide', 6, 'grief'); }, 9000);
  });
  // Teo's word after the colony's trouble (the director's events), and a little closeness for getting through it
  const AFTER: Record<string, string> = {
    storm: 'Storms here last. You did well to hold.', revolt: 'Workers are people too, of a kind. Mind them.', migration: 'The herds pass every few months. Learn the season.',
    envoy: 'Other programs. Careful. They are not here to share.', reactor: 'Power bites. Respect it.', disease: 'Wash everything. Twice.', signal: 'I heard that signal for years. Never found where.',
    supplycrash: 'The sky drops things. Not always what you asked for.',
  };
  g.on('story-event', (d: { id: string; phase: string }) => { if (d?.phase !== 'end' || !L.guide) return; const line = AFTER[d.id]; if (line) setTimeout(() => subs.say('guide', line), 2500); social.add('guide', 2, 'event'); });
  // the bond meter rides over the person's head
  const head = new THREE.Vector3();
  bond.anchor = (id) => {
    if (id === 'guide' && L.guide) { L.guide.head(head); head.y += 0.5; }
    else { const t = G.colony?.teammate?.(id); if (!t || !t.alive) return null; head.set(t.x, (t.y ?? G.world.surfaceY(t.x, t.z)) + 2.2, t.z); }
    const [x, y, ok] = G.screenOf(head.x, head.y, head.z);
    return ok && x > 40 && y > 80 && x < innerWidth - 40 && y < innerHeight - 40 ? [x, y] : null;
  };

  // ---------------------------------------------------------------- Teo, once the pod is down
  const spawn = (greet: boolean) => {
    if (L.guide || !G.colony) return;
    const pod = G.colony.pod;
    L.guide = new Guide(g, campSpot(g, pod));
    L.talk = new Talk(g, L.guide, social, subs);
    G.guide = L.guide; G.talk = L.talk;
    if (greet) setTimeout(() => { L.guide?.greet(pod); quests.start('q_wake'); }, 2600);
  };
  g.on('colony-ready', () => spawn(!quests.started));
  if (G.colony?.ready) queueMicrotask(() => spawn(!quests.started));

  // ---------------------------------------------------------------- clicks on Teo (before the colony's own picking)
  const cv = G.engine.canvas as HTMLCanvasElement;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || e.target !== cv || G.engine.screen !== g || !L.guide || !L.talk || L.talk.open) return;
    if (document.body.classList.contains('cine-on') || G.colony?.ctl?.k !== 'rts') return;
    if (!L.guide.hitTest(e.clientX, e.clientY)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    void L.talk.start();
  };
  addEventListener('pointerdown', down, true);
  const move = (e: PointerEvent) => { if (e.target !== cv || !L.guide) return; const on = L.guide.hitTest(e.clientX, e.clientY); cv.classList.toggle('c-talk', on); };
  addEventListener('pointermove', move, true);
  if (!document.getElementById('talk7-css')) { const s = document.createElement('style'); s.id = 'talk7-css'; s.textContent = 'canvas.c-talk { cursor: pointer; } .npc7 { position: fixed; z-index: 590; pointer-events: none; transform: translate(-50%, -100%); image-rendering: pixelated; filter: drop-shadow(0 2px 0 rgba(0,0,0,.45)); } .npc7 canvas { display: block; image-rendering: pixelated; } body.talk7 .npc7, body.cine-on .npc7 { display: none; }'; document.head.append(s); }

  // ---------------------------------------------------------------- the icon over someone with something to say
  const mark = document.createElement('div'); mark.className = 'npc7'; const mcv = document.createElement('canvas'); mark.append(mcv); document.body.append(mark); mark.style.display = 'none';
  let markKey = '', t = 0;
  G.update$?.push((dt: number) => {
    t += Math.max(dt, 1 / 120);
    L.guide?.update(Math.max(0, dt));
    const guide = L.guide; if (!guide) return;
    // what step waits on him: a word, a gift
    const act = quests.active();
    const want = act.find((a) => a.q.steps.some((s, i) => (s.k === 'talk:guide' || s.k === 'gift:guide') && a.n[i] < (s.n ?? 1)));
    const k = want ? (want.q.steps.find((s) => s.k === 'talk:guide') ? 'talk' : 'gift') : '';
    if (!k || L.talk?.open) { mark.style.display = 'none'; return; }
    if (k !== markKey) { markKey = k; const ic = stepIcon(k === 'talk' ? 'talk' : 'gift', 'guide'); mcv.width = ic.width; mcv.height = ic.height; mcv.getContext('2d')!.drawImage(ic, 0, 0); mcv.style.width = '48px'; mcv.style.height = '48px'; }
    guide.head(head); head.y += 0.7 + Math.sin(t * 3) * 0.08;
    const [x, y, ok] = G.screenOf(head.x, head.y, head.z);
    mark.style.display = ok ? '' : 'none';
    mark.style.left = Math.round(x) + 'px'; mark.style.top = Math.round(y) + 'px';
  });
  // ---------------------------------------------------------------- a cosy pod warms the crew to each other (and to you)
  let warmT = 0;
  G.update$?.push((dt: number) => {
    if (dt <= 0) return;
    warmT += dt; if (warmT < 30) return; warmT = 0;
    const h = G.podHome?.happiness?.() ?? 0;
    if (h > 20) for (const id of ['kristiansen', 'mamani']) social.add(id, h / 60, 'home');
  });
  return L;
}
