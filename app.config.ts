import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Two Dots',
  slug: 'two-dots',
  version: '0.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'twodots',
  userInterfaceStyle: 'dark',
  backgroundColor: '#07070f',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    // v0.3-worlds: matches the new icon's deep navy backdrop (#0a2c44).
    // Smoother visual transition from launch to running app.
    backgroundColor: '#0a2c44',
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
      // v0.3-worlds: deep navy matches the new icon design.
      backgroundColor: '#0a2c44',
    },
  },
  plugins: [
    'expo-router',
    'expo-audio',
    [
      'expo-splash-screen',
      {
        // v0.3-worlds: matches the new icon design's deep navy.
        backgroundColor: '#0a2c44',
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
