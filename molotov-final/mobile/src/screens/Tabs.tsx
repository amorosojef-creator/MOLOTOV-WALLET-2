import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { C, R, S, glow } from '../theme';
import { Avatar, Banner, Btn, Card, Field, Logo, Pill, Press, Row, ScreenHeader, Skeleton } from '../components/ui';
import { useApp } from '../store';
import { api, ApiError, HistoryItem, Receipt, startSession } from '../api';
import { formatPeso } from '../money';
import { TxRow } from './Home';
import { APP_VERSION, API_URL } from '../config';
import { hapticSelect, hapticSuccess } from '../motion';

export function Activity() {
  const a = useApp();
  const [q, setQ] = useState(''), [dir, setDir] = useState<'all' | 'in' | 'out'>('all');
  const [items, setItems] = useState<HistoryItem[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true), [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  async function load(reset: boolean) {
    const my = ++seq.current; setBusy(true); setErr(null);
    try {
      const p = new URLSearchParams({ limit: '20' }); if (q.trim()) p.set('q', q.trim()); if (dir !== 'all') p.set('direction', dir); if (!reset && cursor) p.set('before', cursor);
      const r = await api<{ items: HistoryItem[]; nextCursor: string | null }>(`/api/transactions?${p}`);
      if (my !== seq.current) return;
      setItems((prev) => (reset ? r.items : [...prev, ...r.items])); setCursor(r.nextCursor);
    } catch (e) { if (my === seq.current) setErr((e as Error).message); } finally { if (my === seq.current) setBusy(false); }
  }
  useEffect(() => { const t = setTimeout(() => load(true), q ? 300 : 0); return () => clearTimeout(t); }, [q, dir, a.history.length]);
  return (
    <View style={{ flex: 1, padding: S.xl, paddingBottom: 0 }}>
      <ScreenHeader title="Activity" subtitle="Every sandbox transaction, with receipts." />
      <TextInput accessibilityLabel="Search activity" value={q} onChangeText={setQ} placeholder="Search name, handle, note or reference" placeholderTextColor="#5F6A5C" autoCapitalize="none" style={{ backgroundColor: C.card, color: C.text, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 12 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(['all', 'in', 'out'] as const).map((d) => <Press key={d} onPress={() => { hapticSelect(); setDir(d); }} label={`Filter ${d}`} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.pill, backgroundColor: dir === d ? C.lime : '#1B1F1A' }}><Text style={{ color: dir === d ? C.ink : C.sub, fontWeight: '800', fontSize: 13 }}>{d === 'all' ? 'All' : d === 'in' ? 'Received' : 'Sent'}</Text></Press>)}
      </View>
      {err && <Banner text={err} onRetry={() => load(true)} />}
      <FlatList data={items} keyExtractor={(t) => t.id} showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <TxRow t={item} onPress={() => a.push({ n: 'receipt', id: item.id })} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#20261D' }} />}
        onEndReachedThreshold={0.4} onEndReached={() => { if (cursor && !busy) load(false); }}
        ListEmptyComponent={busy ? <View style={{ gap: 14, paddingTop: 10 }}>{[0, 1, 2, 3].map((k) => <Skeleton key={k} h={44} />)}</View> : <Text style={{ color: C.muted, textAlign: 'center', marginTop: 40 }}>{q ? 'No matches.' : 'No transactions yet.'}</Text>}
        ListFooterComponent={busy && items.length ? <ActivityIndicator color={C.lime} style={{ margin: 16 }} /> : <View style={{ height: 24 }} />} />
    </View>
  );
}

