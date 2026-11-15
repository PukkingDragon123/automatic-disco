// The progression machines, registered in the factory's catalogue (registerBuilding) so they are placed, powered,
// targeted by raiders and inspected like every other building:
//   RESEARCH STATION  a console bank with a specimen cylinder and a dish: works the research queue while powered.
//   UPGRADER          a gantry over a parts bench: builds a blueprint from real items and installs it on the pod.
import { registerBuilding } from '../factory/defs';
import type { MG } from '../factory/models';
import { L } from '../factory/tex';
import type { Game } from '../game/game';
import { resolve, anyG } from './util';
import { BLUEPRINT, type UpgraderState } from './upgrades';
import { TECH } from './tech';

type V3 = [number, number, number];
const knob = (m: MG, c: V3, r: number, layer: number, glow = 0) => m.cyl(c, r, r * 1.2, layer, { n: 8, glow });

function stationModel(m: MG) {
  m.box([0, 0.12, 0], [2.92, 0.24, 2.92], L.CONCRETE);
  m.box([0, 0.3, 0], [2.7, 0.1, 2.7], L.GUN);
  // the console bank: three sloped desks with glass faces
  for (let k = -1; k <= 1; k++) {
    const x = k * 0.86;
    m.box([x, 0.72, 0.62], [0.78, 0.8, 0.9], L.OLIVE);
    m.box([x, 1.2, 0.84], [0.74, 0.08, 0.5], L.GUN, { rx: -0.5 });
    m.box([x, 1.48, 0.42], [0.66, 0.5, 0.06], L.GLASS, { rx: -0.2, glow: 1 });
    m.box([x, 1.48, 0.38], [0.74, 0.58, 0.04], L.GUN, { rx: -0.2 });
    for (let j = 0; j < 4; j++) knob(m, [x - 0.24 + j * 0.16, 1.24, 1.02], 0.03, j === 1 ? L.RED : L.BRASS);
  }
  // the specimen cylinder: glass over a brass base, lit from below
  m.cyl([-0.86, 0.52, -0.66], 0.42, 0.34, L.BRASS, { n: 12 });
  m.cyl([-0.86, 1.25, -0.66], 0.36, 1.1, L.GLASS, { n: 12, glow: 1 });
  m.cyl([-0.86, 1.86, -0.66], 0.42, 0.14, L.BRASS, { n: 12 });
  m.cyl([-0.86, 2.0, -0.66], 0.06, 0.2, L.COPPER, { n: 6 });
  // the dish on its mast
  m.cyl([0.86, 1.3, -0.7], 0.08, 2.0, L.STEEL, { n: 8 });
  m.box([0.86, 0.5, -0.7], [0.5, 0.4, 0.5], L.OLIVE);
  m.cyl([0.86, 2.38, -0.62], 0.62, 0.16, L.CREAM, { r1: 0.18, n: 14, axis: 'z' });
  m.cyl([0.86, 2.38, -0.36], 0.03, 0.42, L.STEEL, { n: 6, axis: 'z' });
  knob(m, [0.86, 2.38, -0.14], 0.05, L.TEAL, 1);
  // cable trunk from the bank to the cylinder
  m.cyl([0, 0.4, -0.66], 0.06, 1.7, L.COPPER, { n: 6, axis: 'x' });
  m.label([0, 0.72, 1.08], 1.2, 0.2, 'RESEARCH');
  m.lamp([1.3, 0.4, 1.3]);
}
function upgraderModel(m: MG) {
  m.box([0, 0.12, 0], [2.92, 0.24, 2.92], L.CONCRETE);
  m.box([0, 0.27, 0], [2.6, 0.06, 2.6], L.HAZARD);
  // gantry: four legs, two rails, a travelling bridge with the hoist
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.box([sx * 1.28, 1.5, sz * 1.28], [0.16, 2.5, 0.16], L.GUN); m.box([sx * 1.28, 0.36, sz * 1.28], [0.34, 0.16, 0.34], L.STEEL); }
  for (const sx of [-1, 1]) m.box([sx * 1.28, 2.78, 0], [0.18, 0.18, 2.74], L.OLIVE);
  m.box([0, 2.92, 0.2], [2.74, 0.16, 0.24], L.HAZARD);
  m.box([0.2, 2.66, 0.2], [0.42, 0.3, 0.42], L.OLIVE);
  m.cyl([0.2, 2.2, 0.2], 0.03, 0.7, L.INK, { n: 4 });
  // the hoist's tool head: a wrist and three fingers
  m.cyl([0.2, 1.78, 0.2], 0.14, 0.16, L.STEEL, { n: 8 });
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; m.box([0.2 + Math.cos(a) * 0.12, 1.6, 0.2 + Math.sin(a) * 0.12], [0.05, 0.26, 0.05], L.BRASS, { ry: -a, rz: 0.25 }); }
  // the bench with a half-built part under the head
  m.box([0, 0.66, 0.1], [1.6, 0.12, 1.0], L.STEEL);
  m.box([0, 0.46, 0.1], [1.5, 0.3, 0.9], L.OLIVE);
  m.cyl([0.2, 0.86, 0.2], 0.24, 0.28, L.COPPER, { n: 10 });
  m.box([0.2, 1.04, 0.2], [0.4, 0.08, 0.4], L.GUN);
  // parts racks and the control lectern
  m.box([-1.0, 0.86, -1.0], [0.6, 1.2, 0.4], L.GUN);
  for (let j = 0; j < 3; j++) m.box([-1.0, 0.5 + j * 0.36, -0.86], [0.56, 0.04, 0.14], L.BRASS);
  m.box([1.0, 0.7, -1.0], [0.44, 0.9, 0.4], L.OLIVE);
  m.box([1.0, 1.2, -0.92], [0.46, 0.06, 0.34], L.GUN, { rx: -0.4 });
  m.box([1.0, 1.24, -0.9], [0.32, 0.04, 0.2], L.GLASS, { rx: -0.4, glow: 1 });
  m.lamp([1.3, 0.4, 1.3]);
  m.lamp([-1.3, 3.0, -1.3]);
}
function poleModel(m: MG) {
  m.box([0, 0.14, 0], [0.96, 0.28, 0.96], L.CONCRETE);
  m.cyl([0, 0.5, 0], 0.3, 0.44, L.OLIVE, { n: 8 });
  m.cyl([0, 2.2, 0], 0.09, 3.2, L.STEEL, { n: 8 });
  for (let k = 0; k < 4; k++) m.cyl([0, 1.2 + k * 0.62, 0], 0.26 - k * 0.03, 0.06, L.COPPER, { n: 10, glow: k % 2 });
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; m.box([Math.cos(a) * 0.22, 3.55, Math.sin(a) * 0.22], [0.05, 0.4, 0.05], L.BRASS, { ry: -a, rz: 0.3 }); }
  knob(m, [0, 3.86, 0], 0.16, L.TEAL, 1);
  m.box([0, 0.5, 0.31], [0.2, 0.2, 0.02], L.HAZARD);
}

