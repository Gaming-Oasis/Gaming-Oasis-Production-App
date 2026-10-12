import type { HubCollection, HubGameKey } from "./hub-draft.mjs";
export type HubConnectionStatus = { busy: boolean; error: string; lastSuccess: string; connected: boolean };
export function hubConnectionState(input: { owner: boolean; reason: string; mode: string; status: HubConnectionStatus; hasSnapshot: boolean }): { label: string; detail: string; tone: string };
export function hubDraftProgress(collection: HubCollection, gameKey: HubGameKey, gameNumber: number): string;
