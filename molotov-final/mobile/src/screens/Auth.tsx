import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S, glow } from '../theme';
import { Banner, Btn, Field, Logo, Press, Wordmark } from '../components/ui';
import { api, ApiError, startSession } from '../api';
import { hapticError, hapticSuccess, useMotion } from '../motion';
import { API_URL, IS_HTTPS, LOCAL_MODE } from '../config';

function HeroMark() {
  const { reduce } = useMotion();
  const r = useSharedValue(0), p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    r.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1);
    p.value = withRepeat(withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })), -1);
  }, [reduce]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }, { scaleY: 0.38 }] }));
  const pulse = useAnimatedStyle(() => ({ opacity: 0.35 + p.value * 0.45, transform: [{ scale: 1 + p.value * 0.06 }] }));
  return (
    <View style={{ height: 250, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 6, borderColor: C.lime, ...glow(C.lime, 24, 0.9) }, ring]} />
      <Animated.View style={[{ position: 'absolute', width: 190, height: 190, borderRadius: 40, backgroundColor: C.limeSoft }, pulse]} />
      <View style={{ width: 150, height: 150, borderRadius: 36, backgroundColor: '#0F130C', borderWidth: 1.5, borderColor: C.limeLine, alignItems: 'center', justifyContent: 'center', ...glow(C.lime, 30, 0.55) }}>
        <Logo size={44} />
      </View>
    </View>
  );
}

const SLIDES = [
  { t: 'Instant Transfers', d: 'Send test funds between Molotov accounts in a heartbeat.' },
  { t: 'Safer by Design', d: 'Every transfer is idempotent, double-entry journaled and verified by the server.' },
  { t: 'Sandbox First', d: 'Real GCash, Maya, GoTyme and QR Ph arrive only through licensed partners.' },
];

export function Onboarding({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 3800); return () => clearInterval(t); }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient colors={['rgba(204,255,0,0.12)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: S.xl, justifyContent: 'center' }}>
        <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}><Wordmark /></Animated.View>
        <HeroMark />
        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={{ alignItems: 'center', marginBottom: S.xl }}>
          <Text accessibilityRole="header" style={{ color: C.text, fontSize: 32, fontWeight: '800', textAlign: 'center', lineHeight: 38 }}>Welcome to{'\n'}Molotov</Text>
          <Animated.Text key={i} entering={FadeIn.duration(400)} style={{ color: C.sub, textAlign: 'center', marginTop: 12, lineHeight: 21, minHeight: 64 }}>
            <Text style={{ color: C.lime, fontWeight: '800' }}>{SLIDES[i].t}{'\n'}</Text>{SLIDES[i].d}
          </Animated.Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>{SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.lime : '#3A4235' }} />)}</View>
        </Animated.View>
        <Btn title="Get Started  →" onPress={onStart} />
        <Btn title="Log In" kind="ghost" onPress={onLogin} />
        <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: S.lg, lineHeight: 17 }}>Molotov is a SANDBOX build. Balances are simulated and not real money.{LOCAL_MODE ? '\nStandalone mode: everything stays on this phone.' : !IS_HTTPS ? `\nDev server: ${API_URL}` : ''}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AuthScreen({ initialRegister, onDone, onBack }: { initialRegister: boolean; onDone: () => void; onBack: () => void }) {
  const [reg, setReg] = useState(initialRegister);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [handle, setHandle] = useState(''), [name, setName] = useState(''), [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const hErr = reg && handle && !/^[a-z0-9_]{3,24}$/.test(handle.toLowerCase()) ? '3-24 characters: letters, numbers, underscore' : null;
  const pErr = reg && password && password.length < 10 ? 'At least 10 characters' : null;
  const valid = /^\S+@\S+\.\S+$/.test(email) && password.length >= (reg ? 10 : 1) && (!reg || (/^[a-z0-9_]{3,24}$/.test(handle.toLowerCase()) && /^\d{6}$/.test(pin)));

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ accessToken: string; refreshToken: string }>(reg ? '/api/auth/register' : '/api/auth/login', { auth: false, body: { email, password, ...(reg ? { handle: handle.toLowerCase(), displayName: name.trim() || handle, pin } : {}) } });
      await startSession(d); hapticSuccess(); onDone();
    } catch (e) { hapticError(); setErr(e instanceof ApiError ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: S.xl, paddingTop: S.lg, maxWidth: Math.min(width, 520), alignSelf: 'center', width: '100%' }} keyboardShouldPersistTaps="handled">
          <Press onPress={onBack} label="Back" style={{ alignSelf: 'flex-start', marginBottom: S.lg }}><Text style={{ color: C.lime, fontWeight: '700' }}>‹ Back</Text></Press>
          <Wordmark />
          <Text accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '800', marginTop: S.xl }}>{reg ? 'Create your wallet' : 'Welcome back'}</Text>
          <Text style={{ color: C.muted, marginTop: 6, marginBottom: S.xl, lineHeight: 20 }}>Sandbox account. Test balances only, never real funds.</Text>
          {err && <Banner text={err} />}
          {reg && <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Alex Morgan" autoCapitalize="words" textContentType="name" />}
          <Field label="EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" textContentType="emailAddress" autoComplete="email" />
          {reg && <Field label="HANDLE" value={handle} onChangeText={(t) => setHandle(t.toLowerCase())} placeholder="alexmorgan" error={hErr} />}
          <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry placeholder={reg ? 'At least 10 characters' : 'Your password'} error={pErr} textContentType={reg ? 'newPassword' : 'password'} onSubmitEditing={() => valid && !busy && submit()} />
          {reg && <Field label="6-DIGIT TRANSACTION PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Needed to confirm every transfer" />}
          <Btn title={reg ? 'Create Account' : 'Sign In'} onPress={submit} loading={busy} disabled={!valid} />
          <Btn kind="ghost" title={reg ? 'I already have an account' : 'New here? Create an account'} onPress={() => { setReg(!reg); setErr(null); }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
