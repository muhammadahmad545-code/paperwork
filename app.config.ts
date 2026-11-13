import type { ConfigContext, ExpoConfig } from 'expo/config';
import pkg from './package.json';

/** 1.4.2 -> 10402. Android only installs an update whose versionCode is higher than the installed one. */
function versionCode(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => parseInt(part, 10) || 0);
  return major * 10000 + minor * 100 + patch;
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Paperwork',
  slug: 'paperwork',
  scheme: 'paperwork',
  version: pkg.version,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    package: 'dev.basalt.paperwork',
    versionCode: versionCode(pkg.version),
    adaptiveIcon: {
      backgroundColor: '#0B0D10',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
    allowBackup: false,
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    ['expo-sqlite', { useSQLCipher: true, enableFTS: true }],
    'expo-secure-store',
    'expo-sharing',
    ['expo-notifications', { color: '#F5C451' }],
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#0B0D10', image: './assets/splash-icon.png', imageWidth: 160 }],
    ['expo-local-authentication', { faceIDPermission: false }],
    './plugins/withReleaseSigning',
  ],
  experiments: { typedRoutes: true },
});
