// Species: a design with an owner and a place in the family tree. Models are built on first use and shared.
import { pheno, type Design, type Pheno } from '../life/design';
import { buildSpeciesModel, type SpeciesModel } from '../life/creatureMesh';

export type Faction = 'wild' | 'veyr' | 'rival' | 'soviet' | 'prc' | 'expedition';

export class Species {
  private _model: SpeciesModel | null = null;
  readonly pheno: Pheno;
  alive = 0; total = 0; kills = 0;
  /** seconds since run start when it appeared */
  born = 0;
  extinct = false;
  constructor(readonly id: number, readonly design: Design, readonly owner: Faction, readonly parent: number | null, public role = '') {
    this.pheno = pheno(design);
  }
  get model(): SpeciesModel { return this._model ??= buildSpeciesModel(this.design); }
  get name() { return this.design.name; }
}

export class Registry {
  list: Species[] = [];
  add(d: Design, owner: Faction, parent: number | null, role = '', born = 0) {
    const s = new Species(this.list.length, d, owner, parent, role);
    s.born = born;
    this.list.push(s);
    return s;
  }
  get(id: number) { return this.list[id]; }
}
