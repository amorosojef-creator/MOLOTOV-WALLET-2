import { API_URL, LOCAL_MODE } from './config';
import { localEngine } from './local/index';
import { delItem, getItem, setItem } from './storage';

export class ApiError extends Error {
  status: number; code?: string; network: boolean;
  constructor(message: string, status = 0, code?: string, network = false) { super(message); this.status = status; this.code = code; this.network = network; }
}

export type Me = { id: string; hasPin: boolean; handle: string; displayName: string; email: string; role: 'user' | 'admin'; balance: string; qr: string; createdAt: string; sandbox: true };
export type Party = { handle: string; name: string };
export type Receipt = {
  id: string; reference: string; kind: 'sandbox_credit' | 'sandbox_transfer'; status: 'pending' | 'completed' | 'failed' | 'reversed';
  amount: string; fee: string; total: string; currency: 'PHP'; note: string | null; sender: Party | null; receiver: Party; createdAt: string; completedAt: string | null; sandbox: true;
};
export type HistoryItem = Receipt & { direction: 'in' | 'out'; counterparty: Party | null };
export type QrInspect = { type: 'molotov-sandbox' | 'emvco-qr' | 'unknown'; executable: boolean; recipient?: { handle: string; displayName: string } | null; blockedReason?: string; inspection?: any };

let access: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => {};
export const setSignedOutHandler = (f: () => void) => { onSignedOut = f; };

async function call(path: string, method: string, body?: unknown, key?: string, token?: string | null): Promise<Response> {
  if (LOCAL_MODE) {
    const r = await localEngine(path, method, body, key, token);
    return new Response(JSON.stringify(r.data), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    return await fetch(API_URL + path, {
      method, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e: any) {
    throw new ApiError(e?.name === 'AbortError' ? 'The request timed out. Check your connection.' : "Can't reach Molotov. Check your connection.", 0, 'network', true);
  } finally { clearTimeout(timer); }
}

async function parse<T>(res: Response): Promise<T> {
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const rt = await getItem('refresh');
    if (!rt) return false;
    try {
      const res = await call('/api/auth/refresh', 'POST', { refreshToken: rt });
      if (res.status === 401) { await delItem('refresh'); access = null; return false; }
      const d = await parse<{ accessToken: string; refreshToken: string }>(res);
      access = d.accessToken; await setItem('refresh', d.refreshToken); return true;
    } catch (e) { if (e instanceof ApiError && e.network) throw e; return false; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; key?: string; auth?: boolean } = {}): Promise<T> {
  const { method = opts.body !== undefined ? 'POST' : 'GET', body, key, auth = true } = opts;
  let res = await call(path, method, body, key, auth ? access : null);
  if (auth && res.status === 401) {
    if (await refreshSession()) res = await call(path, method, body, key, access);
    else { onSignedOut(); }
  }
  return parse<T>(res);
}

export async function startSession(d: { accessToken: string; refreshToken: string }) { access = d.accessToken; await setItem('refresh', d.refreshToken); }
export async function endSession(remote = true) {
  const rt = await getItem('refresh');
  if (remote && rt) { try { await call('/api/auth/logout', 'POST', { refreshToken: rt }); } catch {} }
  access = null; await delItem('refresh');
}
export const hasStoredSession = async () => !!(await getItem('refresh'));
export const newKey = () => `mlt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
