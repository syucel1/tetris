import type { SoundOption } from '../profiles/profiles.ts';

/** C5–E5–G5 arpeggio. */
const NOTES_HZ = [523.25, 659.25, 783.99];
const NOTE_SPACING_S = 0.065;
const NOTE_LENGTH_S = 0.3;
const PEAK_GAIN = 0.09;

let sharedContext: AudioContext | null = null;

/** Plays a short synthesised chime. Silently does nothing when audio is unavailable. */
export function playLineClearSound(sound: SoundOption, volume: number): void {
  if (sound === 'Off') return;
  try {
    const ctx = (sharedContext ??= new AudioContext());
    void ctx.resume();
    NOTES_HZ.forEach((frequency, index) => {
      const start = ctx.currentTime + index * NOTE_SPACING_S;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = sound === 'Arcade' ? 'square' : 'sine';
      oscillator.frequency.value = frequency * (sound === 'Soft pop' ? 0.5 : 1);
      gain.gain.setValueAtTime((volume / 100) * PEAK_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + NOTE_LENGTH_S);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_LENGTH_S);
    });
  } catch {
    // Audio is a nicety; never let it break play.
  }
}
