"""Node and tile art for the progression screens, painted by the user's lowpix tool.

Each icon's shapes (src/research/ui/icons.ts, exported as JSON) become a lowpix sprite spec: rectangles and polygons
as bevelled plates, strokes as tubes, glints as hand-placed pixels, cut-outs as subtractions, in two materials (a
steel body and an amber accent). lowpix paints them flat (clean, quantised light, no brush strokes) with a sel-out
outline; this script packs the results
into one 8 x 8 atlas of 48 px cells (icons.png). The screens recolour it per state (phosphor, amber, dim).

  python3 src/research/art/build_icons.py <icon_art.json> [only,names]
"""
import json, sys, os
sys.path.insert(0, '/home/user/pukkingdragon123/symmetrical-goggles')
from lowpix.sprite import render_sprite  # noqa: E402
from PIL import Image  # noqa: E402

K = 2  # source grid 24 -> 48 px
MATS = {
    'steel': {'base': '#9aa3a0', 'steps': 8, 'spec': 1, 'texture': 'metal', 'contrast': 1.15, 'rim': 0.4},
    'dark': {'base': '#5b625f', 'steps': 7, 'texture': 'metal'},
    'accent': {'base': '#d9a43a', 'steps': 7, 'spec': 1, 'hue_shift': 0.06},
}

# realistic material colours per icon: body, dark parts, accent, and the brush texture of the body
STEEL = ('#9aa3a0', '#5b625f', '#d9a43a', 'metal')
THEME = {
    'sprout': ('#6f9e45', '#5a4a34', '#8a6a3c', 'organic'), 'wheat': ('#c9a24a', '#7a6232', '#e0c070', 'organic'),
    'roots': ('#8a6a44', '#5a4430', '#6f9e45', 'wood'), 'spore': ('#9ab45a', '#5d7a3a', '#d6e08a', 'organic'),
    'tree': ('#5f8f3e', '#6a4a30', '#7a5a3a', 'organic'), 'globe': ('#4f86a8', '#2f5a76', '#6f9e45', 'liquid'),
    'resin': ('#8a5a34', '#5e3c22', '#e0a040', 'wood'), 'fibre': ('#b8a878', '#7a6a48', '#6f9e45', 'cloth'),
    'log': ('#8a5a34', '#5e3c22', '#c9a070', 'wood'), 'sapling': ('#6f9e45', '#5a4430', '#7a5a3a', 'organic'),
    'drop': ('#5f9ec0', '#3a6a8a', '#cfe8f0', 'liquid'), 'pond': ('#4f8fa0', '#2f5a66', '#7fb05a', 'liquid'),
    'bubbles': ('#8ab0a0', '#5a7a6a', '#7a5a3a', 'liquid'), 'dna': ('#b8c4c8', '#6a7478', '#d0607a', 'crystal'),
    'flask': ('#c8d4d8', '#7a868a', '#7fd48a', 'crystal'), 'vial': ('#c8d4d8', '#7a868a', '#d06a8a', 'crystal'),
    'heart': ('#b84a4a', '#7a2a2a', '#e07070', 'organic'), 'brain': ('#d49a9a', '#9a6060', '#e8c0b0', 'organic'),
    'muscle': ('#b86a5a', '#7a3a32', '#d89a8a', 'organic'), 'claw': ('#8a8278', '#5a5248', '#e0d6c0', 'stone'),
    'cross': ('#d8d4c8', '#9a968a', '#c04040', 'cloth'), 'shield': ('#8a9a94', '#55605c', '#6fb07a', 'metal'),
    'regrow': ('#c06a6a', '#7a3a3a', '#6f9e45', 'organic'), 'socket': ('#6a7068', '#3a4038', '#d9a43a', 'metal'),
    'chip': ('#3f7a4a', '#24452a', '#d9b45a', 'metal'), 'flame': ('#e07a2a', '#a04018', '#f6d060', 'liquid'),
    'blast': ('#e0702a', '#a03a18', '#f8e080', 'liquid'), 'furnace': ('#8a5a4a', '#5a3a30', '#f0a040', 'stone'),
    'battery': ('#b87a4a', '#6a4430', '#8ae07a', 'metal'), 'steam': ('#9aa3a0', '#5b625f', '#e8ece8', 'metal'),
    'rods': ('#7a8088', '#4a5058', '#7fe0d0', 'metal'), 'gauge': ('#b89a5a', '#6a5a38', '#e05040', 'metal'),
    'core': ('#7a6aa8', '#4a3a78', '#8ae0e0', 'crystal'), 'pole': ('#b87a4a', '#6a4430', '#e0e0d0', 'metal'),
    'switch': ('#5a5e5a', '#34383a', '#e0a040', 'metal'), 'capacitor': ('#b87a4a', '#6a4430', '#7fd4c0', 'metal'),
    'arcs': ('#7fc8e0', '#4a8aa0', '#e8f8ff', 'crystal'), 'drill': ('#9aa3a0', '#5b625f', '#e0b040', 'metal'),
    'lens': ('#b89a5a', '#6a5a38', '#9ad0e0', 'metal'), 'pick': ('#8a8f8c', '#7a5a3a', '#b0b6b2', 'metal'),
    'shaft': ('#7a7268', '#4a4238', '#e0a040', 'stone'), 'ingot': ('#d0a040', '#8a6a28', '#f0d890', 'metal'),
    'slag': ('#6a625a', '#3a3430', '#e08030', 'stone'), 'wrench': ('#9aa3a0', '#5b625f', '#c04040', 'metal'),
    'bolt': ('#9aa3a0', '#5b625f', '#d9a43a', 'metal'), 'moon': ('#c8c8b8', '#8a8a7a', '#d9c870', 'stone'),
    'factory': ('#9a5a44', '#5a3a30', '#c8c0a8', 'stone'), 'gear': STEEL, 'cog': STEEL,
    'belt': ('#4a4a48', '#2a2a28', '#c8a040', 'leather'), 'crate': ('#a07a48', '#6a4a2a', '#d9a43a', 'wood'),
    'piston': ('#9aa3a0', '#5b625f', '#d9a43a', 'metal'), 'telescope': ('#9aa3a0', '#5b625f', '#d9a43a', 'metal'),
    'armsocket': ('#8a8f88', '#4a504a', '#d9a43a', 'metal'), 'arm': ('#a8a090', '#5e584c', '#d9a43a', 'metal'),
    'arms': ('#a8a090', '#5e584c', '#d9a43a', 'metal'), 'drone': ('#9aa3a0', '#5b625f', '#d0503a', 'metal'),
    'swarm': ('#9aa3a0', '#5b625f', '#d0503a', 'metal'), 'hive': ('#6a9a8a', '#3a6a5a', '#e0c060', 'crystal'),
    'nodes': ('#5a9a6a', '#2f5a3a', '#e0c060', 'metal'), 'sensor': ('#9aa3a0', '#5b625f', '#7fd4c0', 'metal'),
    'template': ('#d8d0b8', '#9a927a', '#4a7aa0', 'cloth'), 'auto': ('#6a9aa0', '#3a6268', '#e0c060', 'metal'),
}

