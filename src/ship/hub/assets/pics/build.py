# Build the ship's posters, prints and photos from real imagery (NASA, Wikimedia PD) and renders of our own assets.
# Each piece is composed as a physical object: poster paper with sun fading, folds, tape and pin holes; prints with a
# white border; a calendar grid; an eye chart. The image itself stays photographic (downscaled, lightly posterised
# onto a 56-colour palette so it sits in the pixel world). Output: PNG with alpha (torn corners, tape overhang).
#   python3 posters.py <raw dir> <renders dir> <out dir>
import sys, os, json, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
RAW, REN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
FONTS = "/home/user/automatic-disco/public/fonts/ui/"
TITLE = ImageFont.truetype(FONTS + "spleen-12x24.otf", 24)
BODY = ImageFont.truetype(FONTS + "DepartureMono-Regular.otf", 11)
PAPER = [(0x72, 0x69, 0x55), (0x8f, 0x85, 0x6e), (0xaa, 0x9e, 0x84), (0xc1, 0xb5, 0x9b), (0xd6, 0xca, 0xb0), (0xe5, 0xdb, 0xc3)]
INK = (0x1e, 0x23, 0x2c)

def src(name):
    for d in (RAW, REN):
        for ext in (".jpg", ".png"):
            p = os.path.join(d, name + ext)
            if os.path.exists(p): return Image.open(p).convert("RGB")
    return None

def fit(im, W, H, crop=None, focus=(0.5, 0.5)):
    """crop (fractions) then cover W x H around a focus point, downsample with a box filter, a touch of sharpening"""
    if crop: im = im.crop((int(crop[0] * im.width), int(crop[1] * im.height), int(crop[2] * im.width), int(crop[3] * im.height)))
    a = W / H
    if im.width / im.height > a:
        w = int(im.height * a); x0 = int(max(0, min(im.width - w, focus[0] * im.width - w / 2))); im = im.crop((x0, 0, x0 + w, im.height))
    else:
        h = int(im.width / a); y0 = int(max(0, min(im.height - h, focus[1] * im.height - h / 2))); im = im.crop((0, y0, im.width, y0 + h))
    im = im.resize((W * 2, H * 2), Image.LANCZOS).resize((W, H), Image.BOX)
    return im.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))

def posterise(im, n=56):
    rgb = im.convert("RGB").quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    if im.mode == "RGBA": rgb.putalpha(im.getchannel("A"))
    return rgb

