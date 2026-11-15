// The hand-drawn frames (src/research/art/frames/*.png, painted with lowpix's stroke brush by build_frames.py) as CSS
// variables for border-image: paper cards with tape, pinned notes, ink outlines, red stamps, keys and tabs.
import card from '../art/frames/card.png';
import note from '../art/frames/note.png';
import frame from '../art/frames/frame.png';
import stamp from '../art/frames/stamp.png';
import key from '../art/frames/key.png';
import keyhot from '../art/frames/keyhot.png';
import tab from '../art/frames/tab.png';
import tabon from '../art/frames/tabon.png';
import tag from '../art/frames/tag.png';

let done = false;
export function installFrames() {
  if (done) return; done = true;
  const r = document.documentElement.style;
  for (const [k, u] of Object.entries({ card, note, frame, stamp, key, keyhot, tab, tabon, tag })) r.setProperty('--pp-' + k, `url(${u})`);
}
