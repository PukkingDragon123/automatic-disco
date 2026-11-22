// TALKING TO TEO (v7). Click him: the camera eases in to a two-shot over the pod's shoulder, he turns and says his
// line on the subtitle strip, and up to four choices float under it: TALK (what he knows; closeness once a day),
// GIVE (an item from the stores: what he likes counts double, what he loves more), and LEAVE. A quest step that
// wants a word with him counts here. Closeness gains show on the bond meter (src/social/bond.ts).
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Guide } from './guide';
import type { Social } from './social';
import type { Subs, Choice } from './subs';
import { anyG, have } from '../research/util';
import { ITEMS, itemIcon } from '../factory/items';
import { uiSfx } from '../ui/kit/sound';

/** what Teo says when there is nothing new, by how close you are */
const CHAT: string[][] = [
  ['Hm. You again.', 'Watch the beasts at dusk. They get bold.', 'Don\'t drink from the pools that steam.'],
  ['The Pathfinder came down sixty kilometres east. I walked the rest.', 'Crystal hums before a storm. Learn to listen for it.', 'Four of us lived through the landing. I buried three.'],
  ['You think differently from the old units. Slower. Kinder.', 'Ivalu reminds me of my sister. Don\'t tell her.', 'Most of what I know I learned by getting it wrong.'],
  ['I stopped counting days in year three. You made me start again.', 'If they recall you, I would like to come. If there is room.', 'I kept the Pathfinder\'s log. All of it. You can have it, one day.'],
  ['You are the closest thing to family I have left down here.', 'Whatever comes next, we face it together, eh?'],
];
const LORE_GAIN = 2;
const day = (g: Game) => Math.floor((anyG(g).world?.time ?? 0) / 600);

export class Talk {
  open = false;
  private camSave: { goal: THREE.Vector3; dist: number; yaw: number; minDist: number } | null = null;
  private loreDay = -1; private giftsToday = 0; private giftDay = -1;
  constructor(readonly g: Game, readonly guide: Guide, readonly social: Social, readonly subs: Subs) {}
  private G() { return anyG(this.g); }
  /** frame him and the pod (or his camp) */
  private shot(on: boolean) {
    const cam = this.G().cam; if (!cam) return;
    if (on) {
      this.camSave = { goal: cam.goal.clone(), dist: cam.distGoal, yaw: cam.yawGoal, minDist: cam.minDist };
      const pod = this.G().colony?.pod;
      const x = this.guide.x, z = this.guide.z;
      const mx = pod ? x * 0.7 + pod.x * 0.3 : x, mz = pod ? z * 0.7 + pod.z * 0.3 : z;
      cam.minDist = 6; cam.lookAt(mx, mz); cam.distGoal = 11;
      // look across: from the pod's side toward him
      if (pod) cam.yawGoal = Math.atan2(pod.x - x, pod.z - z) + 0.55;
    } else if (this.camSave) {
      cam.lookAt(this.camSave.goal.x, this.camSave.goal.z); cam.distGoal = this.camSave.dist; cam.yawGoal = this.camSave.yaw; cam.minDist = this.camSave.minDist; this.camSave = null;
    }
  }
  /** start a conversation (a click on him) */
  async start() {
    if (this.open || this.subs.choosing) return;
    this.open = true; this.guide.busy = true;
    document.body.classList.add('talk7');
    uiSfx('open', 0.6);
    const pod = this.G().colony?.pod;
    const a = this.guide.actor;
    if (a.full === 'sit') a.full = '';
    if (pod) a.face(pod.x, pod.z);
    this.shot(true);
    const Q = this.G().quests;
    try {
      // a quest step that wanted a word with him
      const wanted = Q?.active?.().some((x: any) => x.q.steps.some((s: any) => s.k === 'talk:guide'));
      if (wanted) { Q.hit('talk:guide'); await this.wait(); }
      else this.subs.say('guide', this.chatLine());
      await this.wait();
      for (let loop = 0; loop < 6 && this.open; loop++) {
        const opts: Choice[] = [{ icon: 'brain', label: 'TALK' }, { icon: 'crate', label: 'GIVE' }, { icon: 'telescope', label: 'LEAVE' }];
        const i = await this.subs.choose(opts);
        if (i === 0) { this.lore(); await this.wait(); }
        else if (i === 1) { const gave = await this.give(); if (!gave) continue; await this.wait(); }
        else break;
      }
    } finally { this.end(); }
  }
  private chatLine() { const L = CHAT[Math.min(CHAT.length - 1, this.social.level('guide'))]; return L[Math.floor(Math.random() * L.length)]; }
  private lore() {
    const d = day(this.g);
    this.subs.say('guide', this.chatLine());
    if (this.loreDay !== d) { this.loreDay = d; this.social.add('guide', LORE_GAIN, 'talk'); }
  }
  /** the gift row: what is in the stores, what he likes first */
  private async give(): Promise<boolean> {
    const S = this.social;
    const ids = Object.keys(ITEMS).filter((id) => have(this.g, id) > 0).sort((a, b) => S.likes('guide', b) - S.likes('guide', a)).slice(0, 5);
    if (!ids.length) { this.subs.say('guide', 'Nothing to spare? Keep it then.'); return true; }
    const imgs = await Promise.all(ids.map((id) => new Promise<HTMLImageElement>((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(im); im.src = itemIcon(id, 32); })));
    const opts: Choice[] = ids.map((id, i) => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; if (imgs[i].naturalWidth) c.drawImage(imgs[i], 0, 0, 32, 32); return { icon: cv, label: String(have(this.g, id)) }; });
    opts.push({ icon: 'telescope', label: 'BACK' });
    const i = await this.subs.choose(opts);
    if (i < 0 || i >= ids.length) return false;
    const id = ids[i];
    if (!this.g.factory?.take?.(id, 1)) return false;
    const d = day(this.g); if (this.giftDay !== d) { this.giftDay = d; this.giftsToday = 0; }
    this.giftsToday++;
    const like = S.likes('guide', id), tired = this.giftsToday > 3 ? 0.3 : 1;
    const gain = Math.round((like >= 3 ? 8 : like === 2 ? 4 : 2) * tired);
    S.add('guide', gain, 'gift');
    this.G().quests?.hit?.('gift:guide');
    uiSfx(like >= 2 ? 'confirm' : 'pluck', 0.7);
    this.guide.actor.gesture(like >= 3 ? 'present' : 'nod');
    this.subs.say('guide', like >= 3 ? 'For me? ...Thank you. Truly.' : like === 2 ? 'That I can use. Thank you.' : tired < 1 ? 'Enough, enough. Keep the rest.' : 'Hm. A strange gift. I will find a use.');
    return true;
  }
  private wait() { return new Promise<void>((res) => { const t = setInterval(() => { if (!this.subs.busy || !this.open) { clearInterval(t); res(); } }, 120); }); }
  end() {
    if (!this.open) return;
    this.open = false; this.guide.busy = false; this.subs.clear();
    document.body.classList.remove('talk7');
    this.shot(false);
    uiSfx('close', 0.5);
    this.guide.goHome();
  }
}