export function Receive() {
  const a = useApp();
  const [copied, setCopied] = useState(false);
  const qr = a.me?.qr;
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, alignItems: 'center' }}>
      <ScreenHeader title="Receive" subtitle="Let another Molotov test user scan this code to send you test funds." />
      <Animated.View entering={FadeInDown.duration(400)} style={[{ backgroundColor: C.paper, padding: 22, borderRadius: R.xl, marginVertical: S.md }, glow(C.lime, 30, 0.5)]}>
        {qr ? <QRCode value={qr} size={220} color="#0A0A0A" backgroundColor={C.paper} /> : <Skeleton h={220} w={220} />}
      </Animated.View>
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginTop: 8 }}>{a.me?.displayName}</Text>
      <Text style={{ color: C.lime, fontWeight: '700', marginBottom: S.md }}>@{a.me?.handle}</Text>
      <Banner tone="lime" text="MOLOTOV SANDBOX QR. This is not a QR Ph code and cannot receive money from GCash, Maya, GoTyme or banks." />
      <View style={{ width: '100%' }}>
        <Btn title={copied ? 'Copied ✓' : 'Copy Test QR Address'} onPress={async () => { if (qr) { await Clipboard.setStringAsync(qr); setCopied(true); hapticSuccess(); setTimeout(() => setCopied(false), 1800); } }} />
        <Btn kind="ghost" title="Share My Handle" onPress={() => Share.share({ message: `Pay me on Molotov (sandbox): @${a.me?.handle}` })} />
      </View>
    </ScrollView>
  );
}

function Item({ icon, title, sub, onPress, right }: { icon: string; title: string; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Press onPress={onPress} label={title} disabled={!onPress && !right} haptic={!!onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 }}>
      <Text style={{ color: C.lime, fontSize: 20, width: 28, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>{!!sub && <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{sub}</Text>}</View>
      {right ?? (onPress ? <Text style={{ color: C.muted, fontSize: 20 }}>›</Text> : null)}
    </Press>
  );
}
const Sep = () => <View style={{ height: 1, backgroundColor: '#20261D' }} />;

export function Profile() {
  const a = useApp();
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: 40 }}>
      <ScreenHeader title="Profile & Settings" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={a.me?.displayName || '?'} size={56} />
        <View style={{ flex: 1 }}><Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>{a.me?.displayName}</Text><Text style={{ color: C.muted }}>@{a.me?.handle}</Text><Text numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>{a.me?.email}</Text></View>
        <Pill text="SANDBOX" />
      </Card>
      <Card style={{ marginTop: S.lg, paddingVertical: 4 }}>
        <Item icon="▣" title="Demo Wallet" sub={formatPeso(a.me?.balance || 0)} right={<Pill text="TEST FUNDS" />} />
        <Sep />
        <Item icon="⛨" title="Security" sub="Biometric lock, password, sessions" onPress={() => a.push({ n: 'security' })} />
        <Sep />
        <Item icon="⇄" title="Payment rails" sub="GCash · Maya · GoTyme · QR Ph: not enabled" onPress={() => a.push({ n: 'rails' })} />
        {a.me?.role === 'admin' && <><Sep /><Item icon="☷" title="Compliance console" sub="Read-only back-office demo" onPress={() => a.push({ n: 'admin' })} /></>}
        <Sep />
        <Item icon="ⓘ" title="About Molotov" sub={`Version ${APP_VERSION} (Sandbox) · ₱0 Molotov fees`} />
      </Card>
      <View style={{ height: S.lg }} />
      <Btn kind="danger" title="Sign Out" onPress={a.signOut} />
      <Text style={{ color: '#4F594C', fontSize: 10, textAlign: 'center', marginTop: S.md }}>{API_URL}</Text>
    </ScrollView>
  );
}

