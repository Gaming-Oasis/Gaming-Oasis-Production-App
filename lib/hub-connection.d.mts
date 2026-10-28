import type { HubCollection, HubGameKey } from "./hub-draft.mjs";
export type HubConnectionStatus = { busy: boolean; error: string; lastSuccess: string; connected: boolean };
export type HubConnectionCopy = { setup: string; manual: string; manualRetained: string; manualEmpty: string; retained: string; checkingRetained: string; checkingEmpty: string; connected: string };
export const BRACKET_CONNECTION_COPY: HubConnectionCopy;
export function hubConnectionState(input: { owner: boolean; reason: string; mode: string; status: HubConnectionStatus; hasSnapshot: boolean; copy?: HubConnectionCopy }): { label: string; detail: string; tone: string };
export function hubDraftProgress(collection: HubCollection, gameKey: HubGameKey, gameNumber: number): string;
