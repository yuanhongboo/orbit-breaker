export class AudioEngine {
  constructor(enabled = true) { this.enabled = enabled; this.lastShot = 0; this.lastPickup = 0; }
  unlock() {
    if (!this.enabled) return;
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* Sound is optional when an audio device is unavailable. */ }
  }
  tone(frequency, duration, type = 'sine', volume = 0.04, end = frequency) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain); gain.connect(this.ctx.destination);
    oscillator.start(now); oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  play(event) {
    if (!this.enabled) return;
    const now = performance.now();
    if (event.type === 'shot' && now - this.lastShot > 70) { this.lastShot = now; this.tone(530, 0.055, 'triangle', 0.027, 180); }
    if (event.type === 'kill') this.tone(event.boss ? 65 : 120, event.boss ? 0.65 : 0.12, 'triangle', 0.055, 35);
    if (event.type === 'pickup' && now - this.lastPickup > 100) { this.lastPickup = now; this.tone(event.heal ? 660 : 1000, 0.07, 'sine', 0.021, 1350); }
    if (event.type === 'damage') this.tone(130, 0.22, 'sawtooth', 0.035, 45);
    if (event.type === 'dash') this.tone(190, 0.2, 'triangle', 0.045, 920);
    if (event.type === 'nova') this.tone(240, 0.5, 'sine', 0.085, 40);
    if (event.type === 'level' || event.type === 'won') {
      this.tone(440, 0.3, 'sine', 0.05, 880);
      this.tone(660, 0.5, 'sine', 0.035, 1320);
    }
    if (event.type === 'boss' || event.type === 'lost' || event.type === 'timeout') this.tone(160, 0.6, 'triangle', 0.06, 55);
  }
}
