import type { Profile } from '../profiles/profiles.ts';

export function ScoresDialog({ profiles, onClose }: { profiles: Profile[]; onClose: () => void }) {
  const ranked = [...profiles].sort((a, b) => b.best - a.best);
  return (
    <div className="scores-backdrop" onClick={onClose}>
      <section
        className="scores-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scores-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="scores-title">
          <h2 id="scores-title">Personal bests</h2>
          <button autoFocus onClick={onClose}>
            Close
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>High score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => (
              <tr key={p.id}>
                <td>{p.settings.name}</td>
                <td>{p.best.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Saved scores on this device. Guest scores are temporary.</p>
      </section>
    </div>
  );
}
