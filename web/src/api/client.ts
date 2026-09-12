export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra: Record<string, unknown> = {}) {
    super(message ?? code);
  }
}

let unauthorizedHook: (() => void) | null = null;
let upgradeHook: ((min: string) => void) | null = null;
export const onUnauthorized = (fn: () => void) => { unauthorizedHook = fn; };
export const onUpgradeRequired = (fn: (min: string) => void) => { upgradeHook = fn; };

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-client", `web/${APP_VERSION}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const code = body?.error ?? `http_${res.status}`;
    const { error: _e, message, ...extra } = body ?? {};
    if (res.status === 401) unauthorizedHook?.();
    if (res.status === 426) upgradeHook?.(String(extra.min ?? ""));
    throw new ApiError(res.status, code, message, extra);
  }
  return body as T;
}
