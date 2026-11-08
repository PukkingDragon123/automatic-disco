// Hand-pixelled icons. Each is authored as a 16 x 16 grid of palette letters (fills and internal shading only);
// a 1 px dark outline is added around every shape automatically so the whole set shares one weight.
export const PAL: Record<string, number> = {
  k: 0x0a0910, K: 0x2a2634, w: 0xf6f2e8, s: 0xc0bab0, S: 0x7a7480, e: 0x3a3446, E: 0x5c5470,
  g: 0x7affe0, G: 0x2fc49a, n: 0x166a56, m: 0x9cea8a, M: 0x2f9a5e, N: 0x1a4a36,
  v: 0xc4b4ff, V: 0x7a62e8, p: 0x3e2c88, y: 0xffe070, Y: 0xd09030, u: 0x8a5a1a,
  r: 0xff7050, R: 0xb02a2a, b: 0xeee2c4, B: 0xb0a07c, o: 0xffa040, c: 0x6ad0ff, C: 0x2a72b8, x: 0x5a2a1a, f: 0xff8ac0, F: 0xb04a80,
};

export const ICONS: Record<string, string[]> = {
  bio: [
    '................', '.......gg.......', '......gmmg......', '.....GmmmmG.....', '....GmmmmmmG....', '...GmmMggMmmG...', '...GmMgwwgMmG...', '..GmmMgwggMmmG..',
    '..GmmmMggMmmmM..', '..GmmmmMMmmmmM..', '..MGmmmmmmmmMM..', '...MGmmmmmmMM...', '....MMMMMMMM....', '.....NNNNNN.....', '................', '................'],
  min: [
    '................', '..........s.....', '.........sE.....', '.....s...sEe.s..', '....sE..sEEe.sE.', '....sEe.sEwEesEe', '...sEEe.sEEEesEe', '...sEwEesEEEeeEe',
    '..sEEEEesEEEeeEe', '..sEEEEeeEEeeeee', '..eEEEeeeEeeeee.', '..eeeEeeeeeeee..', '...eeeeeeeeee...', '....KKKKKKKK....', '................', '................'],
  charge: [
    '................', '.........vvvv...', '........vVVv....', '.......vVVv.....', '......vVVv......', '.....vVVvvvvv...', '....vvvvvVVVv...', '...vvVVVVVVv....',
    '......vVVVv.....', '.....vVVVv......', '....vVVv........', '...vVVv.........', '...vVv..........', '...vv...........', '................', '................'],
  helix: [
    '....g......y....', '....gg....yy....', '.....gg..yy.....', '......gyy.......', '......bbbb......', '.....yy..gg.....', '....yy....gg....', '....y......g....',
    '....yy....gg....', '.....yy..gg.....', '......bbbb......', '......ygg.......', '.....gg..yy.....', '....gg....yy....', '....g......y....', '................'],
  supply: [
    '................', '................', '.....bbbbbb.....', '...bbBBBBBBbb...', '..bBBnnnnnnBBb..', '..bBnGGGGGGnBb..', '..bBnGgggggnBb..', '..bBnGgwwggnBb..',
    '..bBnGgggggnBb..', '..bBnGGGGGGnBb..', '..bBBnnnnnnBBb..', '...bbBBBBBBbb...', '.....bbbbbb.....', '................', '................', '................'],
  em: [
    '................', '...VVVV..VVVV...', '..VvvvV..VvvvV..', '..VvVVV..VVVvV..', '..VvV......VvV..', '..VvV......VvV..', '..VvV..gg..VvV..', '..VvV.gwwg.VvV..',
    '..VvV.gwwg.VvV..', '..VvV..gg..VvV..', '..sss......sss..', '..sws......sws..', '..sss......sss..', '................', '................', '................'],
  // buildings
  spire: [
    '.......gg.......', '......gwwg......', '......gggg......', '.......BB.......', '......bBBb......', '.......BB.......', '......bBBb......', '......bnnb......',
    '.....bBnnBb.....', '......bnnb......', '.....bBnnBb.....', '.....bnnnnb.....', '....bBnnnnBb....', '..MM.nnnnnn.MM..', '.MmmMMMMMMMMmmM.', '................'],
  tap: [
    '................', '.......gg.......', '......gwwg......', '.....GGggGG.....', '....GmmmmmmG....', '...GmmmMMmmmG...', '...GmMMMMMMmG...', '...GmMooooMmG...',
    '...GMMooooMMG...', '....GMMMMMMG....', '.....nnnnnn.....', '...n..n..n..n...', '..n...n..n...n..', '..E..EEEEEE..E..', '.EeEEeeeeeeEEeE.', '................'],
  brood: [
    '................', '.....b....b.....', '....bB....Bb....', '...bB.gggg.Bb...', '...B.gGGGGg.B...', '..bB.GgwwgG.Bb..', '..B.gGgwwgGg.B..', '..B.gGGggGGg.B..',
    '..B.gGGGGGGg.B..', '..bB.gGGGGg.Bb..', '...B..gggg..B...', '...bBnnnnnnBb...', '..nnnGGGGGGnnn..', '.MMMMMMMMMMMMMM.', '................', '................'],
  maw: [
    '................', '................', '...b..b..b..b...', '..bB.bB.bB.bB...', '..bB.bB.bB.bBb..', '.MbBMbBMbBMbBM..', 'MMbBbbBbbBbbBMM.', 'MbBkkkkkkkkkbBM.',
    'MbkkKKggggKKkbM.', 'MbkKggwwwwggKbM.', 'MbkkKKggggKKkbM.', 'MbBkkkkkkkkkbBM.', 'MMbBbbBbbBbbBMM.', '.MMMMMMMMMMMMM..', '................', '................'],
  vault: [
    '................', '......gyyg......', '.....y.bb.g.....', '......gyyg......', '.....g.bb.y.....', '......ygg y.....', '.....y.bb.g.....', '......gyyg......',
    '.....g.bb.y.....', '......ygyg......', '.....y.bb.g.....', '......gyyg......', '....bbBBBBbb....', '...bBBBBBBBBb...', '..MMMMMMMMMMMM..', '................'],
  thorn: [
    '................', '.....b....b.....', '..b...b..b...b..', '...b..GGGG..b...', '....bGmmmmGb....', '.bbbGmmMMmmGbbb.', '....GmMggMmG....', '...bGmMggMmGb...',
    '..b.GmmMMmmG.b..', '....bGmmmmGb....', '...b..GGGG..b...', '.......nn.......', '.......nn.......', '.....MMnnMM.....', '....MMMMMMMM....', '................'],
  coil: [
    '.......vv.......', '......vwwv......', '.......vv.......', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....',
    '.....BBnnBB.....', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....', '.......nn.......', '....MMMnnMMM....', '...MMMMMMMMMM...', '................'],
  lure: [
    '................', '....ff....ff....', '...fFFf..fFFf...', '...fFFFffFFFf...', '....fFFggFFf....', '.ffffFgwwgFffff.', 'fFFFFgwyywgFFFFf', '.ffffFgwwgFffff.',
    '....fFFggFFf....', '...fFFFffFFFf...', '...fFFf.MfFFf...', '....ff..M.ff....', '........M.......', '.....MMMMMMM....', '....MMMMMMMMM...', '................'],
  spore: [
    '......gggg......', '.....gwwwwg.....', '...G.gggggg.G...', '..GmG.nnnn.GmG..', '..GmG.nnnn.GmG..', '...G..BBBB..G...', '......bBBb......', '..GG..bBBb..GG..',
    '.GmmG.bBBb.GmmG.', '..GG..bBBb..GG..', '......bBBb......', '.....bBBBBb.....', '....bBBBBBBb....', '..MMMMMMMMMMMM..', '.MMMMMMMMMMMMMM.', '................'],
  core: [
    '................', '.....eeEEe......', '...eeEEEEEEe....', '..eEEgEEEEEEe...', '.eEEEgEEEEEEEe..', '.eEEEggEEMMMEe..', 'eEEEEEgwgMmmMEe.', 'eEEEEEEgwgMMEEe.',
    'eEEEEEEEgEEEEEe.', 'eeEEEEEEgEEEEee.', '.eeEEEEEggEEee..', '..eeeEEEEgEee...', '...eeeeeeeee....', '.MMMMMMMMMMMMMM..', '................', '................'],
  // abilities
  snare: [
    '................', '.....rRRRr......', '....rRrrrRr.....', '....RrwwrrR.....', '....rRrrrRr.....', '.....rRRRr......', '..g..M.M.M..g...', '..M.M..M..M.M...',
    '..M.M.MMM.M.M...', '...MM.MmM.MM....', '....MMMmMMM.....', '.....MMmMM......', '......MmM.......', '...NNNMMMNNN....', '..NNNNNNNNNNN...', '................'],
  pulse: [
    '................', '.....vvvvvv.....', '...vv......vv...', '..v...VVVV...v..', '.v...V....V...v.', '.v..V..gg..V..v.', 'v..V..gwwg..V..v', 'v..V..gwwg..V..v',
    '.v..V..gg..V..v.', '.v...V....V...v.', '..v...VVVV...v..', '...vv......vv...', '.....vvvvvv.....', '................', '................', '................'],
  pull: [
    '................', '..rrrr....ssss..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRRrrssSSSs..', '..rRRRRRSSSSSs..',
    '...rRRRRSSSSs...', '....rrrRSsss....', '......rRSs......', '..g...........g.', '...g..g..g...g..', '....g......g....', '................', '................'],
  bloom: [
    '................', '.......mm.......', '...m...mm...m...', '....m..mm..m.....', '.....mmMMmm.....', '..mmmMMggMMmmm..', '.....mMgwgMm....', '..mmmMMggMMmmm..',
    '.....mmMMmm.....', '....m..mm..m....', '...m...mm...m...', '.......mm.......', '..MMMMMMMMMMMM..', '.MMNNNNNNNNNNMM.', '................', '................'],
  lance: [
    '...........vv...', '..........vwv...', '.........vwv....', '........vVv.....', '.......vVv......', '......vVVvv.....', '.....vvvVVv.....', '.......vVv......',
    '......vVv.......', '.....vVv........', '....gVv.........', '...ggg..........', '..ggwgg.........', '...ggg..........', '................', '................'],
  storm: [
    '................', '.....vvvvv......', '...vvV...Vvv....', '..vV..sss..Vv...', '.vV..s...s..Vv..', '.v..s..g..s..v..', 'vV.s..gwg..s.Vv.', 'v..s.gwwwg.s..v.',
    'vV.s..gwg..s.Vv.', '.v..s..g..s..v..', '.vV..s...s..Vv..', '..vV..sss..Vv...', '...vvV...Vvv....', '.....vvvvv......', '................', '................'],
  // commands
  move: [
    '................', '................', '.......gg.......', '......gwwg......', '.....gwggwg.....', '....gwggggwg....', '...gggggggggg...', '......gggg......',
    '......gggg......', '......gggg......', '......gGGg......', '......gGGg......', '......GGGG......', '................', '................', '................'],
  attack: [
    '................', '..b..........b..', '..bb........bb..', '...bb......bb...', '...bBb....bBb...', '....bBb..bBb....', '.....bBbbBb.....', '......bBBb......',
    '......bBBb......', '.....bBbbBb.....', '....rbB..Bbr....', '...rRr....rRr...', '..rRr......rRr..', '..rr........rr..', '................', '................'],
  stop: [
    '................', '.....RRRRRR.....', '....RrrrrrrR....', '...RrrrrrrrrR...', '..RrrwwwwwwrrR..', '..RrrwwwwwwrrR..', '..RrrrrrrrrrrR..', '..RrrwwwwwwrrR..',
    '..RrrwwwwwwrrR..', '..RrrrrrrrrrrR..', '...RrrrrrrrrR...', '....RrrrrrrR....', '.....RRRRRR.....', '................', '................', '................'],
  hold: [
    '................', '...BBBBBBBBBB...', '...BbbbbbbbbB...', '...BbGGGGGGbB...', '...BbGggggGbB...', '...BbGgwwgGbB...', '...BbGggggGbB...', '...BbGGGGGGbB...',
    '....BbGGGGbB....', '.....BbGGbB.....', '......BbbB......', '.......BB.......', '................', '................', '................', '................'],
  rally: [
    '................', '....gggggg......', '....gwwwwgg.....', '....gggggggg....', '....gGGGGGg.....', '....gggggg......', '....B...........', '....B...........',
    '....B...........', '....B...........', '....B...........', '...BBB..........', '..MMMMM.........', '.MMMMMMM........', '................', '................'],
  // gene categories
  'cat-body': [
    '................', '......bbbb......', '.....bBBBBb.....', '......bbbb......', '...bb.bBBb.bb...', '..bBBbbBBbbBBb..', '...bb.bBBb.bb...', '......bbbb......',
    '...bb.bBBb.bb...', '..bBBbbBBbbBBb..', '...bb.bBBb.bb...', '......bbbb......', '.......bb.......', '.......bb.......', '......b..b......', '................'],
  'cat-limb': [
    '................', '...bbbbb........', '...bBBBBb.......', '....bBBBBb......', '.....bbBBb......', '.......bBbb.....', '........bBb.....', '........bBb.....',
    '.......bBb......', '......bBb.......', '.....bBb........', '....bBBbbbb.....', '....bBBBBBBb....', '....kbkbkbk.....', '................', '................'],
  'cat-sense': [
    '................', '................', '.....ssssss.....', '...sswwwwwwss...', '..swwwccccwwws..', '.swwwcCCCCcwwws.', 'swwwcCkkkkCcwwws', 'swwwcCkwkkCcwwws',
    'swwwcCkkkkCcwwws', '.swwwcCCCCcwwws.', '..swwwccccwwws..', '...sswwwwwwss...', '.....ssssss.....', '................', '................', '................'],
  'cat-feed': [
    '................', '..RRRRRRRRRRRR..', '.Rrrrrrrrrrrrrr.', '.Rrwrwrwrwrwrrr.', '.Rrwkwkwkwkwkrr.', '.Rkkkkkkkkkkkkr.', '.Rkkkkkkkkkkkkr.', '.Rrwkwkwkwkwkrr.',
    '.Rrrwrwrwrwrwrr.', '.Rrrrrrrrrrrrrr.', '..RRRRRRRRRRRR..', '................', '................', '................', '................', '................'],
  'cat-defense': [
    '................', '.....YYYYYY.....', '...YYyyyyyyYY...', '..YyyYYYYYYyyY..', '..YyYyyyyyyYyY..', '.YyYyYYYYYYyYyY.', '.YyYyYyyyyYyYyY.', '.YyYyYyYYyYyYyY.',
    '.YyYyYyyyyYyYyY.', '.YyYyYYYYYYyYyY.', '..YyYyyyyyyYyY..', '..YyyYYYYYYyyY..', '...YYyyyyyyYY...', '.....YYYYYY.....', '................', '................'],
  'cat-meta': [
    '................', '...RR.....RR....', '..RrrR...RrrR...', '.RrwrrR.RrrrrR..', '.RrwrrrRrrrrrR..', '.RrrrrrrrrrrrR..', '.RrrrrrrrrrrrR..', '..RrrrrrrrrrR...',
    '...RrrrrrrrR....', '....RrrrrrR.....', '.....RrrrR......', '......RrR.......', '.......R........', '................', '................', '................'],
  'cat-repro': [
    '................', '.......bb.......', '.....bbwwbb.....', '....bwwwwwwb....', '...bwwbbbbwwb...', '...bwbwwwwbwb...', '..bwbwwwwwwbwb..', '..bwbwwgwwwbwb..',
    '..bwbwwwwwwbwb..', '..bBbwwwwwwbBb..', '...bBbwwwwbBb...', '...bBBbbbbBBb...', '....bBBBBBBb.....', '.....bbbbbb.....', '................', '................'],
  dna: [
    '................', '...gg......yy...', '....gg....yy....', '.....gwbbwy.....', '......gyyg......', '.....yybbgg.....', '....yy....gg....', '...yy......gg...',
    '....yy....gg....', '.....yybbgg.....', '......gyyg......', '.....gwbbwy.....', '....gg....yy....', '...gg......yy...', '................', '................'],
  tree: [
    '................', '.......gg.......', '.......gg.......', '...gg..BB..gg...', '...gg..BB..gg...', '....BBBBBBBB....', '.......BB.......', '..yy...BB...cc..',
    '..yy...BB...cc..', '...BBBBBBBBBB...', '.......BB.......', '.......BB.......', '......BBBB......', '....MMMMMMMM....', '................', '................'],
  planet: [
    '................', '.....CCCCCC.....', '...CCcccMMcCC...', '..CcccMMMMMccC..', '..CccMMMmMMccC..', '.CcccMMmmMcccMC.', '.CccccMMMcccMMC.', '.CcMMccccccMMMC.',
    '.CcMMMccccMMmMC.', '.CccMMcccccMMcC.', '..CccccMMcccccC.', '..CCccMMMMccCC..', '...CCCccccCCC...', '.....CCCCCC.....', '................', '................'],
  builder: [
    '................', '.......gg.......', '......gwwg......', '.....bbggbb.....', '....bBBBBBBb....', '...bBGGGGGGBb...', '...bBGgMMgGBb...', '...bBGMmmMGBb...',
    '....bBGMMGBb....', '....bbBGGBbb....', '...bb.bBBb.bb...', '..bb..bBBb..bb..', '..b...bBBb...b..', '.....bb..bb.....', '................', '................'],
  shape: [
    '................', '......EEEE......', '.....EsssEe.....', '....EswsssEe....', '....EsssseEe....', '.....eEEEee.....', '......g..g......', '.....g.gg.g.....',
    '................', '......uuuu......', '....uuYYYYuu....', '...uYYyyyyYYu...', '..uYyyyyyyyyYu..', '.uYYYYYYYYYYYYu.', '.uuuuuuuuuuuuuu.', '................'],
  mirror: [
    '................', '..yyyy....yyyy..', '.yykkyy..yykkyy.', '.yykkyy..yykkyy.', '..yyyymmmmyyyy..', '.mmmmmmmmmmmmmm.', 'mmmmmmmmmmmmmmmm', 'mmffmmmmmmmmffmm',
    'mmMmmmmmmmmmmMmm', 'mmmMMMMMMMMMMmmm', 'mmwwwwwwwwwwwwmm', '.mwwwwwwwwwwwwm.', '..mwwwwwwwwwwm..', '...mmmmmmmmmm...', '................', '................'],
  lode: [
    '................', '......o.....u...', '...u.....o......', '........u....o..', '................', '....ss....ss....', '....ss....ss....', '....RR....RR....',
    '....RR....RR....', '....RRr..rRR....', '.....RRRRRR.....', '......RRRR......', '................', '................', '................', '................'],
  repel: [
    '......RRRR......', '.....RRRRRR.....', '....RRr..rRR....', '....RR....RR....', '....RR....RR....', '....ss....ss....', '....ss....ss....', '................',
    '...g...gg...g...', '..g..g....g..g..', '.g............g.', 'g..g........g..g', '................', '................', '................', '................'],
  pause: [
    '................', '................', '....bbb..bbb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....',
    '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bbb..bbb....', '................', '................', '................', '................'],
  heart: [
    '................', '................', '..RRR....RRR....', '.RrrrR..RrrrR...', 'RrwwrrRRrrrrrR..', 'RrwrrrrrrrrrrR..', 'RrrrrrrrrrrrrR..', '.RrrrrrrrrrrR...',
    '..RrrrrrrrrR....', '...RrrrrrrR.....', '....RrrrrR......', '.....RrrR.......', '......RR........', '................', '................', '................'],
  skull: [
    '................', '.....bbbbbb.....', '...bbBbbbbBbb...', '..bBbbbbbbbbBb..', '..bbbbbbbbbbbb..', '..bkkkbbbbkkkb..', '..bkkkbbbbkkkb..', '..bbbbbkkbbbbb..',
    '...bbbbkkbbbb...', '....bbbbbbbb....', '....bkbkbkbk....', '.....bbbbbb.....', '................', '................', '................', '................'],
};
