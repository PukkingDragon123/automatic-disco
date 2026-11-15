# Generates lowpix hard-surface specs for the cyborg worker parts (UNAA livery), one JSON per part.
import json, math
PAL = {"ramps": {
  "shell": ["#2b2321", "#4a3c35", "#76645a", "#a8957f", "#d2c2a4", "#efe4c8", "#fffaf0"],
  "yellow": ["#2a1c06", "#5a3a08", "#94640c", "#c99316", "#e8b428", "#f6d460", "#fff2b0"],
  "metal": ["#0f1114", "#1d2126", "#2e343b", "#454d56", "#66707b", "#8f99a3", "#c3cbd2"],
  "glow": ["#06202a", "#0c4250", "#13707e", "#22a6a8", "#58d6c8", "#a8f0e0", "#f0fff8"],
  "red": ["#2a0a0e", "#5c1219", "#9a1f26", "#d63a35", "#f2725a"],
  "warn": ["#3a2a06", "#7a5a0a", "#d9a514", "#ffd23a"],
  "rubber": ["#0b0b0d", "#18181c", "#26262c", "#383840", "#4c4c56"]}}
def enamel(ramp, tone=3.9):
  return {"ramp": ramp, "tone": tone, "dither": 0.0, "rim": {"light": 1, "dark": 1, "outline": "dark"}, "layers": [
    {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.25},
    {"id": "panel", "op": "panel", "inset": 2, "min_size": 10},
    {"id": "grime", "op": "patches", "scale": 1.8, "threshold": 0.72, "shift": -0.5, "faces": ["-top"]},
    {"id": "wear", "op": "wear", "width": 2, "density": 0.18, "ramp": "metal", "tone": 2.2, "post": True},
    {"id": "rivets", "op": "rivets", "inset": 1, "min_size": 8, "post": True}]}
STY = {
  "paint": enamel("yellow", 3.8), "shell": enamel("shell", 3.9),
  "gun": {"ramp": "metal", "tone": 2.9, "dither": 0.0, "rim": {"light": 1, "dark": 1, "outline": "dark"}, "layers": [
    {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.35}, {"id": "scuffs", "op": "wear", "width": 1, "density": 0.25, "shift": 1.2, "post": True}, {"id": "rivets", "op": "rivets", "inset": 1, "min_size": 7, "post": True}]},
  "chrome": {"ramp": "metal", "tone": 5.0, "dither": 0.0, "rim": {"light": 1, "dark": 1, "outline": "dark"}, "layers": [{"id": "streak", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.2, "shift": -1.5}]},
  "rubber": {"ramp": "rubber", "tone": 2.0, "dither": 0.0, "rim": {"light": 1, "dark": 1, "outline": "dark"}, "layers": [{"id": "ribs", "op": "stripes", "axis": "z", "period": 1.2, "width": 0.3, "shift": -0.8}]},
  "glow": {"ramp": "glow", "tone": 4.4, "light": 0.25, "dither": 0.0, "rim": {"light": 1, "dark": 0, "light_shift": 1.5}, "layers": [{"id": "hot", "op": "noise", "scale": 1.2, "amount": 0.5}]},
  "hazard": {"ramp": "warn", "tone": 2.6, "dither": 0.0, "rim": {"light": 1, "dark": 1, "outline": "dark"}, "layers": [{"id": "chev", "op": "stripes", "axis": "x", "period": 2.4, "width": 0.5, "ramp": "metal", "tone": 0.6}]},
}
def spec(name, parts, tris=900):
  return {"name": name, "description": "UNAA cyborg worker part (oddworld).", "author": "oddworld", "license": "CC0-1.0", "density": 3,
          "budget": {"tris": tris, "colors": 64}, "light": {"dir": [-0.55, 1.0, 0.7], "strength": 1.1, "gradient": 0.35, "ao": 0.9, "ao_height": 3.0},
          "render": {"background": "#20242c", "hero": [-34, 18], "shadow": 0.45}, "palette": PAL, "styles": STY, "parts": parts}
