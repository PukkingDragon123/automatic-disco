# UI art direction (applies to every screen)

The user's verdict on the current UI: "looks AI-made, too saturated; make it actually unique, higher resolution,
animated, super impressive." What reads as AI-generated, and must go:

- grids of identical framed tiles, every element the same visual weight, perfect symmetry
- saturated gold/brass and neon green everywhere; glowing outlines on everything; generic chains + padlocks
- chunky 3x pixel art where every edge is a staircase; noisy procedural "grime" with no intent
- decoration that encodes nothing (rivets in a row because rivets)

## The world it comes from

Unit 07 was designed in 1957 by the U.S. Planetary Corps. Its interface is what its engineers actually had on the
bench: **drafting paper, cyanotype blueprints, typewritten forms, rubber stamps, grease pencil, Bakelite and enamel,
punched cards, oscilloscope phosphor**. Every UI surface should be one of those real materials, used for what it was
for. Calder's handwriting appears in the margins.

## Palette (muted, physical; one accent at a time)

- Blueprint: Prussian blue `#1d3b5a` paper, white ink `#e8eef0` at 85–100%, faint grid `#2a4d70`
- Drafting paper / forms: aged off-white `#d9d2bf`, graphite `#3b3a36`, blue-line grid `#9fb4c2`
- Hardware: olive drab enamel `#4d5038`, gunmetal `#3a3d40`, chipped to bare steel `#8d8f8a`, Bakelite `#3a2418`
- Phosphor: P1 green `#7fd48a` used sparingly, at low saturation, only on actual CRT glass
- Accents (one per screen): stamp red `#b8382e`, safety amber `#d9a43a`
- No pure black, no pure white, no saturated yellow or neon

## Resolution

Draw at native device resolution: 1 art pixel = 1–2 screen pixels at 1080p (not 3x). Fine 1 px ink lines, hairline
dimension lines, small typewriter text, real halftone and paper texture. Pixel art is welcome where it is genuinely
pixel (CRT glyphs, small icons), but crisp and detailed, not chunky. Use `devicePixelRatio` for canvases.

## Motion (everything breathes a little; one orchestrated moment per action)

Ink that draws itself along a path; paper that settles with a slight curl shadow; a lamp-light gradient that drifts;
a stamp that thumps with a squash and leaves an imperfect, rotated print; a pencil that scribbles a note; CRT warm-up
and line roll; needles with overshoot; switches with travel. Respect `prefers-reduced-motion`.

## Imperfection with intent

Hand-lettered labels with slight baseline wobble; tape corners; coffee ring on one sheet (not all); a crossed-out
value with a corrected one; registration offset on stamps; uneven ink density; fold lines. Each one placed by hand,
never sprinkled randomly over everything.

## Fonts

'Pixelify' (PixelSans) body, 'Jersey' (NanoPlus) labels, 'Jacquard'/'Canned' (CannedPixels) titles, 'VT'
(RoyaltyMono) typewriter and CRT, 'Superwide' stencil headers. Hand-lettered notes may be drawn as paths.