export function Security() {
  const a = useApp();
  const [cur, setCur] = useState(''), [nw, setNw] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; tone: 'lime' | 'danger' } | null>(null);
  const [log, setLog] = useState<{ event: string; ip: string | null; created_at: string }[]>([]);
  const [pinPw, setPinPw] = useState(''), [newPin, setNewPin] = useState(''), [pinBusy, setPinBusy] = useState(false), [pinMsg, setPinMsg] = useState<{ t: string; tone: 'lime' | 'danger' } | null>(null);
  async function changePin() {
    setPinBusy(true); setPinMsg(null);
    try { await api('/api/me/pin', { body: { currentPassword: pinPw, newPin } }); setPinPw(''); setNewPin(''); setPinMsg({ t: 'Transaction PIN updated.', tone: 'lime' }); hapticSuccess(); }
    catch (e) { setPinMsg({ t: (e as Error).message, tone: 'danger' }); } finally { setPinBusy(false); }
  }
  useEffect(() => { api<{ events: typeof log }>('/api/me/activity-log').then((r) => setLog(r.events)).catch(() => {}); }, []);
  async function change() {
    setBusy(true); setMsg(null);
    try { const r = await api<any>('/api/me/password', { body: { currentPassword: cur, newPassword: nw } }); await startSession(r); setCur(''); setNw(''); setMsg({ t: r.notice, tone: 'lime' }); hapticSuccess(); }
    catch (e) { setMsg({ t: (e as Error).message, tone: 'danger' }); } finally { setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Security" onBack={a.pop} />
      <Card style={{ paddingVertical: 4 }}>
        <Item icon="☺" title={Platform.OS === 'ios' ? 'Face ID / Touch ID lock' : 'Biometric lock'} sub={a.bioAvailable ? 'Required to open the app and confirm transfers' : 'Not available on this device'}
          right={<Switch value={a.lockOn} disabled={!a.bioAvailable} onValueChange={(v) => a.setLock(v)} trackColor={{ true: C.lime, false: '#2A3027' }} thumbColor="#fff" />} />
      </Card>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginTop: S.xl, marginBottom: S.md }}>Change password</Text>
      {msg && <Banner text={msg.t} tone={msg.tone} />}
      <Field label="CURRENT PASSWORD" value={cur} onChangeText={setCur} secureTextEntry />
      <Field label="NEW PASSWORD" value={nw} onChangeText={setNw} secureTextEntry placeholder="At least 10 characters" />
      <Btn title="Update Password" onPress={change} loading={busy} disabled={!cur || nw.length < 10} />
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginTop: S.xl, marginBottom: S.md }}>Change transaction PIN</Text>
      {pinMsg && <Banner text={pinMsg.t} tone={pinMsg.tone} />}
      <Field label="ACCOUNT PASSWORD" value={pinPw} onChangeText={setPinPw} secureTextEntry />
      <Field label="NEW 6-DIGIT PIN" value={newPin} onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))} secureTextEntry keyboardType="number-pad" maxLength={6} />
      <Btn title="Update PIN" onPress={changePin} loading={pinBusy} disabled={!pinPw || newPin.length !== 6} />
      <Btn kind="ghost" title="Sign out of all devices" onPress={async () => { await api('/api/auth/logout-all', { body: {} }); a.signOut(); }} />
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginTop: S.xl, marginBottom: S.sm }}>Recent account activity</Text>
      <Card style={{ paddingVertical: 6 }}>{log.length === 0 ? <Text style={{ color: C.muted, padding: 10 }}>No events.</Text> : log.map((e, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}><Text style={{ color: C.text, fontSize: 13 }}>{e.event.replace(/_/g, ' ')}</Text><Text style={{ color: C.muted, fontSize: 12 }}>{new Date(e.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View>)}</Card>
      <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17, marginTop: S.lg }}>Sandbox security only. Production needs KYC, device binding, transaction PIN/MFA, fraud monitoring and an independent security audit before holding real funds.</Text>
    </ScrollView>
  );
}

export function Rails() {
  const a = useApp();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api('/api/rails', { auth: false }).then(setD).catch(() => {}); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl }}>
      <ScreenHeader title="Payment rails" subtitle="Real-money transfers need a licensed partner." onBack={a.pop} />
      <Banner tone="lime" text={d?.notice || 'No licensed provider is connected.'} />
      <Card style={{ paddingVertical: 4 }}>
        {(d?.rails || [{ id: 'gcash', label: 'GCash' }, { id: 'maya', label: 'Maya' }, { id: 'gotyme', label: 'GoTyme' }, { id: 'qrph', label: 'QR Ph (personal)' }]).map((r: any, i: number) => (
          <View key={r.id}>{i > 0 && <Sep />}<Item icon="⇄" title={r.label} sub="Requires licensed provider integration" right={<Pill text="NOT ENABLED" tone="muted" />} /></View>
        ))}
      </Card>
      <Text style={{ color: C.muted, fontSize: 12, lineHeight: 19, marginTop: S.lg }}>Molotov charges ₱0.00 in fees. Partner banks and networks may charge their own fees, which will always be disclosed before you confirm.</Text>
    </ScrollView>
  );
}