B = lambda id, size, pivot, style, **k: {"id": id, "shape": "box", "size": size, "pivot": pivot, "style": style, **k}
P = lambda id, size, pivot, style, sides=8, **k: {"id": id, "shape": "prism", "sides": sides, "size": size, "pivot": pivot, "style": style, **k}
T = lambda id, size, pivot, style, fs, **k: {"id": id, "shape": "taper", "size": size, "pivot": pivot, "style": style, "front_scale": fs, **k}
def boom(tool):
  # a turret, an upper boom and a forearm folded forward, the tool at the end (model faces +Z)
  parts = [P("turret", [7, 7, 3], [0, 1.5, 0], "gun", 10, rotation=[90, 0, 0]),
           B("base", [6, 3, 6], [0, 4, 0], "paint", chamfer=0.8),
           B("boom", [3.2, 12, 3.6], [0, 5.5, 0], "paint", chamfer=0.6, offset=[0, 6, 0], rotation=[-25, 0, 0]),
           P("elbow", [3.6, 3.6, 4.4], [0, 16.5, 5], "gun", 10, rotation=[0, 90, 0]),
           B("fore", [2.6, 2.8, 11], [0, 16.5, 5], "paint", chamfer=0.5, offset=[0, 0, 5.5], rotation=[25, 0, 0]),
           P("piston", [1.2, 1.2, 8], [0, 8, -1.6], "chrome", 6, offset=[0, 0, 4], rotation=[-55, 0, 0]),
           P("wrist", [3.0, 3.0, 2.5], [0, 12.2, 14.6], "gun", 8, rotation=[25, 0, 0])]
  w = [0, 12.2, 14.6]
  if tool == "drill":
    parts += [P("motor", [4.2, 4.2, 4], [0, 11.6, 16.2], "paint", 10, rotation=[25, 0, 0]),
              P("chuck", [2.6, 2.6, 1.6], [0, 10.8, 18.2], "gun", 8, rotation=[25, 0, 0]),
              T("bit", [2.4, 2.4, 7], [0, 9.6, 21], "chrome", [0.08, 0.08], rotation=[25, 0, 0])]
  elif tool == "saw":
    parts += [P("blade", [12, 12, 0.5], [0, 11, 19], "chrome", 18, rotation=[0, 90, 0]),
              B("guard", [1.4, 6.5, 13], [0, 14.5, 19], "hazard", chamfer=0.3), P("hub", [3, 3, 2], [0, 11, 19], "gun", 8, rotation=[0, 90, 0])]
  elif tool == "welder":
    parts += [P("bottleA", [2.6, 2.6, 8], [2.4, 14, 7], "paint", 8, rotation=[115, 0, 0]), P("bottleB", [2.6, 2.6, 8], [-2.4, 14, 7], "shell", 8, rotation=[115, 0, 0]),
              T("torch", [1.6, 1.6, 6], [0, 11.2, 17.5], "gun", [0.5, 0.5], rotation=[40, 0, 0]), P("tip", [0.9, 0.9, 1], [0, 9.2, 20], "glow", 6, rotation=[40, 0, 0]),
              B("shield", [6, 4, 0.5], [0, 13.5, 16.5], "glow", rotation=[-20, 0, 0])]
  else:
    for i, a in enumerate([0, 120, 240]):
      r = math.radians(a)
      parts += [B(f"f{i}", [1.2, 1.2, 5], [math.cos(r) * 1.4, 12.2 + math.sin(r) * 1.4, 16], "paint", chamfer=0.25, offset=[0, 0, 2.5], rotation=[25, 0, 0]),
                B(f"t{i}", [1.0, 1.0, 3.2], [math.cos(r) * 1.1, 10.4 + math.sin(r) * 1.1, 20.3], "gun", chamfer=0.2, rotation=[45, 0, 0])]
  return parts
