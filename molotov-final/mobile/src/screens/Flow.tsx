import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, Easing, ReduceMotion } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, R, S, glow } from '../theme';
import { Avatar, Banner, Btn, Card, Field, Pill, Press, Row, ScreenHeader, Logo } from '../components/ui';
import { useApp } from '../store';
import { api, ApiError, newKey, Receipt } from '../api';
import { formatPeso, parseCents, sanitizeAmountInput } from '../money';
import { authenticate } from '../biometrics';
import { hapticError, hapticSuccess, useMotion } from '../motion';

const sandboxBox = (
  <Card style={{ flexDirection: 'row', gap: 12, marginTop: S.lg }}>
    <Text style={{ color: C.lime, fontSize: 22 }}>⚗</Text>
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.text, fontWeight: '800' }}>Sandbox Mode</Text>
      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>This is a sandbox transfer for testing and demo purposes only. No real money will be moved.</Text>
    </View>
  </Card>
);

/** Step 1: pick recipient + amount + note. */
export function Send() {
  const a = useApp();
  const d = a.draft;
  const [lookup, setLookup] = useState<{ state: 'idle' | 'busy' | 'ok' | 'err'; msg?: string }>({ state: d.toName ? 'ok' : 'idle' });
  const timer = useRef<any>(null);
  const cents = parseCents(d.amount);
  const balance = Number(a.me?.balance || 0) * 100;
  const over = cents !== null && cents > balance;
  const recents = useMemo(() => {
    const m = new Map<string, string>();
    a.history.forEach((t) => { if (t.direction === 'out' && t.counterparty) m.set(t.counterparty.handle, t.counterparty.name); });
    return [...m.entries()].slice(0, 6);
  }, [a.history]);

  useEffect(() => {
    clearTimeout(timer.current);
    const h = d.to.trim().toLowerCase().replace(/^@/, '').replace(/^molotov-sandbox:\/\/pay\//, '');
    if (!h) { setLookup({ state: 'idle' }); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(h)) { setLookup({ state: 'err', msg: 'Handles are 3-24 letters, numbers or underscores' }); return; }
    if (h === a.me?.handle) { setLookup({ state: 'err', msg: "You can't send to yourself" }); return; }
    setLookup({ state: 'busy' });
    timer.current = setTimeout(async () => {
      try { const r = await api<{ handle: string; displayName: string }>(`/api/users/${h}`); a.setDraft({ to: r.handle, toName: r.displayName }); setLookup({ state: 'ok' }); }
      catch (e) { a.setDraft({ toName: '' }); setLookup({ state: 'err', msg: e instanceof ApiError && e.status === 404 ? 'No Molotov test account with that handle' : (e as Error).message }); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [d.to]);

  const ready = lookup.state === 'ok' && !!d.toName && cents !== null && !over;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: S.xl }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Send" subtitle="Send test funds to another Molotov sandbox account." onBack={a.pop} />
        {recents.length > 0 && (
          <View style={{ marginBottom: S.lg }}>
            <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 10 }}>RECENT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {recents.map(([h, n]) => <Press key={h} onPress={() => a.setDraft({ to: h, toName: n })} label={`Send to ${n}`} style={{ alignItems: 'center', width: 64 }}><Avatar name={n} size={52} /><Text numberOfLines={1} style={{ color: C.sub, fontSize: 11, marginTop: 6 }}>{n}</Text></Press>)}
            </ScrollView>
          </View>
        )}
        <Field label="RECIPIENT HANDLE" value={d.to} onChangeText={(t) => a.setDraft({ to: t, toName: '' })} placeholder="@handle or scan a Molotov QR" error={lookup.state === 'err' ? lookup.msg : null} />
        {lookup.state === 'ok' && d.toName ? (
          <Animated.View entering={FadeIn.duration(250)}><Card hi style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -4, marginBottom: S.lg }}>
            <Avatar name={d.toName} /><View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '800' }}>{d.toName}</Text><Text style={{ color: C.muted, fontSize: 12 }}>@{d.to} · Molotov test user</Text></View><Text style={{ color: C.lime, fontSize: 20 }}>✓</Text>
          </Card></Animated.View>
        ) : lookup.state === 'busy' ? <Text style={{ color: C.muted, marginTop: -8, marginBottom: S.lg }}>Looking up…</Text> : null}
        <Press onPress={() => a.push({ n: 'scan' })} label="Scan a Molotov QR" style={{ alignSelf: 'flex-start', marginBottom: S.lg }}><Text style={{ color: C.lime, fontWeight: '700' }}>▣  Scan a Molotov QR instead</Text></Press>

        <Text style={{ color: C.sub, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 }}>YOU'RE SENDING</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: over ? C.danger : C.border, paddingHorizontal: 18, marginBottom: 6 }}>
          <Text style={{ color: C.lime, fontSize: 30, fontWeight: '800' }}>₱</Text>
          <TextInput accessibilityLabel="Amount in pesos" value={d.amount} onChangeText={(t) => a.setDraft({ amount: sanitizeAmountInput(t) })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#4B5648" style={{ flex: 1, color: C.text, fontSize: 34, fontWeight: '800', paddingVertical: 16, paddingLeft: 10 }} />
        </View>
        <Text style={{ color: over ? C.danger : C.muted, fontSize: 12, marginBottom: S.lg }}>{over ? 'More than your sandbox balance' : `Available ${formatPeso(a.me?.balance || 0)}`}</Text>
        <Field label="NOTE (OPTIONAL)" value={d.note} onChangeText={(t) => a.setDraft({ note: t.slice(0, 140) })} placeholder="Dinner" autoCapitalize="sentences" maxLength={140} />
        <Btn title="Continue" onPress={() => { a.setDraft({ key: newKey() }); a.push({ n: 'review' }); }} disabled={!ready} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Step 2: review + confirm. */
export function Review() {
  const a = useApp(); const d = a.draft;
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [pin, setPin] = useState('');
  const cents = parseCents(d.amount) ?? 0;
  async function confirm() {
    if (busy) return; setErr(null);
    if (a.lockOn && !(await authenticate('Confirm this transfer'))) { setErr('Authentication cancelled. Nothing was sent.'); hapticError(); return; }
    setBusy(true);
    try {
      const out = await api<{ transfer: Receipt }>('/api/sandbox/send', { body: { to: d.to, amount: (cents / 100).toFixed(2), note: d.note || null, pin }, key: d.key });
      hapticSuccess(); a.refresh(); a.replace({ n: 'result', ok: true, receipt: out.transfer });
    } catch (e) {
      hapticError();
      const ae = e as ApiError;
      if (ae.code === 'PIN_INVALID' || ae.code === 'PIN_LOCKED' || ae.code === 'PIN_NOT_SET') { setPin(''); setErr(ae.message); }
      else if (ae.network) setErr('Connection lost, so we are not sure whether this went through. Tap Confirm again: it is safe and will never send twice.');
      else a.replace({ n: 'result', ok: false, error: ae.message, retryable: false });
    } finally { setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl }}>
      <ScreenHeader title="Sandbox Transfer" subtitle="You're about to send a test transfer using the Molotov Sandbox." onBack={a.pop} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#20261D' }}>
          <Avatar name={d.toName} /><View><Text style={{ color: C.muted, fontSize: 11 }}>Recipient</Text><Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>{d.toName}</Text><Text style={{ color: C.muted, fontSize: 12 }}>@{d.to}</Text></View>
        </View>
        <Row k="Amount" v={formatPeso(cents / 100)} />
        <Row k="Fee" v="₱0.00" />
        {!!d.note && <Row k="Note" v={d.note} />}
        <View style={{ height: 1, backgroundColor: '#20261D', marginVertical: 4 }} />
        <Row k="Total" v={formatPeso(cents / 100)} strong accent />
      </Card>
      {sandboxBox}
      <View style={{ height: S.lg }} />
      <Field label="6-DIGIT TRANSACTION PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Enter your PIN to confirm" />
      {err && <Banner text={err} />}
      <Btn title={err ? 'Confirm Again' : 'Confirm Transfer'} onPress={confirm} loading={busy} disabled={!/^\d{6}$/.test(pin)} />
      <Btn title="Edit" kind="ghost" onPress={a.pop} disabled={busy} />
    </ScrollView>
  );
}

