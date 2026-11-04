export const MENU_ITEMS = ['Home', 'Players', 'Single', 'Versus', 'Settings', 'Scores'] as const;
export type MenuItem = (typeof MENU_ITEMS)[number];

export function Navigation({
  active,
  onNavigate,
}: {
  active: MenuItem;
  onNavigate: (item: MenuItem) => void;
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
            aria-current={active === item ? 'page' : undefined}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>
    </header>
  );
}
