import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, ViewStyle, StyleProp, TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, withSequence, FadeIn, FadeInDown, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, glow } from '../theme';
import { hapticSelect, hapticTap, useMotion } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Press({ onPress, style, children, disabled, haptic = true, label, role = 'button', hitSlop }: {
  onPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean; haptic?: boolean; label?: string; role?: 'button' | 'tab' | 'link'; hitSlop?: number;
}) {
  const { reduce } = useMotion();
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} hitSlop={hitSlop}
      disabled={disabled}
      onPressIn={() => { if (!reduce) s.value = withSpring(0.96, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { if (!reduce) s.value = withSpring(1, { damping: 12, stiffness: 300 }); }}
      onPress={() => { if (haptic) hapticTap(); onPress?.(); }}
      style={[style, a, disabled && { opacity: 0.45 }]}
    >{children}</AnimatedPressable>
  );
}

export function Btn({ title, onPress, kind = 'primary', disabled, loading, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; icon?: string }) {
  const bg = kind === 'primary' ? C.lime : kind === 'danger' ? C.dangerSoft : '#1B1F1A';
  const fg = kind === 'primary' ? C.ink : kind === 'danger' ? C.danger : C.text;
  return (
    <Press onPress={onPress} disabled={disabled || loading} label={title} style={[st.btn, { backgroundColor: bg }, kind === 'primary' && !disabled && glow(C.lime, 14, 0.4), kind === 'danger' && { borderWidth: 1, borderColor: 'rgba(255,92,92,0.4)' }]}>
      {loading ? <Dots color={fg} /> : <Text style={[st.btnText, { color: fg }]}>{icon ? `${icon}  ` : ''}{title}</Text>}
    </Press>
  );
}

export function Dots({ color = C.ink }: { color?: string }) {
  const { reduce } = useMotion();
  const o = [useSharedValue(0.3), useSharedValue(0.3), useSharedValue(0.3)];
  useEffect(() => {
    if (reduce) { o.forEach((v) => (v.value = 0.8)); return; }
    o.forEach((v, i) => { v.value = withRepeat(withSequence(withTiming(0.3, { duration: i * 140 }), withTiming(1, { duration: 280 }), withTiming(0.3, { duration: 280 })), -1); });
  }, [reduce]);
  const s = o.map((v) => useAnimatedStyle(() => ({ opacity: v.value })));
  return <View style={{ flexDirection: 'row', gap: 6, height: 20, alignItems: 'center' }} accessibilityLabel="Loading">{s.map((x, i) => <Animated.View key={i} style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, x]} />)}</View>;
}

export function Field({ label, error, ...p }: TextInputProps & { label: string; error?: string | null }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label} placeholderTextColor="#5F6A5C" autoCapitalize="none" autoCorrect={false}
        onFocus={() => { setFocus(true); hapticSelect(); }} onBlur={() => setFocus(false)}
        {...p}
        style={[st.input, focus && { borderColor: C.lime, ...glow(C.lime, 10, 0.25) }, !!error && { borderColor: C.danger }, p.style]}
      />
      {!!error && <Text style={{ color: C.danger, fontSize: 12, marginTop: 6 }}>{error}</Text>}
    </View>
  );
}

export function Card({ children, style, hi }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; hi?: boolean }) {
  return <View style={[st.card, hi && { borderColor: C.limeLine, backgroundColor: C.cardHi }, hi && glow(C.lime, 20, 0.28), style]}>{children}</View>;
}

export function Logo({ size = 28 }: { size?: number }) {
  return <Image source={require('../../assets/logo.png')} style={{ width: size * 2.34, height: size }} resizeMode="contain" accessibilityLabel="Molotov" />;
}
export function Wordmark() {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Logo size={20} /><Text style={{ color: C.text, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 }}>Molotov</Text></View>;
}