const AC = Animated.createAnimatedComponent(Circle), AP = Animated.createAnimatedComponent(Path);

function Check({ ok }: { ok: boolean }) {
  const { reduce } = useMotion();
  const ring = useSharedValue(reduce ? 0 : 1), tick = useSharedValue(reduce ? 0 : 1), pop = useSharedValue(reduce ? 1 : 0.6);
  useEffect(() => {
    if (reduce) return;
    ring.value = withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) });
    tick.value = withDelay(450, withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }));
    pop.value = withSequence(withSpring(1.12, { damping: 8 }), withSpring(1, { damping: 10 }));
  }, [reduce]);
  const rp = useAnimatedProps(() => ({ strokeDashoffset: ring.value * 283 }));
  const tp = useAnimatedProps(() => ({ strokeDashoffset: tick.value * 70 }));
  const sc = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const col = ok ? C.lime : C.danger;
  return (
    <Animated.View style={[{ width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', ...glow(col, 34, 0.7) }, sc]} accessibilityLabel={ok ? 'Success' : 'Failed'}>
      <Svg width={150} height={150} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="45" fill={ok ? 'rgba(204,255,0,0.1)' : 'rgba(255,92,92,0.1)'} />
        <AC cx="50" cy="50" r="45" stroke={col} strokeWidth="4" fill="none" strokeDasharray="283" animatedProps={rp} strokeLinecap="round" rotation="-90" origin="50,50" />
        {ok ? <AP d="M30 52 L44 66 L71 36" stroke={col} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" animatedProps={tp} />
          : <><Path d="M34 34 L66 66" stroke={col} strokeWidth="7" strokeLinecap="round" /><Path d="M66 34 L34 66" stroke={col} strokeWidth="7" strokeLinecap="round" /></>}
      </Svg>
    </Animated.View>
  );
}

/** Step 3: verified result. Success is shown ONLY with a server-issued receipt. */
export function Result({ route }: { route: { ok: boolean; receipt?: Receipt; error?: string } }) {
  const a = useApp();
  const ok = route.ok && !!route.receipt;
  return (
    <View style={{ flex: 1, padding: S.xl, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', marginBottom: S.xl }}>
        <View style={{ marginBottom: S.xl }}><Logo size={20} /></View>
        <Check ok={ok} />
        <Animated.Text entering={FadeInDown.delay(500).duration(400)} accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '800', marginTop: S.xl }}>{ok ? 'Payment Successful!' : 'Transfer Failed'}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(620).duration(400)} style={{ color: C.sub, textAlign: 'center', marginTop: 10, lineHeight: 22, fontSize: 15 }}>
          {ok ? `You've sent ${formatPeso(route.receipt!.amount)} to ${route.receipt!.receiver.name}.\nRef ${route.receipt!.reference}` : (route.error || 'Something went wrong.') + '\nNo funds were moved.'}
        </Animated.Text>
        {ok && <View style={{ marginTop: 14 }}><Pill text="SANDBOX · NO REAL MONEY MOVED" /></View>}
      </View>
      {ok ? (<>
        <Btn title="View Receipt" onPress={() => { a.resetTo('home'); a.push({ n: 'receipt', id: route.receipt!.id }); }} />
        <Btn title="Send Another" kind="ghost" onPress={() => { a.newDraft(); a.replace({ n: 'send' }); }} />
        <Btn title="Done" kind="ghost" onPress={() => a.resetTo('home')} />
      </>) : (<>
        <Btn title="Try Again" onPress={() => { a.setDraft({ key: newKey() }); a.replace({ n: 'send' }); }} />
        <Btn title="Back to Home" kind="ghost" onPress={() => a.resetTo('home')} />
      </>)}
    </View>
  );
}

/** Sandbox test balance generator. */
export function Credit() {
  const a = useApp();
  const [amount, setAmount] = useState('1000');
  const keyRef = useRef(newKey());
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const cents = parseCents(amount);
  async function go() {
    setBusy(true); setErr(null);
    try { await api('/api/sandbox/credit', { body: { amount: ((cents ?? 0) / 100).toFixed(2) }, key: keyRef.current }); hapticSuccess(); keyRef.current = newKey(); await a.refresh(); a.resetTo('home'); }
    catch (e) { hapticError(); setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Add Test Funds" subtitle="Generate simulated pesos in your sandbox wallet." onBack={a.pop} right={<Pill text="SANDBOX" />} />
      <Card hi style={{ marginBottom: S.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: C.lime, fontSize: 30, fontWeight: '800' }}>₱</Text>
          <TextInput accessibilityLabel="Test amount" value={amount} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" style={{ flex: 1, color: C.text, fontSize: 36, fontWeight: '800', paddingVertical: 10, paddingLeft: 10 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {['500', '1000', '5000', '10000'].map((v) => <Press key={v} onPress={() => setAmount(v)} label={`₱${v}`} style={{ flex: 1, paddingVertical: 10, borderRadius: R.pill, alignItems: 'center', backgroundColor: amount === v ? C.lime : '#1F251C' }}><Text style={{ color: amount === v ? C.ink : C.sub, fontWeight: '800' }}>{Number(v).toLocaleString('en-PH')}</Text></Press>)}
        </View>
      </Card>
      {err && <Banner text={err} />}
      <Banner tone="lime" text="SANDBOX ONLY. These pesos are simulated: not a deposit, not redeemable, and impossible to cash out. This tool does not exist in production." />
      <Btn title={`Add ${cents ? formatPeso(cents / 100) : 'funds'}`} onPress={go} loading={busy} disabled={!cents} />
    </ScrollView>
  );
}
