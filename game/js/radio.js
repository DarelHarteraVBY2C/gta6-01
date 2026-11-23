// Solmar Bay car radio: three procedural WebAudio stations, no audio
// files. The radio only plays while Danny drives; entering a car or
// pressing R shows a HUD popup with the station name. Everything is
// guarded on the AudioContext existing — headless tests never create one
// (no user gesture), so the radio can never break boot or the tests.
//
// Stations: SOLMAR FM (synthwave: saw bass + triangle arpeggio + kick),
// BAY 98.5 (chill: sine pads + sparse plucks), SBPD SCANNER (static
// bursts + two-tone dispatch beeps, no real voice). All quiet on purpose.
import { clamp } from './utils.js';

export const STATIONS = [
  { name: 'SOLMAR FM', tag: 'Synthwave Drive', step: 0.144 },
  { name: 'BAY 98.5', tag: 'Chill Coast', step: 0.1875 },
  { name: 'SBPD SCANNER', tag: 'Dispatch', step: 0.2 },
];

// Synthwave: an eight-step bass line and a sixteen-step arpeggio.
const WAVE_BASS = [55, 0, 55, 65.41, 55, 0, 82.41, 65.41];
const WAVE_ARP = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 164.81,
  220, 261.63, 329.63, 440, 392, 329.63, 261.63, 196];
// Chill: one long Am7 pad per bar and a sparse pentatonic pluck line.
const CHILL_PAD = [110, 130.81, 164.81, 196];
const CHILL_PLUCK = [0, 220, 0, 261.63, 0, 329.63, 0, 0,
  0, 392, 0, 329.63, 0, 261.63, 0, 0];

export class Radio {
  constructor(audio) {
    this.audio = audio; // the game's AudioEngine (owns ctx + master)
    this.station = 0;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.popup = null; // {text, timer} — the HUD station card
  }

  get current() { return STATIONS[this.station]; }

  showPopup() {
    const s = this.current;
    this.popup = { text: '♪  ' + s.name + ' — ' + s.tag, timer: 2.5 };
  }

  /** Danny got in: show the station and start the music if it is off. */
  enterCar() {
    this.showPopup();
    if (this.playing) return;
    this.start();
  }

  /** Danny got out (or the car blew up): silence the radio. */
  exitCar() {
    this.stop();
  }

  start() {
    const audio = this.audio;
    if (!audio.ctx || this.playing) return;
    audio.stopMusic(); // the radio owns the music from here on
    this.playing = true;
    this.step = 0;
    this.nextTime = audio.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 90);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.playing = false;
  }

  /** Full reset for a fresh world: stop the music, clear the popup. */
  reset() {
    this.stop();
    this.popup = null;
  }

  /** R: next station, popup included. */
  cycle() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    this.showPopup();
    if (this.playing) this.nextTime = this.audio.ctx.currentTime + 0.05;
  }

  /** Tick the popup timer down (called once per simulation step). */
  update(dt) {
    if (this.popup) {
      this.popup.timer -= dt;
      if (this.popup.timer <= 0) this.popup = null;
    }
  }

  /** Schedule notes a quarter second ahead, like the music loop. */
  pump() {
    const audio = this.audio;
    if (!audio.ctx || !this.playing) return;
    const s = this.current;
    while (this.nextTime < audio.ctx.currentTime + 0.25) {
      this.scheduleStep(this.station, this.step, this.nextTime);
      this.step += 1;
      this.nextTime += s.step;
    }
  }

  scheduleStep(station, step, when) {
    const audio = this.audio;
    if (station === 0) {
      // Synthwave: saw bass, triangle arp, a plain thump on the beat.
      const bass = WAVE_BASS[step % WAVE_BASS.length];
      if (bass > 0) audio.tone(bass, when, 0.13, 'sawtooth', 0.08);
      const arp = WAVE_ARP[step % WAVE_ARP.length];
      if (arp > 0) audio.tone(arp, when, 0.12, 'triangle', 0.045);
      if (step % 4 === 0) audio.tone(120, when, 0.12, 'sine', 0.12);
    } else if (station === 1) {
      // Chill: a soft pad at the top of each bar, one pluck now and then.
      if (step % 16 === 0) {
        for (const f of CHILL_PAD) audio.tone(f, when, 1.4, 'sine', 0.035);
      }
      const pluck = CHILL_PLUCK[step % CHILL_PLUCK.length];
      if (pluck > 0) audio.tone(pluck, when, 0.3, 'triangle', 0.05);
    } else {
      // Scanner: static bursts, a two-tone beep pair, and now and then a
      // three-beep dispatch warble. No voice, just tones.
      if (step % 7 === 0) audio.noiseAt(when, 0.16, 1800, 0.05);
      if (step % 16 === 0) {
        audio.tone(880, when, 0.09, 'sine', 0.06);
        audio.tone(660, when + 0.12, 0.09, 'sine', 0.06);
      }
      if (step % 32 === 24) {
        audio.tone(990, when, 0.07, 'sine', 0.05);
        audio.tone(990, when + 0.1, 0.07, 'sine', 0.05);
        audio.tone(990, when + 0.2, 0.07, 'sine', 0.05);
      }
    }
  }
}
