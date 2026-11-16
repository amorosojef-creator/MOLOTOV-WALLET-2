import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore (Keychain / Keystore) on devices. localStorage only on the web DEV preview.
const web = Platform.OS === 'web';
export async function getItem(k: string): Promise<string | null> {
  try { return web ? window.localStorage.getItem(k) : await SecureStore.getItemAsync(k); } catch { return null; }
}
export async function setItem(k: string, v: string) {
  try { if (web) window.localStorage.setItem(k, v); else await SecureStore.setItemAsync(k, v); } catch {}
}
export async function delItem(k: string) {
  try { if (web) window.localStorage.removeItem(k); else await SecureStore.deleteItemAsync(k); } catch {}
}
