import React, { createContext, useContext } from 'react';
import type { HistoryItem, Me, Receipt } from './api';

export type Route =
  | { n: 'credit' } | { n: 'send' } | { n: 'review' } | { n: 'scan' } | { n: 'security' } | { n: 'rails' } | { n: 'admin' }
  | { n: 'result'; ok: boolean; receipt?: Receipt; error?: string; retryable?: boolean }
  | { n: 'receipt'; id: string };

export type Draft = { to: string; toName: string; amount: string; note: string; key: string };
export type AppCtx = {
  me: Me | null; history: HistoryItem[]; loaded: boolean; error: string | null; lockOn: boolean; bioAvailable: boolean;
  refresh: () => Promise<void>;
  push: (r: Route) => void; pop: () => void; replace: (r: Route) => void; resetTo: (t: 'home' | 'activity' | 'receive' | 'profile') => void;
  draft: Draft; setDraft: (d: Partial<Draft>) => void; newDraft: (d?: Partial<Draft>) => void;
  signOut: () => Promise<void>; setLock: (on: boolean) => Promise<void>;
};
export const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);
