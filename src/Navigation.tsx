import './navigation.css';
export type MenuItem = 'Home' | 'Players' | 'Single' | 'Versus' | 'Settings' | 'Scores';
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
        {(['Home', 'Players', 'Single', 'Versus', 'Settings', 'Scores'] as MenuItem[]).map(
          (item) => (
            <button
              type="button"
              key={item}
              aria-current={active === item ? 'page' : undefined}
              onClick={() => onNavigate(item)}
            >
              {item}
            </button>
          ),
        )}
      </nav>
    </header>
  );
}