export function Pill({ text, tone = 'lime' }: { text: string; tone?: 'lime' | 'danger' | 'muted' }) {
  const bg = tone === 'lime' ? C.limeSoft : tone === 'danger' ? C.dangerSoft : '#20251E';
  const fg = tone === 'lime' ? C.lime : tone === 'danger' ? C.danger : C.muted;
  return <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, borderWidth: 1, borderColor: tone === 'lime' ? 'rgba(204,255,0,0.35)' : 'transparent' }}><Text style={{ color: fg, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{text}</Text></View>;
}

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const ini = (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const h = hue(name);
  return (
    <LinearGradient colors={[`hsl(${h},35%,28%)`, `hsl(${(h + 40) % 360},40%,16%)`]} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
      <Text style={{ color: C.text, fontWeight: '800', fontSize: size * 0.36 }}>{ini}</Text>
    </LinearGradient>
  );
}

export function Banner({ text, tone = 'danger', onRetry }: { text: string; tone?: 'danger' | 'lime'; onRetry?: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} accessibilityRole="alert" style={[st.banner, tone === 'danger' ? { backgroundColor: C.dangerSoft, borderColor: 'rgba(255,92,92,0.4)' } : { backgroundColor: C.limeSoft, borderColor: C.limeLine }]}>
      <Text style={{ color: tone === 'danger' ? '#FFB3B3' : C.lime, flex: 1, fontSize: 13, lineHeight: 19 }}>{text}</Text>
      {onRetry && <Press onPress={onRetry} label="Retry"><Text style={{ color: C.text, fontWeight: '800', fontSize: 13 }}>Retry</Text></Press>}
    </Animated.View>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  const { reduce } = useMotion();
  const o = useSharedValue(0.35);
  useEffect(() => { if (!reduce) o.value = withRepeat(withSequence(withTiming(0.8, { duration: 700 }), withTiming(0.35, { duration: 700 })), -1); }, [reduce]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height: h, width: w as any, borderRadius: r, backgroundColor: '#20271D' }, a]} />;
}

/** Animated number: eases from previous value to the new value (respects Reduce Motion). */
export function CountUp({ value, style, prefix = '₱' }: { value: number; style?: any; prefix?: string }) {
  const { reduce } = useMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const start = from.current, delta = value - start, t0 = Date.now(), dur = 900;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      const v = start + delta * e; from.current = v; setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick); else { from.current = value; setShown(value); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  const [w, f] = Math.abs(shown).toFixed(2).split('.');
  return <Text style={style} accessibilityLabel={`${prefix}${value.toFixed(2)}`}>{prefix}{w.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}<Text style={{ opacity: 0.6 }}>.{f}</Text></Text>;
}

export function ScreenHeader({ title, subtitle, onBack, right }: { title?: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ marginBottom: S.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44 }}>
        <View style={{ width: 44 }}>{onBack && <Press onPress={onBack} label="Go back" style={st.iconBtn}><Text style={{ color: C.text, fontSize: 22, marginTop: -2 }}>‹</Text></Press>}</View>
        <Text accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: C.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
        <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
      </View>
      {!!subtitle && <Text style={{ color: C.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 6 }}>{subtitle}</Text>}
    </View>
  );
}

export function Row({ k, v, strong, accent }: { k: string; v: string; strong?: boolean; accent?: boolean }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 }}><Text style={{ color: C.muted, fontSize: 14 }}>{k}</Text><Text style={{ color: accent ? C.lime : C.text, fontSize: strong ? 17 : 14, fontWeight: strong ? '800' : '600', maxWidth: '65%', textAlign: 'right' }}>{v}</Text></View>;
}

export { FadeIn, FadeInDown, Easing };

const st = StyleSheet.create({
  btn: { minHeight: 54, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginVertical: 5 },
  btnText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  label: { color: C.sub, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  input: { ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}), backgroundColor: C.card, color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },
  card: { backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: R.md, padding: 14, marginBottom: S.lg },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1E19', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
});