export function Admin() {
  const a = useApp();
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null);
  useEffect(() => { api('/api/admin/overview').then(setD).catch((e) => setErr(e.message)); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl }}>
      <ScreenHeader title="Compliance console" subtitle="Read-only sandbox back-office scaffold" onBack={a.pop} />
      {err && <Banner text={err} />}
      {d && <><Card><Row k="Users" v={String(d.users)} /><Row k="Transfers" v={String(d.transfers)} /><Row k="Transfer volume" v={formatPeso(d.sandboxVolume)} /><Row k="Wallet balances" v={formatPeso(d.userWalletsTotal)} />
        <Row k="Ledger integrity" v={d.ledgerBalanced ? 'BALANCED ✓' : 'BREAK DETECTED'} accent={d.ledgerBalanced} /></Card>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', marginVertical: S.md }}>Recent audit events</Text>
        <Card>{d.recentAudit.map((e: any, i: number) => <Row key={i} k={String(e.action).replace(/[._]/g, ' ')} v={new Date(e.at).toLocaleTimeString()} />)}</Card></>}
    </ScrollView>
  );
}

export function ReceiptScreen({ id }: { id: string }) {
  const a = useApp();
  const [r, setR] = useState<Receipt | null>(null), [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Receipt>(`/api/transactions/${id}`).then(setR).catch((e) => setErr(e.message)); }, [id]);
  const share = () => r && Share.share({ message: `Molotov sandbox receipt ${r.reference}: ${formatPeso(r.amount)} ${r.sender ? `from @${r.sender.handle} ` : ''}to @${r.receiver.handle}. No real money moved.` });
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: 40 }}>
      <ScreenHeader title="Transaction Details" onBack={a.pop} />
      {err && <Banner text={err} />}
      {!r && !err && <Skeleton h={380} r={18} />}
      {r && (
        <Animated.View entering={FadeInDown.duration(400)} style={{ backgroundColor: C.paper, borderRadius: 18, padding: 22, ...glow('#000', 20, 0.4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ backgroundColor: '#0A0A0A', padding: 6, borderRadius: 8 }}><Logo size={14} /></View><Text style={{ fontSize: 20, fontWeight: '800', color: '#0A0A0A' }}>Molotov</Text></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#0A0A0A' }}>{r.kind === 'sandbox_credit' ? 'Test Funds Receipt' : 'Transfer Receipt'}</Text>
            <View style={{ backgroundColor: r.status === 'completed' ? C.lime : r.status === 'pending' ? '#FFE48A' : '#FFB3B3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}><Text style={{ fontWeight: '800', fontSize: 12, color: '#0A0A0A' }}>{r.status === 'completed' ? 'Successful' : r.status[0].toUpperCase() + r.status.slice(1)}</Text></View>
          </View>
          {([['Transaction ID', r.reference], ['Date & Time', new Date(r.completedAt || r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })], ['From', r.sender ? `${r.sender.name} (@${r.sender.handle})` : 'Sandbox faucet'], ['To', `${r.receiver.name} (@${r.receiver.handle})`], ['Amount', formatPeso(r.amount)], ['Fee', formatPeso(r.fee)], ...(r.note ? [['Note', r.note]] : [])] as [string, string][]).map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#DADCD6', borderStyle: 'dashed' }}><Text style={{ color: '#5C6358', fontSize: 13 }}>{k}</Text><Text style={{ color: '#0A0A0A', fontWeight: '700', fontSize: 13, maxWidth: '64%', textAlign: 'right' }}>{v}</Text></View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, alignItems: 'center' }}><Text style={{ fontWeight: '800', fontSize: 17, color: '#0A0A0A' }}>Total</Text><Text style={{ fontWeight: '800', fontSize: 20, color: '#0A0A0A', backgroundColor: C.lime, paddingHorizontal: 8, borderRadius: 4, overflow: 'hidden' }}>{formatPeso(r.total)}</Text></View>
          <Text style={{ color: '#7A8276', fontSize: 11, marginTop: 14, textAlign: 'center' }}>SANDBOX RECEIPT · Simulated funds · Not a bank record</Text>
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: S.xl }}>
        <Press onPress={share} label="Share receipt" style={{ alignItems: 'center' }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#1B1F1A', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.lime, fontSize: 20 }}>↗</Text></View><Text style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>Share</Text></Press>
        <Press onPress={() => r && Clipboard.setStringAsync(r.reference).then(() => Alert.alert('Copied', r.reference))} label="Copy reference" style={{ alignItems: 'center' }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#1B1F1A', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.lime, fontSize: 20 }}>⧉</Text></View><Text style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>Copy ID</Text></Press>
      </View>
    </ScrollView>
  );
}
