import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static settings. This file adds the build-variant specifics.
//   APP_VARIANT=development|preview  -> allows plain-HTTP to a LAN dev server (never in production)
//   APP_VARIANT=production           -> HTTPS only
//   MOLOTOV_BUNDLE_ID                -> your own unique reverse-DNS id (must match your Apple/Google app)
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? 'development';
  const secure = variant === 'production';
  const bundleId = process.env.MOLOTOV_BUNDLE_ID ?? config.ios?.bundleIdentifier ?? 'com.molotov.wallet';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  if (secure && apiUrl && !apiUrl.startsWith('https://')) {
    throw new Error('Production builds must use an https:// EXPO_PUBLIC_API_URL');
  }

  return {
    ...config,
    name: variant === 'production' ? 'Molotov' : variant === 'preview' ? 'Molotov (Preview)' : 'Molotov (Dev)',
    slug: config.slug ?? 'molotov-wallet',
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(secure ? {} : { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }),
      },
    },
    android: { ...config.android, package: bundleId },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: !secure } }],
    ],
    extra: { ...config.extra, apiUrl, variant },
  };
};