def paper(W, H, seed, tint=None):
    r = random.Random(seed); P = tint or PAPER
    im = Image.new("RGBA", (W, H), P[5] + (255,)); px = im.load()
    for _ in range(W * H // 22):  # fibres: short strokes a step darker
        x, y, L = r.randrange(W), r.randrange(H), r.randrange(2, 6)
        for t in range(L):
            if 0 <= x + t < W and 0 <= y + (t >> 2) < H: px[x + t, y + (t >> 2)] = P[4] + (255,)
    return im

def text(d, s, xy, font, fill, anchor="la"):
    d.fontmode = "1"; d.text(xy, s, font=font, fill=fill, anchor=anchor)

def age(im, seed, fade=0.22, folds=True, tape=True, pins=False, torn=True):
    """sun fading from the top, a fold cross with lit and shaded creases, tape strips, a torn corner"""
    r = random.Random(seed); W, H = im.size; px = im.load(); P = PAPER
    for y in range(H):
        k = fade * (1.0 - y / H) ** 1.3 + 0.04
        for x in range(W):
            c = px[x, y]
            if c[3] == 0: continue
            g = (c[0] + c[1] + c[2]) / 3
            cc = [c[i] * (1 - k) + (g * 0.5 + P[5][i] * 0.5) * k for i in range(3)]
            px[x, y] = tuple(int(v) for v in cc) + (c[3],)
    if folds:
        fx, fy = W // 2 + r.randint(-1, 1), H // 2 + r.randint(-2, 2)
        for y in range(H):
            for (x, f) in ((fx, 1.12), (fx + 1, 0.86)):
                c = px[x, y]
                if c[3]: px[x, y] = tuple(min(255, int(v * f)) for v in c[:3]) + (c[3],)
        for x in range(W):
            for (y, f) in ((fy, 1.1), (fy + 1, 0.88)):
                c = px[x, y]
                if c[3]: px[x, y] = tuple(min(255, int(v * f)) for v in c[:3]) + (c[3],)
        # one quadrant sits a little proud of the wall and catches less light
        for y in range(fy + 2, H):
            for x in range(fx + 2, W):
                c = px[x, y]
                if c[3]: px[x, y] = tuple(int(v * 0.95) for v in c[:3]) + (c[3],)
    if torn:  # a corner torn away
        cx = r.choice([0, 1]); n = r.randint(4, 7)
        for j in range(n):
            for i in range(n - j - r.randint(0, 1)):
                x = i if cx == 0 else W - 1 - i; y = H - 1 - j
                px[x, y] = (0, 0, 0, 0)
    if tape:
        for (x0, y0, ang) in ((2, -1, -0.35), (W - 18, -1, 0.3)):
            c, s = math.cos(ang), math.sin(ang)
            for j in range(-3, 4):
                for i in range(-8, 9):
                    if abs(i) > 7 - (1 if r.random() < 0.5 else 0): continue
                    X = int(round(x0 + 8 + i * c - j * s)); Y = int(round(y0 + 3 + i * s + j * c))
                    if 0 <= X < W and 0 <= Y < H:
                        base = px[X, Y]; t = (0xde, 0xcd, 0x93) if j == -3 else (0xa9, 0x9c, 0x51) if j == 3 else (0xc5, 0xb3, 0x6e)
                        a = 0.6
                        px[X, Y] = tuple(int(base[k] * (1 - a) + t[k] * a) for k in range(3)) + (255,)
    if pins:
        for (x, y) in ((W // 2, 3),):
            px[x, y] = (0xb1, 0x3c, 0x2b, 255); px[x + 1, y] = (0x8c, 0x29, 0x20, 255); px[x, y + 1] = (0x8c, 0x29, 0x20, 255); px[x + 1, y + 1] = (0x40, 0x19, 0x13, 255)
    return im

# renders captured from the hub at 1080p: crop them to their subjects first
CROPS = {"ship": (0.3, 0.05, 0.95, 1.0), "planet": (0.15, 0.0, 0.85, 1.0), "pod2": (0.25, 0.12, 0.8, 1.0), "crew": (0.22, 0.08, 0.78, 0.92), "crew2": (0.25, 0.05, 0.75, 0.95)}
for k, box in CROPS.items():
    f = os.path.join(REN, k + "_full.png")
    if os.path.exists(f):
        im = Image.open(f).convert("RGB"); W0, H0 = im.size
        im.crop((int(box[0] * W0), int(box[1] * H0), int(box[2] * W0), int(box[3] * H0))).save(os.path.join(REN, k + ".png"))
CREDITS = {}
def save(name, im, credit=None):
    W, H = im.size; p = os.path.join(OUT, f"{name}_{W}x{H}.png"); im.save(p, optimize=True)
    if credit: CREDITS[name] = credit
    print(name, im.size, os.path.getsize(p))

# ------------------------------------------------------------------ poster layouts
def travel(name, srcname, W, H, title, sub, band, seed, crop=None, focus=(0.5, 0.5), credit=None, tcol=None):
    """full-bleed photo, a solid band at the foot with the title in Spleen and a line in Departure Mono"""
    im0 = src(srcname)
    if im0 is None: print("skip", name); return
    bh = 34 if sub else 26
    ph = posterise(fit(im0, W - 6, H - 6 - bh, crop, focus))
    im = paper(W, H, seed); im.paste(ph, (3, 3))
    d = ImageDraw.Draw(im); d.rectangle((3, H - 3 - bh, W - 4, H - 4), fill=band)
    text(d, title, (W // 2, H - 3 - bh + 4), TITLE, tcol or PAPER[5], "ma")
    if sub: text(d, sub, (W // 2, H - 3 - 12), BODY, tcol or PAPER[4], "ma")
    save(name, age(im, seed), credit)

def recruit(name, srcname, W, H, top, sub, seed, crop=None, focus=(0.5, 0.5), credit=None, col=(0x8c, 0x29, 0x20)):
    """a recruitment poster: the title across the top, the render, a slogan bar and the program line at the foot"""
    im0 = src(srcname)
    if im0 is None: print("skip", name); return
    im = paper(W, H, seed); d = ImageDraw.Draw(im)
    d.rectangle((3, 3, W - 4, 30), fill=col); text(d, top, (W // 2, 6), TITLE, PAPER[5], "ma")
    ph = posterise(fit(im0, W - 6, H - 30 - 26, crop, focus)); im.paste(ph, (3, 31))
    d.rectangle((3, H - 25, W - 4, H - 4), fill=INK); text(d, sub, (W // 2, H - 20), BODY, PAPER[5], "ma")
    save(name, age(im, seed), credit)

def plate(name, srcname, W, H, caption, seed, crop=None, focus=(0.5, 0.5), credit=None, fade=0.18, keep_colour=True):
    """a print on white stock with a caption under it (art prints, anatomy plates, charts)"""
    im0 = src(srcname)
    if im0 is None: print("skip", name); return
    cap = 16 if caption else 0
    ph = fit(im0, W - 12, H - 12 - cap, crop, focus)
    ph = posterise(ph if keep_colour else ImageEnhance.Color(ph).enhance(0.6))
    im = paper(W, H, seed); im.paste(ph, (6, 6))
    if caption: d = ImageDraw.Draw(im); text(d, caption, (W // 2, H - 6 - 12), BODY, INK, "ma")
    save(name, age(im, seed, fade=fade, folds=False, tape=True, pins=False), credit)

def photo(name, srcname, W, H, seed, crop=None, focus=(0.5, 0.5), credit=None, border=3):
    """a photo print for a frame: white border, no wear (it sits behind glass)"""
    im0 = src(srcname)
    if im0 is None: print("skip", name); return
    ph = posterise(fit(im0, W - border * 2, H - border * 2, crop, focus), 64)
    im = Image.new("RGBA", (W, H), (0xe8, 0xe4, 0xd8, 255)); im.paste(ph, (border, border))
    save(name, im, credit)

D35 = {"0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111"}
def digits(px, s, x, y, col):
    for ch in s:
        g = D35[ch]
        for j in range(5):
            for i in range(3):
                if g[j * 3 + i] == "1": px[x + i, y + j] = col + (255,)
        x += 4
def calendar(name, srcname, W, H, seed, credit=None):
    im0 = src(srcname)
    if im0 is None: print("skip", name); return
    im = paper(W, H, seed); d = ImageDraw.Draw(im)
    ph = posterise(fit(im0, W - 8, H // 2 - 4)); im.paste(ph, (4, 4))
    y0 = H // 2 + 2
    text(d, "NOV", (6, y0), TITLE, (0x8c, 0x29, 0x20))
    text(d, "2187", (W - 6, y0 + 9), BODY, INK, "ra")
    gx, gy, cw, ch = 5, y0 + 26, (W - 10) // 7, (H - y0 - 30) // 5
    for k in range(30):
        c, rr = (k + 3) % 7, (k + 3) // 7
        x, y = gx + c * cw, gy + rr * ch
        d.rectangle((x, y, x + cw - 1, y + ch - 1), outline=PAPER[3])
        digits(im.load(), str(k + 1), x + 2, y + 2, INK if c < 6 else (0x8c, 0x29, 0x20))
        if k < 14:  # the days already gone, crossed off by hand
            d.line((x + 1, y + 1, x + cw - 2, y + ch - 2), fill=(0xb1, 0x3c, 0x2b)); d.line((x + cw - 2, y + 1, x + 1, y + ch - 2), fill=(0xb1, 0x3c, 0x2b))
    save(name, age(im, seed, fade=0.12, folds=False, tape=False, pins=True, torn=False), credit)

def eyechart(name, W, H, seed):
    im = paper(W, H, seed); d = ImageDraw.Draw(im)
    big = ImageFont.truetype(FONTS + "spleen-32x64.otf", 64)
    text(d, "E", (W // 2, 4), big, INK, "ma")
    rows = [("F P", TITLE), ("T O Z", TITLE), ("L P E D", BODY), ("P E C F D", BODY), ("E D F C Z P", BODY)]
    y = 68
    for s, f in rows:
        text(d, s, (W // 2, y), f, INK, "ma"); y += 24 if f is TITLE else 13
    d.line((8, y + 2, W - 9, y + 2), fill=(0xb1, 0x3c, 0x2b))
    save(name, age(im, seed, fade=0.1, folds=False, tape=True, torn=False))

NASA = lambda nid, title: {"source": f"https://images.nasa.gov/details/{nid}", "author": "NASA", "licence": "Public domain (NASA media)", "title": title}
JPL = lambda nid, title, who="NASA/JPL-Caltech": {"source": f"https://images.nasa.gov/details/{nid}", "author": who, "licence": "Public domain (NASA/JPL media)", "title": title}
WM = json.load(open(os.path.join(os.path.dirname(RAW), "wm_credits.json")))
wm = lambda f: {"source": WM[f]["page"], "author": WM[f]["artist"], "licence": WM[f]["licence"], "title": WM[f]["title"]}
RW = {"source": "render of the game's own assets", "author": "ODDWORLD", "licence": "original"}

# posters (paper, folds, tape)
travel("earth", "GSFC_20171208_Archive_e002130", 120, 160, "EARTH", "WHERE WE STARTED", (0x1e, 0x3a, 0x72), 3, credit=NASA("GSFC_20171208_Archive_e002130", "NASA Blue Marble 2007 East"))
travel("band", "iss072e159172", 120, 160, "AURORA", "ORBIT 2140", (0x17, 0x3a, 0x25), 5, focus=(0.55, 0.55), credit=NASA("iss072e159172", "The aurora borealis blankets the Earth"))
travel("tools", "S68-49399", 120, 160, "LAUNCH", "SATURN V", (0x8c, 0x29, 0x20), 7, focus=(0.6, 0.45), credit=NASA("S68-49399", "Prelaunch - Apollo 8 (Rollout)"))
travel("reactor", "SSC-2015-00064", 160, 120, "FIRE TEST", "RS-25", (0x31, 0x26, 0x0f), 9, focus=(0.55, 0.5), credit=NASA("SSC-2015-00064", "Lighting up the Night (RS-25 test)"), tcol=(0xe9, 0xcb, 0x89))
travel("mars", "PIA23898", 160, 120, "MARS", "MOUNT SHARP", (0x77, 0x37, 0x17), 11, crop=(0.3, 0.22, 0.78, 0.84), credit=JPL("PIA23898", "A Dramatic View of Mars' Mount Sharp", "NASA/JPL-Caltech/MSSS"))
travel("saturn", "PIA11667", 120, 160, "SATURN", "EQUINOX", (0x2f, 0x1a, 0x13), 13, focus=(0.55, 0.5), credit=JPL("PIA11667", "The Rite of Spring", "NASA/JPL/Space Science Institute"))
travel("nebula", "PIA19836", 120, 160, "NGC 2174", "MONKEY HEAD", (0x36, 0x21, 0x45), 15, credit=JPL("PIA19836", "Seeing Beyond the Monkey Head"))
travel("chart", "PIA04921", 120, 160, "M31", "ANDROMEDA", (0x15, 0x26, 0x4f), 17, credit=JPL("PIA04921", "Andromeda Galaxy", "NASA/JPL/California Institute of Technology"))
travel("menu", "s09-05-0153", 120, 160, "MENU", "TRAY 3 TODAY", (0x77, 0x37, 0x17), 19, focus=(0.55, 0.5), credit=NASA("s09-05-0153", "Space Shuttle food tray"))
travel("planet", "planet", 120, 160, "NEW HOME", "KEPLER-442 B", (0x17, 0x3a, 0x25), 21, credit=RW)
recruit("unaa", "ship", 120, 160, "UNAA", "COLONY CORPS", 23, credit=RW)
recruit("safety", "pod2", 120, 160, "POD-7", "SEAL CHECK", 25, credit=RW, col=(0x99, 0x70, 0x2a))
plate("pinup", "wm_wave", 160, 120, "", 27, credit=wm("img/raw/wm_wave.jpg"), fade=0.12)
plate("firstaid", "wm_heart", 112, 150, "", 29, credit=wm("img/raw/wm_heart.png"), fade=0.1)
plate("bio", "creature", 120, 160, "", 31, credit=RW, fade=0.08) if src("creature") else travel("bio", "PIA23126", 120, 160, "NURSERY", "CEPHEUS B", (0x17, 0x3a, 0x25), 31, focus=(0.75, 0.5), credit=JPL("PIA23126", "Cepheus C and Cepheus B Region by Spitzer"))
plate("kid", "planet", 84, 108, "", 37, credit=RW, fade=0.06)
calendar("calendar", "iss072e397138", 112, 160, 33, credit=NASA("iss072e397138", "The Himalayas separate China from a cloudy India"))
eyechart("eye", 96, 160, 35)
# framed photos (behind glass)
photo("ph_earth", "PIA18033", 72, 56, 41, focus=(0.5, 0.5), credit=JPL("PIA18033", "Earth", "NASA"))
photo("ph_himal", "iss072e397138", 72, 56, 43, credit=NASA("iss072e397138", "The Himalayas separate China from a cloudy India"))
photo("ph_aurora", "iss072e159172", 56, 72, 45, credit=NASA("iss072e159172", "The aurora borealis blankets the Earth"))
photo("ph_mars", "PIA23898", 72, 56, 47, crop=(0.3, 0.3, 0.7, 0.95), credit=JPL("PIA23898", "A Dramatic View of Mars' Mount Sharp", "NASA/JPL-Caltech/MSSS"))
photo("ph_wave", "wm_wave", 72, 56, 49, credit=wm("img/raw/wm_wave.jpg"))
photo("ph_crew", "pod2", 72, 56, 51, credit=RW)
photo("ph_crew2", "planet", 56, 72, 53, credit=RW)
photo("ph_ship", "ship", 72, 56, 55, credit=RW)
json.dump(CREDITS, open(os.path.join(os.path.dirname(OUT.rstrip("/")), "pics_credits.json") if False else os.path.join(RAW, "..", "pics_credits.json"), "w"), indent=1)
