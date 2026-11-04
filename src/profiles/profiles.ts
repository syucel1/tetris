/**
 * Local player profiles: settings, key bindings and personal best, stored in localStorage.
 */
import { DEFAULT_PALETTE, PALETTE_NAMES, type PaletteName } from '../ui/palettes.ts';

export const CONTROL_ACTIONS = [
  'left',
  'right',
  'rotate',
  'down',
  'drop',
  'hold',
  'pause',
] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export type KeyBindings = Record<ControlAction, string>;

export const DEFAULT_KEYS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  rotate: 'ArrowUp',
  down: 'ArrowDown',
  drop: ' ',
  hold: 'c',
  pause: 'p',
};

export const SOUND_OPTIONS = ['Crystal', 'Soft pop', 'Arcade', 'Off'] as const;
export type SoundOption = (typeof SOUND_OPTIONS)[number];
export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const MAX_NAME_LENGTH = 24;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

export type Settings = {
  name: string;
  theme: Theme;
  palette: PaletteName;
  difficulty: number;
  animations: boolean;
  sound: SoundOption;
  volume: number;
  ghost: boolean;
  grid: boolean;
  keys: KeyBindings;
};

export type Profile = { id: string; settings: Settings; best: number };

export const DEFAULT_SETTINGS: Settings = {
  name: 'Player one',
  theme: 'dark',
  palette: DEFAULT_PALETTE,
  difficulty: MIN_DIFFICULTY,
  animations: true,
  sound: 'Crystal',
  volume: 50,
  ghost: true,
  grid: true,
  keys: { ...DEFAULT_KEYS },
};

/** localStorage keys. The `prism-*` keys are the pre-profile format, read once for migration. */
export const STORAGE_KEYS = {
  profiles: 'tetris-profiles-v1',
  activeProfile: 'tetris-active-profile',
  legacySettings: 'prism-settings',
  legacyBest: 'prism-best',
} as const;

const GUEST_PREFIX = 'guest-';
const DEFAULT_PROFILE_ID = 'player-one';

export const isGuestId = (id: string) => id.startsWith(GUEST_PREFIX);

/** Guests are temporary: never written to the profile store. */
export function createGuest(name = 'Guest'): Profile {
  return { id: GUEST_PREFIX + crypto.randomUUID(), settings: freshSettings(name), best: 0 };
}

export function freshSettings(name = DEFAULT_SETTINGS.name): Settings {
  return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS }, name };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** Coerces untrusted (stored or legacy) settings into a valid `Settings` object. */
export function normalizeSettings(value: Partial<Settings> = {}): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...value };
  return {
    ...merged,
    keys: { ...DEFAULT_KEYS, ...merged.keys },
    name:
      typeof merged.name === 'string'
        ? merged.name.slice(0, MAX_NAME_LENGTH)
        : DEFAULT_SETTINGS.name,
    theme: oneOf(THEMES, merged.theme, 'dark'),
    palette: oneOf(PALETTE_NAMES, merged.palette, DEFAULT_PALETTE),
    difficulty: clamp(
      Math.round(Number(merged.difficulty) || MIN_DIFFICULTY),
      MIN_DIFFICULTY,
      MAX_DIFFICULTY,
    ),
    volume: clamp(Number(merged.volume) || 0, 0, 100),
    sound: oneOf(SOUND_OPTIONS, merged.sound, 'Crystal'),
    animations: !!merged.animations,
    ghost: !!merged.ghost,
    grid: !!merged.grid,
  };
}

const toBest = (value: unknown) => Math.max(0, Number(value) || 0);

function readSavedProfiles(storage: Pick<Storage, 'getItem'>): Profile[] {
  const saved: unknown = JSON.parse(storage.getItem(STORAGE_KEYS.profiles) || 'null');
  if (!Array.isArray(saved)) return [];
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  for (const entry of saved) {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id) || isGuestId(entry.id))
      continue;
    seen.add(entry.id);
    profiles.push({
      id: entry.id,
      settings: normalizeSettings(entry.settings || {}),
      best: toBest(entry.best),
    });
  }
  return profiles;
}

/** Migrates the single-player settings and best score from before profiles existed. */
function migrateLegacyProfile(storage: Pick<Storage, 'getItem'>): Profile {
  return {
    id: DEFAULT_PROFILE_ID,
    settings: normalizeSettings(JSON.parse(storage.getItem(STORAGE_KEYS.legacySettings) || '{}')),
    best: toBest(storage.getItem(STORAGE_KEYS.legacyBest)),
  };
}

export const defaultProfile = (): Profile => ({
  id: DEFAULT_PROFILE_ID,
  settings: freshSettings(),
  best: 0,
});

/** Always returns at least one profile, even when storage is unreadable or corrupt. */
export function loadProfiles(storage: Pick<Storage, 'getItem'>): Profile[] {
  try {
    const profiles = readSavedProfiles(storage);
    if (profiles.length) return profiles;
  } catch {
    // Corrupt profile store: fall through to migration.
  }
  try {
    return [migrateLegacyProfile(storage)];
  } catch {
    return [defaultProfile()];
  }
}

export function createProfile(name: string, existing: Profile[]): Profile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a player name.');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error('Use 24 characters or fewer.');
  const taken = trimmed.toLocaleLowerCase();
  if (existing.some((p) => p.settings.name.toLocaleLowerCase() === taken))
    throw new Error('That player name already exists.');
  return { id: crypto.randomUUID(), settings: freshSettings(trimmed), best: 0 };
}
