import React, { useEffect } from 'react';
import { Text, View, StyleSheet, Image } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, glow } from '../theme';
import { Press } from './ui';
import { hapticSelect, useMotion } from '../motion';

export type Tab = 'home' | 'activity' | 'receive' | 'profile';
const ITEMS: { id: Tab | 'scan'; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' }, { id: 'activity', label: 'Activity', icon: '◷' },
  { id: 'scan', label: 'Scan', icon: '' },
  { id: 'receive', label: 'Receive', icon: '⇩' }, { id: 'profile', label: 'Profile', icon: '☺' },
];

function Item({ it, active, onPress }: { it: (typeof ITEMS)[number]; active: boolean; onPress: () => void }) {
  const { reduce } = useMotion();
  const y = useSharedValue(0), op = useSharedValue(active ? 1 : 0.55);
  useEffect(() => { y.value = reduce ? 0 : withSpring(active ? -4 : 0, { damping: 11, stiffness: 220 }); op.value = withSpring(active ? 1 : 0.55); }, [active, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: op.value }));
  return (
    <Press role="tab" label={it.label} onPress={() => { hapticSelect(); onPress(); }} haptic={false} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
      <Animated.View style={[{ alignItems: 'center' }, a]}>
        <Text style={{ fontSize: 20, color: active ? C.lime : C.sub }}>{it.icon}</Text>
        <Text style={{ fontSize: 10, fontWeight: '700', color: active ? C.lime : C.sub, marginTop: 2 }}>{it.label}</Text>
      </Animated.View>
    </Press>
  );
}

export function BottomNav({ tab, onTab, onScan }: { tab: Tab; onTab: (t: Tab) => void; onScan: () => void }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={[st.wrap, { paddingBottom: Math.max(ins.bottom, 10) }]} accessibilityRole="tablist">
      {ITEMS.map((it) => it.id === 'scan' ? (
        <View key="scan" style={{ flex: 1, alignItems: 'center' }}>
          <Press label="Scan QR" onPress={onScan} style={[st.fab, glow(C.lime, 22, 0.7)]}>
            <Image source={require('../../assets/logo.png')} style={{ width: 34, height: 15 }} resizeMode="contain" />
          </Press>
        </View>
      ) : <Item key={it.id} it={it} active={tab === it.id} onPress={() => onTab(it.id as Tab)} />)}
    </View>
  );
}
const st = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(14,16,13,0.96)', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4 },
  fab: { width: 62, height: 62, borderRadius: 31, marginTop: -26, backgroundColor: '#10140D', borderWidth: 2, borderColor: C.lime, alignItems: 'center', justifyContent: 'center' },
});
