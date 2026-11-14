# Design pillars

ODDWORLD is a polished **base builder + Spore-like engineering game** about a living planet. The player is an
engineer: of machines, of animals, of weapons, and of the ecosystem itself. Every system should feed one of these.

0. **BIO-ENGINEERING IS THE PRODUCTION ENGINE (the core loop).** Resources come mostly from engineered plants and
   creatures, with machines supporting them. Every gene gives a FUNCTION, and designs are judged by what they do:
   - **Diggers and terraformers:** burrow, excavate, raise or lower ground, dig channels, move soil.
   - **Producers:** creatures and plants that create resources: ore-gizzard grazers that eat rock and pass
     refined ore pellets, hyperaccumulator plants that pull metal from soil, sap, oil and resin trees, silk or
     fibre glands, crystal-growing corals, milk or protein herds, biofuel algae ponds.
   - **Ecosystem changers:** species and plants that change moisture, fertility or biome (wetland makers, soil
     binders, nitrogen fixers, desert greeners, pest eaters, pollinators, decomposers).
   - **Troops, workers and farms:** engineered soldiers, haulers and operators, plus living farms (herds and
     orchards that yield on a cycle).
   - **Technology unlocks:** biotech research unlocks force-field BARRIERS, ENGINEERED HABITATS (domes or
     enclosures with controlled climate where engineered species thrive), growth vats, gene-locks against
     escape or hybridisation, and more.
1. **Base engineering.** Satisfactory-style mining, belts, power and production lines (src/factory). The base is a
   machine you design and optimise.
2. **Creature engineering.** Absorb genomes, design the best animals in the gene lab, print and breed them, put them
   to work or to war. Designs have real trade-offs (mass vs speed, armour vs upkeep, diet, climate).
3. **Weapon engineering.** Weapons are designed from parts (frame, power, barrel or emitter, ammo or payload),
   including biological parts harvested from creatures (venom glands, spines, acid sacs) and gravity tech. They
   equip the golem, robots and engineered creatures.
4. **Ecosystem engineering.** The ecosystem is a real simulation (water, soil, plants, herbivores, predators,
   decomposers, daily and seasonal cycles). The player reshapes it on purpose: dam or divert water, plant forests or
   crops, introduce or remove species, poison or fertilise land. It pays off: lure herds into kill zones, starve a
   rival base, grow carbon farms, unleash an engineered predator.
5. **Rivals.** Soviet, PRC and expedition factions compete for the same planet with the same tools.

Polish bar: everything hand-designed, readable at gameplay zoom, responsive, with hand-drawn pixel art in the
master palette (src/ui/ART.md, src/art/palette.ts).
