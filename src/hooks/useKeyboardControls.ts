import { useEffect, useRef } from 'react';
import type { GameAction } from '../game/gameState.ts';
import type { KeyBindings } from '../profiles/profiles.ts';

/** Actions that should fire once per press rather than auto-repeat while held. */
const NO_REPEAT: GameAction[] = ['drop', 'hold', 'pause'];

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && target.matches('input,select,textarea');
}

/**
 * Maps key presses to game actions while `enabled`. Escape always pauses.
 * Input is ignored while typing in a form field or while any dialog is open.
 */
export function useKeyboardControls(
  keys: KeyBindings,
  enabled: boolean,
  onAction: (action: GameAction) => void,
) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!enabled) return;
    const actionByKey = new Map<string, GameAction>(
      Object.entries(keys).map(([action, key]) => [key.toLowerCase(), action as GameAction]),
    );
    actionByKey.set('Escape', 'pause');

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || document.querySelector('[role=dialog]')) return;
      const action = actionByKey.get(event.key === 'Escape' ? 'Escape' : event.key.toLowerCase());
      if (!action) return;
      event.preventDefault();
      if (!event.repeat || !NO_REPEAT.includes(action)) onActionRef.current(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys, enabled]);
}
