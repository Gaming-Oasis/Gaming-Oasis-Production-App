export function readBoundedJson(response: Response, options: { maximumBytes: number; abort?: () => void; message?: string }): Promise<unknown>;
