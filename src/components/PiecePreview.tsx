import { SHAPES } from '../game/engine.ts';

const PREVIEW_CELL_PX = 21;

/** Small static rendering of a piece type, or a dash when empty. */
export function PiecePreview({ type, colors }: { type: number | null; colors: readonly string[] }) {
  if (type === null)
    return (
      <div className="mini">
        <span className="muted">—</span>
      </div>
    );
  const shape = SHAPES[type];
  return (
    <div className="mini">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${shape[0].length}, ${PREVIEW_CELL_PX}px)`,
        }}
      >
        {shape.flatMap((row, y) =>
          row.map((value, x) => (
            <i
              key={`${y}-${x}`}
              style={{
                background: value ? colors[value - 1] : 'transparent',
                boxShadow: value ? 'inset 0 1px 0 #ffffff60' : 'none',
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
