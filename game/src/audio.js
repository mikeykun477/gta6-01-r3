// audio.js — all sound is synthesized live with WebAudio; no audio files.
// Engine hum, sirens, gunshots, pickups and jingles, generated from oscillators.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.muted) this.stopEngine();
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }

  _noiseBuffer(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  click() { this._blip(660, 0.06, 'square', 0.08); }
  gunshot() { this._noise(0.16, 0.5, 2600); this._blip(140, 0.1, 'square', 0.2, 50); }
  enemyShot() { this._noise(0.12, 0.22, 1800); }
  hit() { this._blip(220, 0.08, 'sawtooth', 0.15, 90); }
  pickup() { this._blip(880, 0.09, 'sine', 0.18); setTimeout(() => this._blip(1320, 0.12, 'sine', 0.18), 70); }
  cash() { this._blip(990, 0.08, 'triangle', 0.2); setTimeout(() => this._blip(1480, 0.14, 'triangle', 0.2), 80); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.22), i * 110));
  }
  missionFail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.25, 'sawtooth', 0.14), i * 130)); }
  busted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'sawtooth', 0.16), i * 160)); }
  crash() { this._noise(0.3, 0.4, 700); }
  horn() { this._blip(370, 0.18, 'square', 0.1, 370); setTimeout(() => this._blip(370, 0.18, 'square', 0.1), 220); }
  doorSlam() { this._noise(0.08, 0.3, 500); }

  startEngine() {
    if (!this.ctx || this.muted || this.engineOsc) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 55;
    g.gain.value = 0.0;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    o.connect(f).connect(g).connect(this.ctx.destination);
    o.start();
    this.engineOsc = o; this.engineGain = g;
  }

  setEngine(speed01, on) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }

  stopEngine() {
    if (this.engineOsc) { try { this.engineOsc.stop(); } catch (e) {} this.engineOsc = null; this.engineGain = null; }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOn) {
      this.ensure();
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 700;
      g.gain.value = this.muted ? 0 : 0.045;
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 0.9; lg.gain.value = 260;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g).connect(this.ctx.destination);
      o.start(); lfo.start();
      this.sirenOsc = o; this.sirenGain = g; this.sirenLfo = lfo; this.sirenOn = true;
    } else if (!on && this.sirenOn) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) {}
      this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
    }
  }
}
