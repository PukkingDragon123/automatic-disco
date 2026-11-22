# UI KIT (v7, UI CORE)

## Ten takeaways from shipped games (research pass)
1. **Juice is accumulation, in service of the mechanic** (Jonasson and Purho, "Juice it or lose it"; Nijman, "The Art of
   Screenshake"). No single effect sells it: many small reactions stack (a press squashes, a count rolls, a panel
   springs, dust puffs, a sound clicks). Every reaction must reinforce what the player just did.
2. **Clarity beats cool, every time** (Into the Breach, Subset Games). If a mechanic cannot be shown simply in the UI it
   is too complex; show intent and state at a glance, keep the whole picture on one screen, icons and numbers first.
3. **Players miss the hand-made warmth when UI goes flat** (Against the Storm's "flatter" interface update: players
   asked for the "handcrafted, warm feeling" back). Ornament and material are not decoration; they are the identity.
4. **The world's centre shapes the UI's geometry** (Frostpunk: radial menus round the generator; panels slide in and
   shrink away with steam hisses and clicks). Our tools live on a turret, the map in a bezel, the stores in a crate:
   each element is a designed object from the fiction, and it moves mechanically, with a recorded sound.
5. **Don't cover the play** (Timberborn feedback: info windows stacking in the centre hid the build site). HUD lives at
   the edges; context opens beside the thing, never over it; build and placement keep the centre clear.
6. **Pixel art lives on the integer grid** (common practice in pixel-art engines). One art pixel = 2 screen pixels,
   whole-number scales only, text only at the font's native sizes (Alagard 16 / 32 / 48), no resampling.
7. **Clustered, organic dithering and hue-shifted ramps make low-res read as real material** (Limbophobia's pixel.ts;
   Eastward's hand-pixelled surfaces). Never checkerboards, stripes or line patterns as texture; shadows drift cool,
   lights warm; wear is placed (chips, pits, scratches, grime low down, rust under screws).
8. **Mix 2D and 3D, render the 3D as pixel art** (Eastward fuses 2D art with 3D effects; Limbophobia's machine UI). Small
   3D models drawn at art resolution with a black ink outline, banded light and dithered colour sit inside 2D UI and
   can turn, tilt, open and animate.
9. **Ease out on arrival, overshoot a little, settle** (game-feel write-ups on tweening). Panels and icons arrive with
   ease-out and a small overshoot; presses squash then stretch; nothing snaps, nothing floats forever.
10. **Readability survives the real frame** (pixel UI readability guides). Test on the actual busy game view, not a
    blank page: ink outlines on text and icons, strong silhouettes, a limited palette, contrast checked in screenshots.

Sources: gamedeveloper.com ("Into the Breach dev on UI design: sacrifice cool ideas for the sake of clarity"),
gamejuice.pages.dev ("What Juice it or Lose it teaches us"), eremitegames.com ("Interface hotfix: we hear you"),
news.xbox.com (Frostpunk console radial design), timberborn.featureupvote.com (placement-obstructing windows),
gamedeveloper.com (Eastward / Pixpil interviews), screwloose-games pixel art guide (integer scaling).

## Modules (import from `src/ui/kit`; the full API list is in src/game/V7.md, "UI CORE")
- `px.ts` pixel buffer and primitives; `libmat.ts` every surface from the MATERIAL LIBRARY (src/gfx/mat, Limbophobia's
  textures + the sci-fi set); `mat.ts` plates (library face + bevel, ink, screws, wear), skins, shadows; `bitfont.ts` Alagard bitmap text with an 8-way ink outline.
- `model3d.ts` the 3D-in-UI renderer (toon material, black outline post, `ModelView`); `tex3d.ts` painted textures;
  `models.ts` dock, tool, crate and custom-tool models + the TOOL MODELS hook; `hardware.ts` sci-fi mechanical
  hardware (turret, cradles, docking bays, jig, gearboxes, pistons) with named moving parts.
- `juice.ts` springs, tweens, squash, pop, shake, rolling counters, particle bursts, `placeDust` and `bounce3`;
  `transitions.ts` iris, shutter, dissolve and camera swoop; `sound.ts` the recorded CC0 UI sounds;
  `floatIcon.ts` floating icon buttons; `style.ts` the CSS.
- Test pages: `?test=hud7&view=kit` (the whole kit on one sheet), `?test=hud7` (the HUD over a painted region),
  `&view=arsenal|bench|map`, `&tr=iris|shutter|dissolve|swoop&k=0.6`.
