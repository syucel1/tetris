export type ControlAction = 'left' | 'right' | 'rotate' | 'down' | 'drop' | 'hold' | 'pause';
export const defaultKeys: Record<ControlAction, string> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  rotate: 'ArrowUp',
  down: 'ArrowDown',
  drop: ' ',
  hold: 'c',
  pause: 'p',
};
export type Settings = {
  name: string;
  theme: 'dark' | 'light';
  palette: string;
  difficulty: number;
  animations: boolean;
  sound: string;
  volume: number;
  ghost: boolean;
  grid: boolean;
  keys: Record<ControlAction, string>;
};
export type Profile = { id: string; settings: Settings; best: number };
export const defaultSettings: Settings = {
  name: 'Player one',
  theme: 'dark',
  palette: 'Prism',
  difficulty: 1,
  animations: true,
  sound: 'Crystal',
  volume: 50,
  ghost: true,
  grid: true,
  keys: { ...defaultKeys },
};
export const PROFILE_KEY = 'tetris-profiles-v1';
export function normalizeSettings(value: Partial<Settings> = {}): Settings {
  const s = { ...defaultSettings, ...value };
  return {
    ...s,
    keys: { ...defaultKeys, ...s.keys },
    name: typeof s.name === 'string' ? s.name.slice(0, 24) : defaultSettings.name,
    theme: s.theme === 'light' ? 'light' : 'dark',
    palette: ['Prism', 'Aurora', 'Candy'].includes(s.palette) ? s.palette : 'Prism',
    difficulty: Math.max(1, Math.min(10, Math.round(Number(s.difficulty) || 1))),
    volume: Math.max(0, Math.min(100, Number(s.volume) || 0)),
    sound: ['Crystal', 'Soft pop', 'Arcade', 'Off'].includes(s.sound) ? s.sound : 'Crystal',
    animations: !!s.animations,
    ghost: !!s.ghost,
    grid: !!s.grid,
  };
}
export function loadProfiles(storage: Pick<Storage, 'getItem'>): Profile[] {
  try {
    const saved = JSON.parse(storage.getItem(PROFILE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) {
      const seen = new Set<string>();
      const profiles: Profile[] = [];
      for (const p of saved) {
        if (!p || typeof p.id !== 'string' || seen.has(p.id) || p.id.startsWith('guest-')) continue;
        seen.add(p.id);
        profiles.push({
          id: p.id,
          settings: normalizeSettings(p.settings || {}),
          best: Math.max(0, Number(p.best) || 0),
        });
      }
      if (profiles.length) return profiles;
    }
  } catch {}
  try {
    return [
      {
        id: 'player-one',
        settings: normalizeSettings(JSON.parse(storage.getItem('prism-settings') || '{}')),
        best: Math.max(0, Number(storage.getItem('prism-best')) || 0),
      },
    ];
  } catch {
    return [{ id: 'player-one', settings: { ...defaultSettings }, best: 0 }];
  }
}
export function createProfile(name: string, existing: Profile[]): Profile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a player name.');
  if (trimmed.length > 24) throw new Error('Use 24 characters or fewer.');
  if (existing.some((p) => p.settings.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase()))
    throw new Error('That player name already exists.');
  return {
    id: crypto.randomUUID(),
    settings: { ...defaultSettings, keys: { ...defaultKeys }, name: trimmed },
    best: 0,
  };
}
