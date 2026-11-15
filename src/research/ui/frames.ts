// The machined frames (src/research/art/frames/*.png, clean pixel art painted at half resolution by build_frames.py)
// as CSS variables for border-image: steel-bezelled plates with enamel faces, red-rimmed badges, push keys, tabs,
// brass tags, a navy enamel sign, brushed riveted steel, pale plates, gunmetal decision plates, the rig's back panel
// (`cork`, kept by name) and a screw head (`pin`).
import card from '../art/frames/card.png';
import note from '../art/frames/note.png';
import frame from '../art/frames/frame.png';
import stamp from '../art/frames/stamp.png';
import key from '../art/frames/key.png';
import keyhot from '../art/frames/keyhot.png';
import tab from '../art/frames/tab.png';
import tabon from '../art/frames/tabon.png';
import tag from '../art/frames/tag.png';
import enamel from '../art/frames/enamel.png';
import metal from '../art/frames/metal.png';
import fibre from '../art/frames/fibre.png';
import canvas from '../art/frames/canvas.png';
import cork from '../art/frames/cork.png';
import pin from '../art/frames/pin.png';

let done = false;
export function installFrames() {
  if (done) return; done = true;
  const r = document.documentElement.style;
  for (const [k, u] of Object.entries({ card, note, frame, stamp, key, keyhot, tab, tabon, tag, enamel, metal, fibre, canvas, cork, pin })) r.setProperty('--pp-' + k, `url(${u})`);
}
