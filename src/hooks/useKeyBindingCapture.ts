import { useEffect, useState } from 'react';
import type { ControlAction, KeyBindings } from '../profiles/profiles.ts';

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'Tab'];
export const DUPLICATE_KEY_ERROR = 'That key is already assigned. Choose another.';

/**
 * While `capturing` is set, the next key press becomes that action's binding.
 * Escape cancels; modifier chords are ignored; duplicates within a profile are rejected.
 */
export function useKeyBindingCapture(keys: KeyBindings, onChange: (keys: KeyBindings) => void) {
  const [capturing, setCapturing] = useState<ControlAction | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        return;
      }
      if (MODIFIER_KEYS.includes(event.key) || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const taken = Object.entries(keys).some(
        ([action, bound]) => action !== capturing && bound.toLowerCase() === key.toLowerCase(),
      );
      if (taken) {
        setError(DUPLICATE_KEY_ERROR);
        return;
      }
      onChange({ ...keys, [capturing]: key });
      setCapturing(null);
      setError('');
    };
    // Capture phase so gameplay handlers never see the key being bound.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, keys]);

  function startCapture(action: ControlAction) {
    setCapturing(action);
    setError('');
  }

  return { capturing, error, startCapture, cancelCapture: () => setCapturing(null) };
}
