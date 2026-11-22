// THE FIRST HOUR, as quests (v7). Each quest teaches ONE system, given by someone on the ground: Teo Barrera (the
// stranded explorer, 'guide'), or a teammate by crew id. Steps are short and mostly icons; rewards are knowledge,
// real items and closeness. Lines go to the subtitle strip (src/social/subs.ts) when a quest starts and ends.
//   step kinds (counted from game events by src/story/quests.ts):
//     talk:<npc>   gift:<npc>   scan (new things)   sample   sample:creature   open:<screen>   unlock:<node>
//     unlocks (any node)   enter:pod   decor (any piece)   decor:<id>   build (any building)   build:<cat>
//     order (a teammate)   place:<struct>   fit (an arm or drone)   know:<kind> (lifetime data)   close:<npc>
//     event:<story event id>
import type { DataKind } from '../research/tech';

export interface Step { k: string; n?: number; icon: string; text: string }
export interface Reward { know?: Partial<Record<DataKind, number>>; items?: Record<string, number>; close?: Record<string, number>; morale?: number }
export interface QuestDef {
  id: string; title: string; giver: string; icon: string;
  steps: Step[];
  reward: Reward;
  /** what the giver says when it starts / ends (one or two short lines each) */
  start: string[]; done: string[];
  /** quests that start when this one is done */
  next?: string[];
  /** only offered once this node is owned / this quest done */
  after?: { node?: string; quest?: string; close?: [string, number]; event?: string };
}
const Q = (q: QuestDef) => q;

