// A run: one planet, from impact to ascension (or extinction). Genes owned, species known, story beats.
import { Registry } from './species';
import { GENE, type Lineage } from '../life/genes';

export interface OwnedGene { id: string; level: number; from: string; at: number }
export class Run {
  readonly reg = new Registry();
  genes = new Map<string, OwnedGene>();
  flags: Record<string, number> = {};
  helix = 0;
  kills = 0; absorbed = 0;
  constructor(readonly seed: number) {}
  has(id: string) { return this.genes.has(id); }
  add(id: string, from: string, at: number): 'new' | 'up' {
    const g = this.genes.get(id);
    if (g) { g.level = Math.min(3, g.level + 1); return 'up'; }
    this.genes.set(id, { id, level: 1, from, at });
    this.absorbed++;
    return 'new';
  }
  lineages(): Set<Lineage> { const s = new Set<Lineage>(); for (const g of this.genes.keys()) { const d = GENE[g]; if (d && d.cat === 'body') s.add(d.lineage); } return s; }
  /** cross-lineage grafting: needs several lineages and a Gene Vault */
  splice(vaults: number) { const n = this.lineages().size; if (!vaults) return 0; return n >= 4 ? 2 : n >= 3 ? 1 : 0; }
}
