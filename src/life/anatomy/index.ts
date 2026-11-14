// ANATOMY LIBRARY (src/life/anatomy): reusable creature parts, each a hand-blocked control cage subdivided with
// creased landmarks and painted as detailed pixel art from its own rasterised anatomy. The titans (src/life/titans)
// and the sea life (src/life/fish.ts) are built from it; the procedural species (design.ts / wildDesign) and the gene
// lab can assemble new creatures from the same generators.
//
// ASSEMBLY (core.ts)
//   const body = new Body(pageSize)            one page, one skinned geometry; body.den = texels per metre requested
//   body.add(piece) / body.finalize(piece)     finalize subdivides now, so other pieces can sit on its surface
//   gridSurf(piece.m, piece.grids[0], u, v)    a point, normal and tangents on a finalized piece (u round, v along)
//   body.build({ den, maxScale, occlusion })   -> { geo (skinIndex/skinWeight on the rig), tex, tris, scale }
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