export const QUESTS: QuestDef[] = [
  Q({ id: 'q_wake', title: 'STILL ALIVE', giver: 'guide', icon: 'talk',
    steps: [{ k: 'talk:guide', icon: 'talk', text: 'Teo' }],
    reward: { close: { guide: 4 } },
    start: ['Easy. Easy now. You came down hard, little machine.', 'Over here. By the fire.'],
    done: ['Teo Barrera. UNAA Pathfinder, survey lead. Six years down here.', 'They sent a pod. Of course they did. No crew of their own to lose.'],
    next: ['q_look'] }),
  Q({ id: 'q_look', title: 'LOOK AROUND', giver: 'guide', icon: 'lens',
    steps: [{ k: 'scan', n: 3, icon: 'lens', text: 'Scan' }],
    reward: { know: { bio: 3, geo: 3 }, close: { guide: 2 } },
    start: ['That lens of yours still works? Point it at things. Plants, rock, the beasts.', 'Knowing is the only money down here.'],
    done: ['Good. Now you have something to think with.', 'Study it. Learn one thing at a time. That is how I lived.'],
    next: ['q_study'] }),
  Q({ id: 'q_study', title: 'FIRST STUDY', giver: 'guide', icon: 'flask',
    steps: [{ k: 'open:research', icon: 'flask', text: 'Research' }, { k: 'unlock:tool_sampler', icon: 'vial', text: 'Sampler' }],
    reward: { close: { guide: 3 } },
    start: ['Everything you do, you learn first. Nothing comes free.', 'Start small. A sampler.'],
    done: ['See? One new trick. There are a thousand more.'],
    next: ['q_sample', 'q_home'] }),
  Q({ id: 'q_sample', title: 'A TASTE', giver: 'guide', icon: 'vial',
    steps: [{ k: 'sample', n: 3, icon: 'vial', text: 'Sample' }],
    reward: { know: { bio: 6 }, items: { fruit: 4 } },
    start: ['Take a bit of everything. Leaf, soil, rock.'],
    done: ['Keep those. I learned to eat most of this. The rest learned to eat me.'],
    next: ['q_gift'] }),
  Q({ id: 'q_home', title: 'A ROOF', giver: 'kristiansen', icon: 'bunk',
    steps: [{ k: 'enter:pod', icon: 'hatch', text: 'Pod' }, { k: 'decor', n: 1, icon: 'bunk', text: 'Build' }],
    reward: { close: { kristiansen: 6, mamani: 6 }, morale: 6 },
    start: ['The pod is a wreck inside. We sleep in it tonight anyway.', 'Make it liveable, Seven. Anything.'],
    done: ['Better. Much better. Thank you.'],
    next: ['q_cosy'] }),
  Q({ id: 'q_cosy', title: 'NEST', giver: 'mamani', icon: 'plant',
    steps: [{ k: 'decor', n: 3, icon: 'plant', text: 'Decor' }],
    reward: { close: { mamani: 8, kristiansen: 4 }, morale: 8, know: { bio: 4 } },
    start: ['Could we have something living in here? Just one plant?'],
    done: ['It already feels like ours.'],
    after: { quest: 'q_home' } }),
  Q({ id: 'q_gift', title: 'OLD HABITS', giver: 'guide', icon: 'gift',
    steps: [{ k: 'gift:guide', n: 1, icon: 'gift', text: 'Teo' }],
    reward: { close: { guide: 6 }, items: { iron_plate: 8, iron_rod: 6 } },
    start: ['Six years of the same roots. If you find anything sweet...'],
    done: ['Fruit. Real fruit. Here, take some of the Pathfinder\'s plate. I have no use for it.'],
    next: ['q_ground'] }),
  Q({ id: 'q_ground', title: 'BREAK GROUND', giver: 'guide', icon: 'hammer',
    steps: [{ k: 'unlock:dock_build', icon: 'hammer', text: 'Build' }, { k: 'build', n: 1, icon: 'crate', text: 'Raise' }],
    reward: { know: { geo: 6 }, close: { guide: 4 } },
    start: ['You can\'t live in a crater. Lay something down. A store, a frame, anything.'],
    done: ['There it is. An empire starts with one ugly box.'],
    next: ['q_orders', 'q_spark', 'q_life'] }),
  Q({ id: 'q_orders', title: 'ORDERS', giver: 'kristiansen', icon: 'arms',
    steps: [{ k: 'order', n: 2, icon: 'boot', text: 'Orders' }],
    reward: { close: { kristiansen: 10 } },
    start: ['Point and we go, Seven. Right-click where you want us.'],
    done: ['Understood. We work for you now. Use us well.'] }),
  Q({ id: 'q_spark', title: 'SPARK', giver: 'guide', icon: 'bolt',
    steps: [{ k: 'know:energy', n: 8, icon: 'bolt', text: 'Energy' }],
    reward: { items: { copper_wire: 8 }, close: { guide: 4 } },
    start: ['The vents breathe heat. The crystals hum. Read them: there is power in this ground.'],
    done: ['Now you know where the power sleeps. Wake it.'],
    next: ['q_relay'] }),
  Q({ id: 'q_life', title: 'LIFE SIGNS', giver: 'mamani', icon: 'dna',
    steps: [{ k: 'sample:creature', n: 2, icon: 'paw', text: 'Creature' }],
    reward: { know: { bio: 8 }, close: { mamani: 10 } },
    start: ['Their tissue, Seven! Two different animals. Please be gentle.'],
    done: ['Look at those cells. We need a real lab for this.'] }),
  Q({ id: 'q_relay', title: 'CALL HOME', giver: 'guide', icon: 'dish',
    steps: [{ k: 'unlock:pod_relay', icon: 'nodes', text: 'Relay' }, { k: 'place:relay', icon: 'dish', text: 'Raise' }],
    reward: { close: { guide: 8 }, know: { xeno: 4 } },
    start: ['My radio died in year two. Yours can reach the ship. Raise a mast.'],
    done: ['Static. Then voices. I had forgotten how they sound.'],
    after: { close: ['guide', 1] } }),
  Q({ id: 'q_mourn', title: 'REMEMBER', giver: 'guide', icon: 'photo',
    steps: [{ k: 'decor:photo', icon: 'photo', text: 'Photo' }],
    reward: { close: { guide: 10 }, morale: 12 },
    start: ['Put their picture somewhere you will see it. I did that for mine.'],
    done: ['They are still part of the place now. That helps. Some.'],
    after: { event: 'fallen' } }),
];
export const QUEST: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
