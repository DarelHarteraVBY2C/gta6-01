/**
 * TouchControls — light on-screen controls for touch devices only.
 *
 * DOUBLE GATE, so desktop never sees this at all:
 *   1. JS gate here: the DOM is only built when the device reports a
 *      coarse pointer or real touch points. On a desktop (pointer: fine,
 *      maxTouchPoints 0) the constructor returns before creating any node.
 *   2. CSS gate in style.css: `.touch-overlay` is `display: none` unless
 *      `@media (pointer: coarse)` matches.
 * The dossier screenshots are taken in a desktop Playwright context, so the
 * overlay can never appear in them.
 *
 * Controls (lightweight, no new input plumbing — the stick writes the same
 * `game.keys` object the keyboard writes, and the buttons call the same
 * methods the keys call):
 *   - virtual stick (left): push up = gas, down = brake/reverse,
 *     left/right = steer. Works on foot too (walk direction).
 *   - SHOOT (right, big): same as pressing Space.
 *   - RADIO (right): same as pressing R — switch station.
 *   - E (right, small): same as pressing E — enter/exit a car.
 */
export class TouchControls {
  constructor(game) {
    this.game = game;
    if (!TouchControls.supported()) return; // desktop: build nothing
    this.build();
  }

  /** True only on a real touch device. */
  static supported() {
    const coarse = window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;
    return !!coarse || navigator.maxTouchPoints > 0;
  }

  build() {
    const overlay = document.createElement('div');
    overlay.className = 'touch-overlay';
    overlay.id = 'touch-overlay';

    const stick = document.createElement('div');
    stick.className = 'touch-stick';
    stick.id = 'touch-stick';
    const knob = document.createElement('div');
    knob.className = 'touch-knob';
    stick.appendChild(knob);
    overlay.appendChild(stick);

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    const shoot = this.makeButton('touch-shoot', 'touch-btn-shoot', 'SHOOT',
      () => this.game.tryShoot());
    const radio = this.makeButton('touch-radio', 'touch-btn-radio', 'RADIO',
      () => this.game.radioKey());
    const enter = this.makeButton('touch-enter', 'touch-btn-enter', 'E',
      () => this.game.interactKey());
    buttons.append(shoot, radio, enter);
    overlay.appendChild(buttons);

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.bindStick(stick, knob);
  }

  makeButton(id, cls, label, action) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.className = 'touch-btn ' + cls;
    btn.textContent = label;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      action();
    });
    return btn;
  }

  /** Drag the stick: direction sets w/a/s/d in game.keys; release clears. */
  bindStick(stick, knob) {
    // Read game.keys at event time, not at bind time: the object only
    // exists once the Game constructor has finished.
    const steer = (e) => {
      const keys = this.game.keys;
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = 'translate(' + (dx * 34) + 'px,' + (dy * 34) + 'px)';
      keys.w = dy < -0.35;
      keys.s = dy > 0.35;
      keys.a = dx < -0.35;
      keys.d = dx > 0.35;
    };
    const release = () => {
      const keys = this.game.keys;
      knob.style.transform = 'translate(0px, 0px)';
      keys.w = false;
      keys.s = false;
      keys.a = false;
      keys.d = false;
    };
    stick.addEventListener('pointerdown', (e) => {
      // Capture keeps the drag alive outside the stick on real touch
      // pointers; synthetic pointers have no active id, so ignore that.
      try { stick.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
      steer(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.buttons) steer(e);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
  }
}