/** the state an Upgrader keeps on its factory building */
export const upState = (b: any): UpgraderState => (b.up ??= { job: null, last: null, lastT: -99 });
const powered = (b: any) => b.on !== false && (b.sat ?? 1) > 0.15;

export function registerProgressionBuildings(G: () => Game | null) {
  registerBuilding({
    kind: 'research_station', name: 'Research Station', cat: 'special', w: 3, d: 3, h: 2.6, power: 4, hp: 700, operable: true,
    cost: resolve({ 'iron_plate': 8, 'copper_wire': 10, 'glass': 4 }),
    desc: 'Turns scanned data into technology. Works the research queue while it has power; more stations research faster.',
    hooks: {
      model: stationModel,
      tick: (b) => { b.status = !powered(b) ? 'nopower' : (anyG(G()!)?.research?.queue?.length ?? 0) > 0 ? 'working' : 'idle'; b.running = b.status === 'working'; },
      inspect: () => {
        const r = anyG(G()!)?.research; if (!r) return '';
        const id = r.queue[0];
        return id ? `<div>Researching <b>${TECH[id]?.name ?? id}</b> · ${Math.round(r.headFrac() * 100)}%</div>` : '<div>Queue empty. Open the terminal [K] → RESEARCH.</div>';
      },
    },
  });
  registerBuilding({
    kind: 'upgrader', name: 'Upgrader', cat: 'special', w: 3, d: 3, h: 3.1, power: 8, hp: 800,
    cost: resolve({ 'iron_plate': 12, 'gear': 6, 'copper_wire': 8 }),
    desc: 'A gantry over a parts bench. Builds a researched blueprint from real items and installs it on the pod: plating, arm types, tools, drones.',
    hooks: {
      model: upgraderModel,
      tick: (b, dt) => {
        const st = upState(b), g = anyG(G()!);
        if (!st.job) { b.status = 'idle'; b.running = false; return; }
        if (!powered(b)) { b.status = 'nopower'; b.running = false; return; }
        b.status = 'working'; b.running = true;
        st.job.t += dt;
        if (st.job.t >= st.job.time) { const id = st.job.id; st.job = null; st.last = id; st.lastT = g?.world?.time ?? 0; g?.upgrades?.install?.(id, { x: b.x, z: b.z }); }
      },
      inspect: (b) => {
        const st = upState(b);
        return st.job ? `<div>Building <b>${BLUEPRINT[st.job.id]?.name}</b> · ${Math.round((st.job.t / st.job.time) * 100)}%</div>` : '<div>Idle. Open the terminal [K] → UPGRADER.</div>';
      },
    },
  });
}
