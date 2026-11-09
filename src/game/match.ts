/**
 * Two-player match rules. A standard match shares the start level and piece sequence and is won
 * on score; a casual game lets each player keep their own difficulty and has no winner.
 * Visual, audio and input preferences always stay personal. Pure functions, unit tested.
 */
import { MAX_DIFFICULTY, MIN_DIFFICULTY } from '../profiles/profiles.ts';

export const MATCH_TYPES = ['standard', 'casual'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  standard: 'Standard match',
  casual: 'Casual game',
};

/** Players in a standard match. Three or four seats always play casually. */
export const MATCH_PLAYERS = 2;
export const COUNTDOWN_SECONDS = 3;
export const DEFAULT_MATCH_LEVEL = MIN_DIFFICULTY;

/** One board's final numbers, for the match result. */
export type BoardResult = { score: number; lines: number; pieces: number; elapsed: number };

/** Rules shared by both boards. Persisted in recovery checkpoints. */
export type MatchRules = { startLevel: number };

export const isStandardMatch = (players: number, type: MatchType) =>
  players === MATCH_PLAYERS && type === 'standard';

export const isValidMatchLevel = (level: unknown): level is number =>
  Number.isInteger(level) &&
  (level as number) >= MIN_DIFFICULTY &&
  (level as number) <= MAX_DIFFICULTY;

/** A fresh 32-bit seed; both boards of a round share it so they get the same pieces. */
export const newMatchSeed = (random: () => number = Math.random) =>
  Math.floor(random() * 2 ** 32) >>> 0;

export type MatchOutcome =
  { kind: 'win'; winner: number; loser: number; margin: number } | { kind: 'tie'; score: number };

/** Score race: the higher final score wins; equal scores tie. */
export function matchOutcome(scores: readonly [number, number]): MatchOutcome {
  const [a, b] = scores;
  if (a === b) return { kind: 'tie', score: a };
  const winner = a > b ? 0 : 1;
  return { kind: 'win', winner, loser: 1 - winner, margin: Math.abs(a - b) };
}

/** The rules as short lines, shown to both players before the match starts. */
export function describeRules(rules: MatchRules, simultaneous: boolean): string[] {
  return [
    `Both start at level ${rules.startLevel}; speed rises every 10 lines`,
    'Same pieces in the same order for both boards',
    simultaneous ? 'Both boards play at once' : 'Alternating turns, one piece each',
    'Play until both boards top out — higher score wins, equal scores tie',
    'Your look, sound and keys stay your own',
  ];
}
