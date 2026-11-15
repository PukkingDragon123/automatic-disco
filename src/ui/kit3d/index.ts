// kit3d: detailed 3D hardware for UI screens (desks, glass screens, keys, knobs, a hologram emitter, holograms),
// textured at 32 px/m, lit by the scene, rendered through the engine's post pipeline (solid parts in the scene,
// holograms and light in the FX scene). See V6.md "kit3d" for the API.
export { tex32, mat32, solid, worldUV, part, canvasTex, K3, type TexKind } from './tex';
export { holoUniforms, holoMaterial, holoLineMaterial, holoify, holoSync, lightPillar, lightDust, type HoloU } from './holo';
export { consoleDesk, type Desk, type DeskOpts } from './consoleDesk';
export { glassScreen, SCR, type GlassScreen } from './glassScreen';
export { physicalKey, type PhysicalKey } from './physicalKey';
export { rotaryKnob, type RotaryKnob } from './rotaryKnob';
export { hologramEmitter, type Emitter } from './hologramEmitter';
export { Picker } from './pick';
export { techRoom } from './room';
