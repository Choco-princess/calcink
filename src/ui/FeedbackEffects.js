export class FeedbackEffects {
  constructor() {
    this.soundEnabled = false;
    this.hapticsEnabled = 'vibrate' in navigator;
    this.audio = null;
  }

  setSound(enabled) {
    this.soundEnabled = enabled;
    if (enabled) this.ensureAudio();
  }

  ensureAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    try { if (!this.audio) this.audio = new Audio(); }
    catch { return null; }
    if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
    return this.audio;
  }

  play(correct) {
    if (this.hapticsEnabled) {
      try { navigator.vibrate?.(correct ? 8 : 15); } catch {}
    }
    if (!this.soundEnabled) return;
    const audio = this.ensureAudio();
    if (!audio || audio.state !== 'running') return;
    try {
      const now = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = correct ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(correct ? 660 : 220, now);
      oscillator.frequency.exponentialRampToValueAtTime(correct ? 990 : 140, now + (correct ? 0.18 : 0.34));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (correct ? 0.24 : 0.38));
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + (correct ? 0.25 : 0.39));
    } catch {}
  }
}
