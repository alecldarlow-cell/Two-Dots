import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Two Dots',
  slug: 'two-dots',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'twodots',
  userInterfaceStyle: 'dark',
  backgroundColor: '#07070f',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#07070f',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.newco.twodots',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.newco.twodots',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#07070f',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#07070f',
        image: './assets/splash.png',
        imageWidth: 200,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      // Populated by `eas init` (Stage 3.1, session 9). Project lives at
      // https://expo.dev/accounts/smellyoldog/projects/two-dots
      projectId: '5a274a99-3b35-4261-b7fc-da1895d17847',
    },
  },
});
