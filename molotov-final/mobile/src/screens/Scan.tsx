import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S, glow } from '../theme';
import { Banner, Btn, Card, Press, Row } from '../components/ui';
import { useApp } from '../store';
import { api, QrInspect } from '../api';
import { classifyScan } from '../qr';
import { hapticError, hapticSuccess, hapticTap, useMotion } from '../motion';

export function Scan() {
  const a = useApp();
  const { reduce } = useMotion();
  const [perm, ask] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [locked, setLocked] = useState(false);
  const [blocked, setBlocked] = useState<{ title: string; lines: [string, string][]; reason: string } | null>(null);
  const [manual, setManual] = useState(''), [showManual, setShowManual] = useState(Platform.OS === 'web');
  const [err, setErr] = useState<string | null>(null);
  const line = useSharedValue(0);
  useEffect(() => { if (!reduce) line.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true); }, [reduce]);
  const compact = !!blocked || showManual;
  const box = compact ? 150 : 260;
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.value * (box - 24) }] }));
  const cooling = useRef(false);

  async function handle(data: string) {
    if (cooling.current) return; cooling.current = true; setLocked(true); setErr(null); setBlocked(null);
    const local = classifyScan(data);
    try {
      if (local.kind === 'molotov') {
        const r = await api<QrInspect>('/api/qr/inspect', { body: { payload: data } });
        if (r.executable && r.recipient) { hapticSuccess(); a.newDraft({ to: r.recipient.handle, toName: r.recipient.displayName }); a.replace({ n: 'send' }); return; }
        throw new Error('That Molotov code does not belong to a known test account.');
      }
      hapticError();
      if (local.kind === 'qrph') {
        const r = await api<QrInspect>('/api/qr/inspect', { body: { payload: data } }).catch(() => null);
        setBlocked({
          title: 'QR Ph code detected',
          lines: [['Merchant / payee', local.merchant || 'Unknown'], ['Amount', local.amount ? `₱${local.amount}` : 'Not set'], ['Integrity (CRC)', local.crcOk ? 'Valid' : 'INVALID, may be tampered'], ['Server check', r?.inspection?.valid ? 'Format valid' : 'Format not verified']],
          reason: 'Paying real QR Ph codes (GCash, Maya, GoTyme, bank apps) is NOT enabled. Molotov has no licensed payment provider connected, so nothing can be sent. This code was only inspected.',
        });
      } else setBlocked({ title: 'Unrecognised QR code', lines: [], reason: 'Only Molotov sandbox QR codes can be used here. Nothing was sent.' });
    } catch (e) { hapticError(); setErr((e as Error).message); }
    finally { setTimeout(() => { cooling.current = false; setLocked(false); }, 1800); }
  }

  async function fromPhoto() {
    hapticTap();
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (r.canceled || !r.assets?.[0]) return;
    try { const found = await Camera.scanFromURLAsync(r.assets[0].uri, ['qr']); if (found[0]) await handle(found[0].data); else setErr('No QR code found in that photo.'); }
    catch { setErr('Could not read that photo.'); }
  }

  const granted = perm?.granted;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {granted && Platform.OS !== 'web' ? <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={locked ? undefined : (r) => handle(r.data)} /> : null}
      <SafeAreaView style={{ flex: 1, padding: S.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Press onPress={a.pop} label="Close scanner" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.text, fontSize: 22 }}>‹</Text></Press>
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: C.text, fontSize: 19, fontWeight: '800', marginRight: 40 }}>Scan QR</Text>
        </View>
        <Text style={{ color: C.sub, textAlign: 'center', marginTop: 6, fontSize: 13 }}>Scan a Molotov QR code to pay a test account.</Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {!granted && Platform.OS !== 'web' ? (
            <Card style={{ alignItems: 'center' }}><Text style={{ color: C.text, fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Camera access needed</Text><Text style={{ color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 12 }}>Molotov uses the camera only to read payment QR codes.</Text><Btn title={perm && !perm.canAskAgain ? 'Open Settings to allow' : 'Allow Camera'} onPress={() => ask()} /></Card>
          ) : (
            <View style={{ width: box, height: box }} pointerEvents="none">
              {[{ top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 26 }, { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 26 }, { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 26 }, { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 26 }].map((s, i) => <View key={i} style={[{ position: 'absolute', width: 56, height: 56, borderColor: C.lime, ...glow(C.lime, 12, 0.9) }, s as any]} />)}
              {!reduce && <Animated.View style={[{ position: 'absolute', left: 8, right: 8, top: 10, height: 3, backgroundColor: C.lime, borderRadius: 2, ...glow(C.lime, 14, 1) }, lineStyle]} />}
            </View>
          )}
        </View>
        {err && <Banner text={err} />}
        {blocked && (
          <Animated.View entering={FadeInDown.duration(250)}>
            <Card style={{ borderColor: C.danger, marginBottom: S.md }}>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>{blocked.title}</Text>
              {blocked.lines.map(([k, v]) => <Row key={k} k={k} v={v} />)}
              <Text style={{ color: '#FFB3B3', fontSize: 12, lineHeight: 18, marginTop: 8 }}>{blocked.reason}</Text>
            </Card>
          </Animated.View>
        )}
        {showManual && (
          <View style={{ marginBottom: S.md }}>
            <TextInput accessibilityLabel="Paste QR text" value={manual} onChangeText={setManual} placeholder="Paste QR text, e.g. molotov-sandbox://pay/handle" placeholderTextColor="#5F6A5C" autoCapitalize="none" autoCorrect={false} style={{ backgroundColor: 'rgba(22,26,21,0.95)', color: C.text, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: 14 }} />
            <Btn title="Use This Code" onPress={() => manual && handle(manual)} />
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
          {Platform.OS !== 'web' && <Press onPress={fromPhoto} label="Scan from photo" style={ic}><Text style={{ color: C.text, fontSize: 22 }}>▨</Text></Press>}
          <Press onPress={() => setShowManual(!showManual)} label="Enter code manually" style={ic}><Text style={{ color: C.text, fontSize: 20 }}>⌨</Text></Press>
          {Platform.OS !== 'web' && <Press onPress={() => setTorch(!torch)} label="Toggle flashlight" style={[ic, torch && { backgroundColor: C.lime }]}><Text style={{ color: torch ? C.ink : C.text, fontSize: 20 }}>⚡</Text></Press>}
        </View>
      </SafeAreaView>
    </View>
  );
}
const ic = { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(30,34,28,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border } as const;
