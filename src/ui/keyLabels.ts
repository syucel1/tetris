import type { ControlAction } from '../profiles/profiles.ts';

const SPECIAL_KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

/** Human-readable label for a `KeyboardEvent.key` value. */
export const keyLabel = (key: string) => SPECIAL_KEY_LABELS[key] ?? key.toUpperCase();

export const ACTION_LABELS: Record<ControlAction, string> = {
  left: 'Move left',
  right: 'Move right',
  rotate: 'Rotate',
  down: 'Soft drop',
  drop: 'Hard drop',
  hold: 'Hold piece',
  pause: 'Pause',
};
