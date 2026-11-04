import { useState } from 'react';
import { Check, Moon, Sun, Trophy, Volume2, X } from 'lucide-react';
import {
  CONTROL_ACTIONS,
  DEFAULT_KEYS,
  MAX_DIFFICULTY,
  MAX_NAME_LENGTH,
  MIN_DIFFICULTY,
  SOUND_OPTIONS,
  THEMES,
  type Settings,
  type SoundOption,
} from '../profiles/profiles.ts';
import { useKeyBindingCapture } from '../hooks/useKeyBindingCapture.ts';
import { ACTION_LABELS, keyLabel } from '../ui/keyLabels.ts';
import { PALETTES, type PaletteName } from '../ui/palettes.ts';

const TABS = ['Appearance', 'Gameplay', 'Controls', 'Sound', 'Profile'] as const;
type Tab = (typeof TABS)[number];

export type UpdateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

type SettingsModalProps = {
  settings: Settings;
  best: number;
  onChange: UpdateSetting;
  onPreviewSound: () => void;
  onClose: () => void;
};

type BooleanSetting = 'ghost' | 'grid' | 'animations';

function SettingToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

export function SettingsModal({
  settings,
  best,
  onChange,
  onPreviewSound,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('Appearance');
  const binding = useKeyBindingCapture(settings.keys, (keys) => onChange('keys', keys));

  const toggle = (key: BooleanSetting, label: string, detail: string) => (
    <SettingToggle
      label={label}
      detail={detail}
      checked={settings[key]}
      onChange={(checked) => onChange(key, checked)}
    />
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">SETTINGS</div>
            <h2 id="settings-title">Game settings</h2>
          </div>
          <button className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X />
          </button>
        </div>
        <nav>
          {TABS.map((t) => (
            <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
              {t}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'Appearance' && (
            <>
              <div className="field-label">YOUR ATMOSPHERE</div>
              <div className="theme-options">
                {THEMES.map((theme) => (
                  <button
                    key={theme}
                    className={settings.theme === theme ? 'selected' : ''}
                    onClick={() => onChange('theme', theme)}
                  >
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    <span>{theme === 'dark' ? 'After hours' : 'Daylight'}</span>
                    {settings.theme === theme && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="field-label">PIECE PALETTE</div>
              <div className="palette-options">
                {Object.entries(PALETTES).map(([name, colors]) => (
                  <button
                    className={settings.palette === name ? 'selected' : ''}
                    key={name}
                    onClick={() => onChange('palette', name as PaletteName)}
                  >
                    <div>
                      {colors.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </div>
                    <span>{name}</span>
                    {settings.palette === name && <Check size={14} />}
                  </button>
                ))}
              </div>
              {toggle('animations', 'Gentle animations', 'A little movement, a little magic.')}
              {toggle('grid', 'Show grid', 'Keep your next move in perspective.')}
            </>
          )}
          {tab === 'Gameplay' && (
            <>
              <div className="difficulty-title">
                <strong>Starting difficulty</strong>
                <span>Level {settings.difficulty}</span>
              </div>
              <input
                aria-label="Starting difficulty"
                type="range"
                min={MIN_DIFFICULTY}
                max={MAX_DIFFICULTY}
                value={settings.difficulty}
                onChange={(e) => onChange('difficulty', +e.target.value)}
              />
              <div className="range-labels">
                <span>Slow & steady</span>
                <span>Fast & focused</span>
              </div>
              <p className="setting-help">
                Speed increases every 10 cleared lines, up to level 10. Changing difficulty also
                adjusts the current game.
              </p>
              {toggle('ghost', 'Ghost piece', 'Preview exactly where your piece will land.')}
              <div className="info-box">
                A complete set of seven pieces is shuffled into every bag. Use hold and the
                next-piece queue to plan ahead.
              </div>
            </>
          )}
          {tab === 'Controls' && (
            <>
              <p className="setting-help">
                Choose an action, then press a key. Escape cancels. Keys apply only during your
                turn.
              </p>
              {CONTROL_ACTIONS.map((action) => (
                <div className="binding-row" key={action}>
                  <span>{ACTION_LABELS[action]}</span>
                  <button className="secondary" onClick={() => binding.startCapture(action)}>
                    {binding.capturing === action
                      ? 'Press a key…'
                      : keyLabel(settings.keys[action])}
                  </button>
                </div>
              ))}
              {binding.error && (
                <p role="alert" className="key-error">
                  {binding.error}
                </p>
              )}
              <button
                className="secondary"
                onClick={() => {
                  onChange('keys', { ...DEFAULT_KEYS });
                  binding.cancelCapture();
                }}
              >
                Reset controls
              </button>
            </>
          )}
          {tab === 'Sound' && (
            <>
              <label className="select-label">
                Line-clear sound
                <select
                  value={settings.sound}
                  onChange={(e) => onChange('sound', e.target.value as SoundOption)}
                >
                  {SOUND_OPTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="difficulty-title">
                <strong>Volume</strong>
                <span>{settings.volume}%</span>
              </div>
              <input
                aria-label="Sound volume"
                type="range"
                min="0"
                max="100"
                value={settings.volume}
                onChange={(e) => onChange('volume', +e.target.value)}
              />
              <button className="secondary preview-sound" onClick={onPreviewSound}>
                <Volume2 size={16} /> Preview sound
              </button>
              <p className="setting-help">
                A small celebration for every cleared line. Audio is generated locally — no
                downloads needed.
              </p>
            </>
          )}
          {tab === 'Profile' && (
            <>
              <label className="select-label">
                Player name
                <input
                  maxLength={MAX_NAME_LENGTH}
                  value={settings.name}
                  onChange={(e) => onChange('name', e.target.value)}
                />
              </label>
              <div className="info-box">
                Your local profile keeps your preferences and personal best in this browser. No
                account or connection required.
              </div>
              <div className="profile-best">
                <Trophy />
                <span>Personal best</span>
                <strong>{best.toLocaleString()}</strong>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <span>
            <Check size={13} /> Saved automatically
          </span>
          <button className="primary" onClick={onClose}>
            All set <Check size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
