// ANATOMY LIBRARY (src/life/anatomy): reusable creature parts, each a hand-blocked control cage subdivided with
// creased landmarks and painted as detailed pixel art from its own rasterised anatomy. Every creature in the game is
// built from it: the titans (src/life/titans), the bestiary species and every gene-built vertebrate (vertebrate.ts
// with a recipe from src/life/species), the arthropods (arthropod.ts), serpents and gastropods (softbody.ts), the sea
// life (src/life/fish.ts). Models build in a worker pool with an IndexedDB cache (titans/async.ts); the quick build
// is the placeholder and the far LOD; the lab's part icons are built from the same generators (partPreview.ts).
//
// BUILDERS
//   vertebrate.ts buildVertebrate(design, rig, rest, VertSpec) -> { geo, tex, tris, den, fill }
//              VertSpec = { trunk: chest/barrel/waist/hips sections, neck, tail, hump; head: skull family + eyes, ears,
//              nose, teeth, tongue, whiskers, throat; legs: fore/mid/hind kinds; coat; parts: VPart[] }
//   arthropod.ts buildArthropod(design, rig, rest)   softbody.ts buildSerpent / buildGastropod
//   species/   SPECIES (the bestiary recipes as data), geneRecipe (any procedural vertebrate), recipeFor(design)
//   legs.ts    legRings(kind, fore, r, tj, segL, footH), legFoot(kind, ...): hoof, stilt, paw, bear, pillar, sprawl,
//              leap, bird, knuckle (limb.ts limb() takes 2- or 3-segment legs; hoof() a solid or cloven hoof)
//   face.ts    pupilDisc (on the pupil bone), pinna (ears), noseLeather, drawNostrils, tooth, tusk, whiskers, tongueP,
//              mouthLining, throatSac; head.ts mandible() fits a jaw under any skull's lip line
//   coat.ts    Coat: colours per zone (back, flank, belly, neck, tail, limb, sock, foot, face, muzzle, ear), pattern
//              in body space (stripes, spots, rosettes, bands, mottled, saddle, rings, flankSpots, shoulderStripes,
//              dorsal, blotches, speckle), Surf per zone (fur, scales, pebbles, folds, glands, creases, wet), socks,
//              mud, scars, ribs; coatPaint(C, part), coatSampler(C, part) (a part takes its colour from the skin)
//   vparts.ts  VPart generators: horn, ramHorns, antlers, tusks, skullCrest, helm, brow, beak, headFans, gills,
//              noseleaf, barbels, wattle, frill, eyeRows, carapace, plates, shell, crest, sail, tailFin, tailFan, club,
//              quills, spiracles, shag, mane, tuft, feathering, fleece, wings, warts, arms
//   locks.ts   locks({ seats, tiles }): hair with geometry over one shared alpha-cut atlas of drawn lock tiles
//   organs.ts  growOrgans(X): the biotech genes' organs seated on the trunk, skull and forefeet
//
// ASSEMBLY (core.ts)
//   const body = new Body(pageSize)            one page, one skinned geometry; body.den = texels per metre requested
//   body.add(piece) / body.finalize(piece)     finalize subdivides now, so other pieces can sit on its surface
//   gridSurf(piece.m, piece.grids[0], u, v)    a point, normal and tangents on a finalized piece (u round, v along)
//   body.build({ den, maxScale, occlusion, budget })   -> { geo (skinIndex/skinWeight on the rig), tex, tris, scale }
//   chainSkin(joints, bones, blend)            weights along a bone chain; addWeights(w, [[bone, k]]) mixes extras in
//   A Piece = { name, m: CM (cage), grids, levels, skin(p) -> Wt, paint(chart, piece, body), k (texel priority) }.
//
// GENERATORS (all return Pieces; sizes in metres, positions in creature space, +z forward, +y up)
//   trunk.ts   trunk({ stations: [{ c, s: [halfW, halfH], p: profile | points, tw }], tween, rings, cols, skin, paint })
//              PROFILES: round, ridge, shoulder, barrel, sag, hips, neck, flat (nine points, top of the back to the belly)
//              -> TrunkPiece with row(station) / col(point, side) to seat other parts on its landmarks
//   head.ts    skull({ skull: SKULLS.browser | grazer | brute, at, hl, hw, hh, pitch, tw, bones, paint })
//              jaw({ hinge, chin, w, h, bone }), eyeball({ c, ax, r, bone, iris, pupil: slit|bar|round|w|pin }),
//              eyelid({ c, ax, r, bone }), drawPits(px, sites) (sensory pits and rows of slit eyes)
//   limb.ts    limb({ hip, knee, sole, side, bones: { parent, up, lo, foot, flex }, rings: LIMB_TYPES.pillar|column|
//              strider(r), foot: { pad, h, toes: [{ a, len, r, claw, curl }], nail: nail|claw|hoof } })
//              -> { skin, toes, claws } pieces (bony knees, tendons, muscle bellies, lobed pads, keeled claws)
//   armour.ts  shell({ host, u, v, nu, nv, lift(a, b), ridges, rings }) any hard sheet seated on a host patch with a
//              curled rim (bands, carapaces, helms, scutes, osteoderms); plateRows(...) shingled rows; domeLift(h)
//   append.ts  horn(ctrl, r0), stalk(path, r) (tentacles, barbels, lures), fin({ roots, dirs, lens, side, ray, web })
//              (fins, sails, frills, gill fans, tail fans), sac (throat sacs, bladders), bulbs (photophores, warts,
//              barnacles), spine (quills, thorns), curve(ctrl, n)
//   growth.ts  crusts (lichen cups and barnacle clusters on a host), tree (stand-in; titans use the real flora)
//
// PAINT (paint.ts, look.ts)
//   Px.pelt (fur as broad light planes whose edges break into flames of hair along the flow), Px.locks (shingled
//   pointed locks), Px.scales, Px.pebbles, px.folds ...
//   lookPaint(Look) paints any chart from a declarative recipe: ramp + step, belly, per-material looks (mats),
//   scales { size, kind: shield|pebble|scute|keel }, fur { len, width, flow }, pebbles (hide), folds (skin creases
//   round an axis), spots, mud, lichen rosettes, scars, glints, creases (cage ink lines). For bespoke marks use Px
//   directly: px.base / px.put, px.scales, px.fur, px.pebbles, px.folds, px.spots, px.mud, px.rosettes, px.scar,
//   px.glints, px.outlineMat, px.creaseInk, then px.flush({ glow, eye }). Colours are master-palette ramp steps only;
//   the light is baked from the real normals in hard steps, with occlusion and curvature.
//   Texture density: titans ~30 texels/m on a 2048 page (the flora's 32 px/m), small fish 256, big sea life 512-1024.
export * from './core';
export * from './trunk';
export * from './head';
export * from './limb';
export * from './armour';
export * from './append';
export * from './growth';
export * from './look';
export { Px, RP, cell3 } from './paint';
export * from './legs';
export * from './face';
export * from './coat';
export * from './vparts';
export * from './locks';
export { buildVertebrate, type VertSpec, type VCtx } from './vertebrate';
export { buildArthropod } from './arthropod';
export { buildSerpent, buildGastropod } from './softbody';
