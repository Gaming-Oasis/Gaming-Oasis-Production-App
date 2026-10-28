import type { BracketState } from "./bracket.mjs";
export const BRACKET_ROTATION_MS: number;
export type BracketFrame = Pick<BracketState, "section" | "view" | "roundStart" | "page">;
export function bracketFramingKey(state: BracketState): string;
export function bracketRotationFrames(state: BracketState): BracketFrame[];
export function nextBracketFrame(state: BracketState): BracketState;
export function startBracketRotation(options: {
  read: () => { enabled: boolean; value: BracketState; publishedKey: string };
  advance: (expectedKey: string) => void;
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
}): { stop: () => void };