def mats_for(name):
    body, dark, acc, tex = THEME.get(name, STEEL)
    return {
        'steel': {'base': body, 'steps': 8, 'spec': 1, 'texture': tex, 'contrast': 1.15, 'rim': 0.4},
        'dark': {'base': dark, 'steps': 7, 'texture': tex},
        'accent': {'base': acc, 'steps': 7, 'spec': 1, 'hue_shift': 0.05},
    }

def spec_for(ops, name=''):
    shapes = []
    for i, o in enumerate(ops):
        k = o[0]
        if k == 'r':
            _, x, y, w, h, t = o
            pts = [[x * K, y * K], [(x + w) * K, y * K], [(x + w) * K, (y + h) * K], [x * K, (y + h) * K]]
            shapes.append({'type': 'polygon', 'points': pts, 'material': mat(t), 'form': 'bevel', 'bevel': 2 if min(w, h) > 2 else 1,
                           'bias': bias(t), 'part': f'p{i}', 'z': i, 'edge': {'light': 1, 'dark': -1}})
        elif k == 'p':
            _, pts, t = o
            shapes.append({'type': 'polygon', 'points': [[px * K, py * K] for px, py in pts], 'material': mat(t), 'form': 'pillow',
                           'bevel': 3, 'bias': bias(t), 'part': f'p{i}', 'z': i, 'edge': {'light': 1, 'dark': -1}})
        elif k == 'l':
            _, x0, y0, x1, y1, t = o
            shapes.append({'type': 'stroke', 'points': [[(x0 + 0.5) * K, (y0 + 0.5) * K], [(x1 + 0.5) * K, (y1 + 0.5) * K]], 'width': 2.6,
                           'material': mat(t), 'form': 'cylinder', 'bias': bias(t), 'part': f'p{i}', 'z': i})
        elif k == 'c':
            _, x, y, w, h = o
            shapes.append({'type': 'polygon', 'points': [[x * K, y * K], [(x + w) * K, y * K], [(x + w) * K, (y + h) * K], [x * K, (y + h) * K]],
                           'material': 'steel', 'subtract': True, 'z': i})
    # glints last: two-texel hand-placed highlights
    for o in ops:
        if o[0] == 'x':
            _, x, y, t = o
            col = '#fff6dc' if t == 4 else '#ffe4a0'
            shapes.append({'type': 'pixels', 'at': [x * K, y * K], 'art': ['ab', 'b.'], 'key': {'a': col, 'b': '#d8dccf' if t == 4 else '#f0c060'}, 'z': 999})
    return {'size': [48, 48], 'paint': 'flat', 'materials': mats_for(name), 'shapes': shapes, 'outline': 'selout', 'inner': 'shade'}

def mat(t):
    return 'accent' if t >= 5 else ('dark' if t == 1 else 'steel')

def bias(t):
    return {1: -1, 2: 0, 3: 1, 4: 2, 5: 0, 6: 1}.get(t, 0)

def main():
    art = json.load(open(sys.argv[1]))
    only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    here = os.path.dirname(os.path.abspath(__file__))
    names = [n for n in art if art[n]]
    cols = 8
    atlas = Image.new('RGBA', (cols * 48, ((len(names) + cols - 1) // cols) * 48), (0, 0, 0, 0))
    index = {}
    for j, n in enumerate(names):
        if only and n not in only:
            continue
        try:
            img = render_sprite(spec_for(art[n], n), seed=j)
        except Exception as e:  # keep going: a broken icon falls back to the canvas painter
            print('FAIL', n, e)
            continue
        atlas.paste(img, ((j % cols) * 48, (j // cols) * 48))
        index[n] = j
        print('ok', n, flush=True)
    out = os.path.join(here, 'icons.png' if not only else 'icons_test.png')
    atlas.save(out)
    json.dump({'cell': 48, 'cols': cols, 'index': index}, open(os.path.join(here, 'icons.json' if not only else 'icons_test.json'), 'w'))
    print('wrote', out)

if __name__ == '__main__':
    main()
