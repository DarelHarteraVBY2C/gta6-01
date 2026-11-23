// Solmar Bay audio: everything is synthesized with WebAudio, no audio files.
// Engine hum, police sirens, gunshots, pickups and a small sunset-drive music
// loop are all built from oscillators and filtered noise.
import { clamp } from './utils.js';

const MUSIC_NOTES = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 82.41, 73.42, 65.41, 58.27];
const MUSIC_STEP = 0.21; // seconds per 16th note at ~71 BPM

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicNextTime = 0;
  }

  /** Create the context on the first user gesture; safe to call repeatedly. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: a sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Siren: a square wave that alternates two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 660;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    const sirenFilter = this.ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1400;
    this.sirenOsc.connect(sirenFilter);
    sirenFilter.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** speedRatio 0..1 while driving; 0 silences the engine. */
  setEngine(speedRatio, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 190, t, 0.08);
    this.engineGain.gain.setTargetAtTime(throttle ? 0.05 + speedRatio * 0.075 : 0.02, t, 0.1);
  }

  /** distance in px to the nearest police car; Infinity silences the siren. */
  setSiren(distance) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gain = distance === Infinity ? 0 : clamp(1 - distance / 900, 0, 1) * 0.05;
    this.sirenGain.gain.setTargetAtTime(gain, t, 0.2);
    // Two-tone wail, flipped every beat by the music timer's step.
    const tone = (Math.floor(t * 1.6) % 2 === 0) ? 660 : 880;
    this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.05);
  }

  /** Stop the sunset-drive music loop (the radio takes over from here). */
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  /** Schedule one oscillator note at an exact time (for the radio). */
  tone(freq, when, dur, type, gainValue) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  /** Schedule a short filtered noise burst at an exact time (scanner static). */
  noiseAt(when, duration, filterFreq, gainValue) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(when);
  }

  /** Short burst of filtered noise. */
  noiseBurst(duration, filterFreq, gainValue) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  /** A short sine blip, optionally sliding from `from` to `to` Hz. */
  blip(from, to, duration, gainValue, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  gunshot() { this.noiseBurst(0.14, 900, 0.5); this.blip(160, 50, 0.12, 0.35, 'square'); }
  /** Shotgun: a deeper, longer boom than the pistol's crack. */
  shotgun() { this.noiseBurst(0.28, 520, 0.65); this.blip(120, 38, 0.22, 0.45, 'sawtooth'); }
  punch() { this.blip(120, 45, 0.1, 0.4, 'sine'); }
  pickup() { this.blip(660, 660, 0.07, 0.25); setTimeout(() => this.blip(990, 990, 0.09, 0.25), 70); }
  crash() { this.noiseBurst(0.3, 500, 0.55); this.blip(90, 35, 0.25, 0.4, 'sawtooth'); }
  uiClick() { this.blip(520, 520, 0.05, 0.2, 'square'); }
  wantedUp() { this.blip(440, 660, 0.12, 0.3, 'square'); setTimeout(() => this.blip(660, 880, 0.12, 0.3, 'square'), 110); }
  missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, n, 0.16, 0.3), i * 110));
  }
  missionFail() {
    const notes = [392, 330, 262];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, n * 0.94, 0.22, 0.28, 'triangle'), i * 150));
  }
  explosion() { this.noiseBurst(0.7, 320, 0.7); this.blip(70, 28, 0.6, 0.5, 'sawtooth'); }

  /** A quiet sunset-drive loop: bass notes with a soft kick and hat. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      while (this.musicNextTime < this.ctx.currentTime + 0.25) {
        this.scheduleMusicStep(this.musicStep, this.musicNextTime);
        this.musicStep = (this.musicStep + 1) % MUSIC_NOTES.length;
        this.musicNextTime += MUSIC_STEP;
      }
    }, 90);
  }

  scheduleMusicStep(step, when) {
    const note = MUSIC_NOTES[step];
    if (note > 0) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.11, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, when + MUSIC_STEP * 0.95);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(when);
      osc.stop(when + MUSIC_STEP);
    }
    if (step % 4 === 0) {
      // Soft kick on the beat.
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, when);
      osc.frequency.exponentialRampToValueAtTime(40, when + 0.12);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(when);
      osc.stop(when + 0.16);
    }
  }
}
