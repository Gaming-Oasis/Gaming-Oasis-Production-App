import type { BracketSource, BracketSnapshot } from "./bracket.mjs";
export type BracketEventChoice = { source: BracketSource; name: string; stages: { id: string; name: string; type: string }[] };
export const BRACKET_WRITER_ORIGIN: string;
export function readBracketResource(path: string, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<unknown>;
export function loadBracketEvent(source: BracketSource, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<BracketEventChoice>;
export function loadBracketSnapshot(source: BracketSource, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<BracketSnapshot>;
export function refreshBracketSnapshot(snapshot: BracketSnapshot, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<BracketSnapshot>;
