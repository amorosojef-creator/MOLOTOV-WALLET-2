import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getItem, setItem } from './storage';

export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
export const lockEnabled = async () => (await getItem('lock')) === '1';
export const setLockEnabled = (on: boolean) => setItem('lock', on ? '1' : '0');

/** Resolves true if the user passes device authentication (Face ID / fingerprint / device passcode). */
export async function authenticate(reason: string): Promise<boolean> {
  if (!(await biometricsAvailable())) return true; // nothing to check against; server auth still applies
  try { const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false }); return r.success; } catch { return false; }
}
