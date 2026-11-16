import Constants from 'expo-constants';

// EXPO_PUBLIC_API_URL is inlined at build time (see .env / eas.json).
//  - Dev on your PC: START_MOBILE writes your PC's LAN address into .env automatically.
//  - Production builds: must be https:// (enforced in app.config.ts).
const extraUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL || extraUrl || 'http://localhost:4000').replace(/\/+$/, '');
export const IS_HTTPS = API_URL.startsWith('https://');
// EXPO_PUBLIC_API_URL=local -> STANDALONE mode: the sandbox runs inside the app, no server needed.
export const LOCAL_MODE: boolean = API_URL === 'local';
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';
