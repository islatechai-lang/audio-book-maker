// Web Audio API Ambient Sound Generator
// Generates soft, calming meditation drone and gentle soundscape without any external audio files

export class AmbientAudioGenerator {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.oscillators = [];
    this.filter = null;
    this.lfo = null;
    this.volume = 0.25;
    this.destinationNode = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  getAudioNode() {
    this.initContext();
    return this.masterGain;
  }

  start() {
    if (this.isPlaying) return;
    this.initContext();
    this.isPlaying = true;

    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.001, now);
    this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 3);

    // Warm peaceful frequencies (based on 432Hz harmonic scale: A2=108Hz, E3=162Hz, A3=216Hz, C#4=270Hz)
    const freqs = [108.0, 162.0, 216.0, 270.0, 324.0];

    // Filter to keep sound gentle and warm
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(450, now);
    this.filter.Q.setValueAtTime(2.0, now);
    this.filter.connect(this.masterGain);

    // Gentle LFO filter sweep (breathing cycle: 0.08 Hz ~ 12 seconds cycle)
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.08, now);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, now);
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    // Generate harmonic drone layers
    this.oscillators = [];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      // Subtle detune for rich celestial shimmer
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 0.8, now);

      const layerGain = (0.2 / (idx + 1));
      oscGain.gain.setValueAtTime(layerGain, now);

      osc.connect(oscGain);
      oscGain.connect(this.filter);
      osc.start();
      this.oscillators.push(osc);
    });

    // Soft pink/brown noise for gentle ambient breath
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.96 * b1 + white * 0.11;
        b2 = 0.86 * b2 + white * 0.25;
        output[i] = (b0 + b1 + b2) * 0.05;
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(300, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08, now);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start();
      this.oscillators.push(noiseSource);
    } catch (e) {
      console.warn('Ambient noise creation skipped:', e);
    }
  }

  stop() {
    if (!this.isPlaying) return;
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.001, now + 1.5);
    }
    setTimeout(() => {
      this.oscillators.forEach(osc => {
        try { osc.stop(); osc.disconnect(); } catch (e) {}
      });
      if (this.lfo) {
        try { this.lfo.stop(); this.lfo.disconnect(); } catch (e) {}
      }
      this.oscillators = [];
      this.isPlaying = false;
    }, 1600);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }
}