S = {}
for t in ["drill", "saw", "welder", "gripper"]: S["cy_" + t] = spec(t.title() + " Arm", boom(t))
S["cy_cargo"] = spec("Cargo Frame", [
  B("railL", [1.2, 1.2, 22], [6, 9, 0], "gun", chamfer=0.3), B("railR", [1.2, 1.2, 22], [-6, 9, 0], "gun", chamfer=0.3),
  *[B(f"cross{i}", [13, 1.0, 1.0], [0, 9, -9 + i * 6], "gun", chamfer=0.25) for i in range(4)],
  *[B(f"post{i}", [1.0, 9, 1.0], [6 * s, 4.5, -8 if j == 0 else 8], "gun", chamfer=0.25) for i, (s, j) in enumerate([(1, 0), (-1, 0), (1, 1), (-1, 1)])],
  B("strap1", [15, 1.2, 2.6], [0, 0.6, -6], "rubber"), B("strap2", [15, 1.2, 2.6], [0, 0.6, 6], "rubber"),
  B("crateA", [7, 5, 8], [-2, 12.2, -4], "paint", chamfer=0.6), B("lid", [7.4, 0.8, 8.4], [-2, 15.1, -4], "gun"),
  B("crateB", [4.5, 4, 6], [3.5, 11.6, -3], "hazard", chamfer=0.5),
  P("drum", [6, 6, 9], [0, 12.5, 6], "shell", 12, rotation=[0, 90, 0])])
S["cy_collar"] = spec("Control Collar", [
  *[B(f"seg{i}", [4.4, 3.2, 1.8], [math.sin(math.radians(i * 36)) * 6, 6 + math.cos(math.radians(i * 36)) * 6, 0], "gun" if i % 2 else "paint", chamfer=0.4, rotation=[0, 0, -i * 36]) for i in range(10)],
  B("module", [6, 3, 5], [0, 13.2, 0], "paint", chamfer=0.7), B("vent", [4, 0.6, 3.6], [0, 15, 0], "gun"),
  P("lamp", [1, 1, 0.6], [1.5, 13.4, 2.6], "glow", 6), P("aerial", [0.4, 0.4, 7], [-2, 15, -1], "chrome", 4, rotation=[-75, 0, 0])])
S["cy_visor"] = spec("Survey Visor", [
  B("band", [14, 3, 2], [0, 6, 4], "paint", chamfer=0.6), B("sideL", [2, 3.4, 8], [7, 6, 0], "gun", chamfer=0.5), B("sideR", [2, 3.4, 8], [-7, 6, 0], "gun", chamfer=0.5),
  B("lensL", [5, 2.2, 0.8], [3.2, 6, 5.2], "glow"), B("lensR", [5, 2.2, 0.8], [-3.2, 6, 5.2], "glow"),
  B("pod", [5, 2.4, 5], [0, 9, 1], "paint", chamfer=0.6), P("eye", [2, 2, 2], [0, 9, 4.2], "glow", 8), P("aerial", [0.4, 0.4, 6], [-1.6, 10, -1], "chrome", 4, rotation=[-70, 0, 0])])
S["cy_sensor"] = spec("Sensor Mast", [
  B("pod", [9, 3.4, 7], [0, 5, 0], "paint", chamfer=0.8), P("lensL", [2.6, 2.6, 4], [2.6, 5.4, 4.5], "gun", 8), P("lensR", [2.6, 2.6, 4], [-2.6, 5.4, 4.5], "gun", 8),
  P("glassL", [2, 2, 0.6], [2.6, 5.4, 6.6], "glow", 8), P("glassR", [2, 2, 0.6], [-2.6, 5.4, 6.6], "glow", 8),
  T("fin", [0.8, 6, 6], [0, 9.6, -1], "hazard", [1, 0.4]), P("aerial", [0.4, 0.4, 9], [-3, 7, -2], "chrome", 4, rotation=[-80, 0, 0])])
