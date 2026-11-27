import { UserRound } from 'lucide-react';

export const MENU_ITEMS = [
  'Home',
  'Players',
  'Single',
  'Versus',
  'Settings',
  'Scores',
  'Account',
] as const;
export type MenuItem = (typeof MENU_ITEMS)[number];

export function Navigation({
  active,
  onNavigate,
  accountLabel,
}: {
  active: MenuItem;
  onNavigate: (item: MenuItem) => void;
  /** The signed-in username, shown on the Account item. */
  accountLabel?: string;
}) {
  return (
    <header className="top-navigation">
      <div className="nav-brand">
        <span className="nav-emblem" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        TETRIS
      </div>
      <nav aria-label="Main navigation">
        {MENU_ITEMS.map((item) => (
          <button
            type="button"
            key={item}
            className={item === 'Account' ? 'nav-account' : undefined}
            aria-current={active === item ? 'page' : undefined}
            aria-label={item === 'Account' && accountLabel ? `Account: ${accountLabel}` : undefined}
            onClick={() => onNavigate(item)}
          >
            {item === 'Account' ? (
              <>
                <UserRound size={14} aria-hidden="true" /> {accountLabel ?? 'Sign in'}
              </>
            ) : (
              item
            )}
          </button>
        ))}
      </nav>
    </header>
  );
}
