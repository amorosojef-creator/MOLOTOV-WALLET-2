import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { C } from './theme';
import { Ctx, Draft, Route, AppCtx } from './store';
import { api, ApiError, endSession, HistoryItem, hasStoredSession, Me, newKey, refreshSession, setSignedOutHandler } from './api';
import { authenticate, biometricsAvailable, lockEnabled, setLockEnabled } from './biometrics';
import { BottomNav, Tab } from './components/BottomNav';
import { Banner, Btn, Logo } from './components/ui';
import { AuthScreen, Onboarding } from './screens/Auth';
import { Home } from './screens/Home';
import { Credit, Result, Review, Send } from './screens/Flow';
import { Scan } from './screens/Scan';
import { Activity, Admin, Profile, Rails, Receive, ReceiptScreen, Security } from './screens/Tabs';
import { useMotion } from './motion';

SplashScreen.preventAutoHideAsync().catch(() => {});
const blank = (): Draft => ({ to: '', toName: '', amount: '', note: '', key: newKey() });

export default function App() {
  const { reduce } = useMotion();
  const [phase, setPhase] = useState<'boot' | 'welcome' | 'auth' | 'locked' | 'app'>('boot');
  const [authReg, setAuthReg] = useState(true);
  const [me, setMe] = useState<Me | null>(null), [history, setHistory] = useState<HistoryItem[]>([]), [loaded, setLoaded] = useState(false), [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home'), [stack, setStack] = useState<Route[]>([]);
  const [draft, setDraftState] = useState<Draft>(blank());
  const [lockOn, setLockOn] = useState(false), [bio, setBio] = useState(false);
  const backgroundedAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [m, h] = await Promise.all([api<Me>('/api/me'), api<{ items: HistoryItem[] }>('/api/transactions?limit=20')]);
      setMe(m); setHistory(h.items); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load your wallet.'); } finally { setLoaded(true); }
  }, []);

  const toLoggedOut = useCallback(() => { setMe(null); setHistory([]); setLoaded(false); setStack([]); setTab('home'); setPhase('welcome'); }, []);
  useEffect(() => { setSignedOutHandler(toLoggedOut); }, [toLoggedOut]);

  async function enter() {
    setLockOn(await lockEnabled()); setBio(await biometricsAvailable()); setPhase('app'); refresh();
  }
  useEffect(() => {
    (async () => {
      try {
        if (await hasStoredSession()) {
          let ok = false; try { ok = await refreshSession(); } catch { ok = true; /* offline: keep session, let screens show a retry banner */ }
          if (ok) {
            if (await lockEnabled() && await biometricsAvailable()) setPhase('locked'); else await enter();
          } else setPhase('welcome');
        } else setPhase('welcome');
      } finally { SplashScreen.hideAsync().catch(() => {}); }
    })();
  }, []);

  // Re-lock after 30s in background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundedAt.current = Date.now();
      else if (s === 'active' && phase === 'app' && lockOn && backgroundedAt.current && Date.now() - backgroundedAt.current > 30000) setPhase('locked');
    });
    return () => sub.remove();
  }, [phase, lockOn]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { if (phase === 'app' && stack.length) { setStack((s) => s.slice(0, -1)); return true; } return false; });
    return () => h.remove();
  }, [phase, stack.length]);

  const ctx: AppCtx = useMemo(() => ({
    me, history, loaded, error, lockOn, bioAvailable: bio, refresh,
    push: (r) => setStack((s) => [...s, r]), pop: () => setStack((s) => s.slice(0, -1)), replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
    resetTo: (t) => { setStack([]); setTab(t); },
    draft, setDraft: (d) => setDraftState((x) => ({ ...x, ...d })), newDraft: (d) => setDraftState({ ...blank(), ...d }),
    signOut: async () => { await endSession(true); toLoggedOut(); },
    setLock: async (on) => { if (on && !(await authenticate('Enable biometric lock'))) return; await setLockEnabled(on); setLockOn(on); },
  }), [me, history, loaded, error, lockOn, bio, refresh, draft, toLoggedOut]);

  if (phase === 'boot') return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Logo size={30} /><ActivityIndicator color={C.lime} style={{ marginTop: 24 }} /></View>;

  let body: React.ReactNode;
  if (phase === 'welcome') body = <Onboarding onStart={() => { setAuthReg(true); setPhase('auth'); }} onLogin={() => { setAuthReg(false); setPhase('auth'); }} />;
  else if (phase === 'auth') body = <AuthScreen initialRegister={authReg} onDone={enter} onBack={() => setPhase('welcome')} />;
  else if (phase === 'locked') body = (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Logo size={34} /><Text style={{ color: C.text, fontSize: 22, fontWeight: '800', marginTop: 24 }}>Molotov is locked</Text>
      <Text style={{ color: C.muted, marginVertical: 12, textAlign: 'center' }}>Unlock to see your wallet.</Text>
      <View style={{ width: '100%' }}><Btn title="Unlock" onPress={async () => { if (await authenticate('Unlock Molotov')) await enter(); }} /><Btn kind="ghost" title="Sign out" onPress={async () => { await endSession(true); toLoggedOut(); }} /></View>
    </SafeAreaView>
  );
  else {
    const top = stack[stack.length - 1];
    const screen = !top ? (tab === 'home' ? <Home /> : tab === 'activity' ? <Activity /> : tab === 'receive' ? <Receive /> : <Profile />)
      : top.n === 'credit' ? <Credit /> : top.n === 'send' ? <Send /> : top.n === 'review' ? <Review /> : top.n === 'scan' ? <Scan />
      : top.n === 'result' ? <Result route={top} /> : top.n === 'receipt' ? <ReceiptScreen id={top.id} /> : top.n === 'security' ? <Security /> : top.n === 'rails' ? <Rails /> : <Admin />;
    const key = top ? `${stack.length}-${top.n}` : `tab-${tab}`;
    body = (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={top?.n === 'scan' ? [] : ['top']}>
          <Animated.View key={key} entering={reduce ? undefined : top ? SlideInRight.duration(240) : FadeIn.duration(220)} style={{ flex: 1 }}>{screen}</Animated.View>
        </SafeAreaView>
        {!top && <BottomNav tab={tab} onTab={(t) => { setStack([]); setTab(t); }} onScan={() => setStack([{ n: 'scan' }])} />}
      </View>
    );
  }
  return <SafeAreaProvider><Ctx.Provider value={ctx}><StatusBar style="light" />{body}</Ctx.Provider></SafeAreaProvider>;
}