S["cy_power"] = spec("Power Pack", [
  B("cell", [12, 6, 8], [0, 3, 0], "paint", chamfer=0.9), *[B(f"fin{i}", [0.5, 1.4, 7], [-4.5 + i * 1.5, 6.7, 0], "gun") for i in range(7)],
  B("gauge", [4, 2.2, 0.4], [0, 3.6, 4.1], "glow"), B("haz", [10, 1.2, 0.4], [0, 0.9, 4.1], "hazard"),
  P("port", [1.6, 1.6, 2], [4.5, 4, 4.5], "gun", 8), B("handle", [10, 0.8, 0.8], [0, 7.6, -3], "chrome")])
S["cy_hydleg"] = spec("Hydraulic Leg", [
  B("cuff", [7, 3, 7], [0, 23, 0], "gun", chamfer=1.0),
  B("thigh", [3.4, 10, 4.2], [0, 22, 0], "paint", chamfer=0.6, offset=[0, -5, 0]), P("knee", [4.4, 4.4, 5.4], [0, 12, 0], "gun", 10, rotation=[0, 90, 0]),
  B("shin", [2.8, 9.5, 3.4], [0, 12, 0], "paint", chamfer=0.5, offset=[0, -4.75, 0]), P("ankle", [3.2, 3.2, 4.2], [0, 2.8, 0], "gun", 8, rotation=[0, 90, 0]),
  P("barrel", [1.4, 1.4, 7], [0, 19, -2.6], "gun", 8, offset=[0, 0, 3.5], rotation=[90, 0, 0]), P("rod", [0.8, 0.8, 7], [0, 13, -2.4], "chrome", 6, offset=[0, 0, 3.5], rotation=[90, 0, 0]),
  T("foot", [5, 2.2, 7], [0, 1.1, 1], "gun", [0.8, 0.7], chamfer=0.4), B("sole", [5.2, 0.6, 7.4], [0, 0.3, 1], "rubber")])
S["cy_digclaw"] = spec("Digging Claws", [
  B("housing", [6, 5, 6], [0, 7, 0], "paint", chamfer=0.8), P("hub", [3, 3, 7], [0, 7, 0], "gun", 8, rotation=[0, 90, 0]),
  *[T(f"claw{i}", [1.6, 1.2, 9], [(i - 1) * 2.2, 4.5, 3], "chrome", [0.15, 0.15], rotation=[35, (i - 1) * 8, 0]) for i in range(3)]])
S["cy_plating"] = spec("Armour Plating", [
  *[B(f"plate{i}", [10, 1.2, 6], [0, 3 + i * 1.2, -5 + i * 5], "paint" if i != 1 else "hazard", chamfer=0.6, rotation=[-12, 0, 0]) for i in range(3)],
  *[P(f"bolt{i}", [0.8, 0.8, 0.6], [(-1) ** i * 4, 4.4 + (i // 2) * 1.2, -4 + (i // 2) * 5], "chrome", 6) for i in range(4)]])
S["cy_hopper"] = spec("Seed Hopper", [
  T("bin", [9, 8, 9], [0, 7, 0], "paint", [1.25, 1.25], rotation=[-90, 0, 0]), B("lid", [11, 0.8, 11], [0, 11.6, 0], "gun", chamfer=0.4),
  B("boom", [22, 1.2, 1.2], [0, 2, -7], "gun", chamfer=0.3), *[P(f"noz{i}", [0.7, 0.7, 2], [-9 + i * 3, 1, -7], "chrome", 6, rotation=[90, 0, 0]) for i in range(7)],
  B("frame", [10, 2, 10], [0, 2, 0], "gun", chamfer=0.4)])
for k, v in S.items(): json.dump(v, open(k + ".json", "w"), indent=1)
print(" ".join(S.keys()))
