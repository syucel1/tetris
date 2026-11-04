/** Piece colours by piece type (index 0–6 ↔ cell value 1–7). */
export const PALETTES = {
  Prism: ['#00eaff', '#526bff', '#ff941f', '#ffe63b', '#59ff4a', '#d84dff', '#ff376b'],
  Aurora: ['#69e3e6', '#689fff', '#f2ba8f', '#c1df90', '#4bd5b1', '#a596f8', '#eb9bce'],
  Candy: ['#7cddf7', '#a499ff', '#ffb598', '#ffe39a', '#a4e6b2', '#e6a3f7', '#ff8fb3'],
} as const satisfies Record<string, readonly string[]>;

export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];
export const DEFAULT_PALETTE: PaletteName = 'Prism';

export function paletteColors(name: string): readonly string[] {
  return PALETTES[name as PaletteName] ?? PALETTES[DEFAULT_PALETTE];
}
