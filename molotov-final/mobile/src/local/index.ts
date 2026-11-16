import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createEngine } from './engine.ts';

// Standalone mode: the whole sandbox backend runs inside the app, data stored on this phone.
export const localEngine = createEngine({
  load: () => AsyncStorage.getItem('molotov.local.db.v1'),
  save: (s) => AsyncStorage.setItem('molotov.local.db.v1', s),
  hash: (salt, secret) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${secret}:molotov`),
  random: (n) => Array.from(Crypto.getRandomBytes(n), (x) => x.toString(16).padStart(2, '0')).join(''),
});
