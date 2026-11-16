import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, glow } from '../theme';
import { Avatar, Banner, Card, CountUp, Logo, Pill, Press, Skeleton } from '../components/ui';
import { useApp } from '../store';
import { formatPeso } from '../money';
import type { HistoryItem } from '../api';
import { useMotion } from '../motion';

export function TxRow({ t, onPress }: { t: HistoryItem; onPress: () => void }) {
  const inbound = t.direction === 'in';
  const title = t.kind === 'sandbox_credit' ? 'Test funds added' : inbound ? `From ${t.counterparty?.name}` : `To ${t.counterparty?.name}`;
  const sign = inbound ? '+' : '−';
  return (
    <Press onPress={onPress} label={`${title}, ${sign}${formatPeso(t.amount)}, ${t.status}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      {t.kind === 'sandbox_credit' ? <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.limeSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.lime, fontSize: 18 }}>✦</Text></View> : <Avatar name={t.counterparty?.name || '?'} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{new Date(t.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{t.note ? ` · ${t.note}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: inbound ? C.lime : C.text, fontWeight: '800', fontSize: 15 }}>{sign}{formatPeso(t.amount)}</Text>
        {t.status !== 'completed' && <Pill text={t.status.toUpperCase()} tone={t.status === 'pending' ? 'muted' : 'danger'} />}
      </View>
    </Press>
  );
}

const QUICK = [
  { id: 'send', label: 'Send', icon: '↗' }, { id: 'credit', label: 'Add Funds', icon: '＋' }, { id: 'scan', label: 'Scan QR', icon: '▣' }, { id: 'receive', label: 'Receive', icon: '↙' },
] as const;

export function Home() {
  const a = useApp();
  const { reduce } = useMotion();
  const [hide, setHide] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const first = (a.me?.displayName || a.me?.handle || '').split(' ')[0];
  const go = (id: (typeof QUICK)[number]['id']) => { if (id === 'receive') a.resetTo('receive'); else { if (id === 'send') a.newDraft(); a.push({ n: id } as any); } };
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: 30 }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.lime} onRefresh={async () => { setRefreshing(true); await a.refresh(); setRefreshing(false); }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: S.xl }}>
        <Avatar name={a.me?.displayName || '?'} size={46} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>Hi, {first || '…'} 👋</Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>Good to see you again.</Text>
        </View>
        <Pill text="SANDBOX" />
      </View>

      {a.error && <Banner text={a.error} onRetry={a.refresh} />}

      <Animated.View entering={reduce ? undefined : FadeInDown.duration(450)}>
        <View style={[{ borderRadius: R.xl, borderWidth: 1.5, borderColor: C.lime, overflow: 'hidden' }, glow(C.lime, 26, 0.45)]}>
          <LinearGradient colors={['#1B2410', '#0E120A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: S.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Logo size={16} /><Text style={{ color: C.text, fontWeight: '700' }}>Molotov</Text></View>
              <Pill text="DEMO WALLET" />
            </View>
            <Text style={{ color: C.sub, fontSize: 12, marginTop: S.lg }}>Simulated balance</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {!a.loaded ? <View style={{ marginVertical: 14 }}><Skeleton h={40} w={200} /></View>
                : hide ? <Text style={{ color: C.text, fontSize: 38, fontWeight: '800', marginVertical: 6 }}>₱ ••••••</Text>
                : <CountUp value={Number(a.me?.balance || 0)} style={{ color: C.text, fontSize: 38, fontWeight: '800', marginVertical: 6 }} />}
              <Press onPress={() => setHide(!hide)} label={hide ? 'Show balance' : 'Hide balance'} hitSlop={12}><Text style={{ color: C.sub, fontSize: 22 }}>{hide ? '◉' : '◎'}</Text></Press>
            </View>
            <Text style={{ color: C.muted, fontSize: 11 }}>Test funds only · ₱0.00 Molotov fees · Not redeemable</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: S.xl }}>
        {QUICK.map((q, i) => (
          <Animated.View key={q.id} entering={reduce ? undefined : FadeInDown.delay(80 + i * 60).duration(400)} style={{ width: '23%' }}>
            <Press onPress={() => go(q.id)} label={q.label} style={{ alignItems: 'center' }}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#161A15', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.lime, fontSize: 22 }}>{q.icon}</Text></View>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 8, fontWeight: '600' }}>{q.label}</Text>
            </Press>
          </Animated.View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: S.xl + 4, marginBottom: 4 }}>
        <Text accessibilityRole="header" style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Recent Transactions</Text>
        <Press onPress={() => a.resetTo('activity')} label="See all"><Text style={{ color: C.lime, fontWeight: '700', fontSize: 13 }}>See All</Text></Press>
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {!a.loaded ? [0, 1, 2].map((k) => <View key={k} style={{ paddingVertical: 14 }}><Skeleton h={44} /></View>)
          : a.history.length === 0 ? <Text style={{ color: C.muted, padding: 18, textAlign: 'center', lineHeight: 20 }}>No activity yet.{'\n'}Add test funds, then send to a second test account.</Text>
          : a.history.slice(0, 5).map((t, i) => <View key={t.id} style={i ? { borderTopWidth: 1, borderTopColor: '#20261D' } : undefined}><TxRow t={t} onPress={() => a.push({ n: 'receipt', id: t.id })} /></View>)}
      </Card>
    </ScrollView>
  );
}
