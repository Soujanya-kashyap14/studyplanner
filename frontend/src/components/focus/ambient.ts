/**
 * Ambient "deep space" sound generated with the Web Audio API — brown noise
 * through a gentle low-pass with a slow swell. No audio files needed.
 */
export class AmbientSound {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;

  start(volume = 0.18) {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
    // Slow "breathing" swell on the filter cutoff.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    lfo.start();
    Object.assign(this, { ctx, gain, src, lfo });
  }

  stop() {
    if (!this.ctx || !this.gain) return;
    const ctx = this.ctx;
    this.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    const src = this.src;
    const lfo = this.lfo;
    window.setTimeout(() => {
      src?.stop();
      lfo?.stop();
      void ctx.close();
    }, 700);
    this.ctx = null;
    this.gain = null;
    this.src = null;
    this.lfo = null;
  }
}
