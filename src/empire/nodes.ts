// EMPIRE · the skill-tree nodes of the EMPIRE lane (spread into src/research/unlocks.ts NODES). Feature ids:
//   empire:map        the PLANET SURVEY: every region on the empire map (before it, only your own ground is charted)
//   empire:convoy     settler convoys (found an outpost next to a settlement) + empire:road (roads between settlements)
//   empire:trade      trade routes (item, amount, from, to) along roads and rail
//   empire:diplomacy  relations, gifts, trade deals, pacts and war with the rival blocs
//   empire:drop       pod drops from the ship onto any region
//   empire:rail       mag-rail (upgrade a road: faster, bigger loads)
//   empire:city       the City Charter (towns may grow into cities; the seat into the capital)
import type { UnlockNode } from '../research/unlocks';

const N = (id: string, name: string, col: number, model: string, icon: string, needs: string[], cost: Pick<UnlockNode, 'know' | 'items' | 'quest' | 'close'>, grants: string[], row = 0): UnlockNode =>
  ({ id, name, lane: 'empire', col, row, model, icon, needs, ...cost, grants });

export const EMPIRE_NODES: UnlockNode[] = [
  N('empire_survey', 'Planet Survey', 2, 'st_relay', 'globe', ['dock_research'], { know: { geo: 4 }, items: { copper_wire: 2 } }, ['empire:map']),
  N('empire_convoy', 'Settler Convoy', 4, 'ship_cargo', 'crate', ['empire_survey', 'dock_build'], { know: { geo: 8, bio: 4 }, items: { iron_plate: 6, 'plank|wood': 8 }, close: ['guide', 2] }, ['empire:convoy', 'empire:road']),
  N('empire_trade', 'Trade Routes', 5, 'b:signpost', 'belt', ['empire_convoy', 'cat_logistics'], { know: { geo: 10 }, items: { iron_rod: 6 } }, ['empire:trade']),
  N('empire_envoy', 'Diplomacy', 5, 'dish', 'telescope', ['empire_survey', 'dock_ship'], { know: { xeno: 6 }, close: ['guide', 2] }, ['empire:diplomacy'], 1),
  N('empire_charter', 'City Charter', 6, 'b:messhall', 'heart', ['empire_trade', 'cat_habitat'], { know: { bio: 10, geo: 10 }, items: { iron_plate: 12, glass: 4 }, close: ['mamani', 2] }, ['empire:city'], 1),
  N('empire_rail', 'Mag-Rail', 7, 'b:belt', 'nodes', ['empire_trade', 'steam'], { know: { energy: 18, geo: 14 }, items: { steel_beam: 4, iron_rod: 10 } }, ['empire:rail']),
  N('empire_drop', 'Pod Drops', 8, 'dock_ship', 'drone', ['empire_convoy', 'ship_hangar'], { know: { energy: 14, xeno: 6 }, items: { circuit: 3 } }, ['empire:drop'], 1),
];
