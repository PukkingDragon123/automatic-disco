# Builds the colony buildings' models with the user's lowpix tool and copies the .glb files into public/.
#   python3 src/logistics/lowpix/build_models.py [lowpix repo]   (16 model units = 1 m; the model faces +Z, the output face)
# The specs are the JSON files beside this script (hard-surface boxes, prisms and tapers, pixel-hd painted textures).
import glob, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
LOWPIX = sys.argv[1] if len(sys.argv) > 1 else '/home/user/pukkingdragon123/symmetrical-goggles'
DEST = os.path.join(HERE, '..', '..', '..', 'public', 'models', 'logistics')
TMP = os.path.join(HERE, '.out')
os.makedirs(DEST, exist_ok=True)
for spec in sorted(glob.glob(os.path.join(HERE, '*.json'))):
    kind = os.path.splitext(os.path.basename(spec))[0]
    out = os.path.join(TMP, kind)
    subprocess.run([sys.executable, '-m', 'lowpix', 'build', spec, '-o', out], cwd=LOWPIX, check=True)
    glb = glob.glob(os.path.join(out, '*.glb'))[0]
    shutil.copy(glb, os.path.join(DEST, kind + '.glb'))
    print(kind, '->', os.path.join(DEST, kind + '.glb'))
shutil.rmtree(TMP, ignore_errors=True)
