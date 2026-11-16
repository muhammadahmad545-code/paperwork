import { ErrorBoundary, Onboarding, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import { LockGate, useLock } from '@basalt/core/src/lock/LockGate';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import BellRing from 'lucide-react-native/icons/bell-ring';
import FileScan from 'lucide-react-native/icons/file-scan';
import ScanText from 'lucide-react-native/icons/scan-text';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Native } from '../lib/capture';
import { allDocumentIds } from '../lib/db';
import { setupNotifications } from '../lib/reminders';
import { ACCENT, lockSetting, onboardedSetting } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});
setupNotifications();

const PAGES = [
  { icon: FileScan, title: 'Scan anything', body: 'Bills, receipts, ID cards, warranties and prescriptions. Edges, perspective and glare are fixed for you.' },
  { icon: ScanText, title: 'Read on the phone', body: 'Text is recognised on this device. Paperwork finds expiry, due and warranty dates, totals and the document type.' },
  { icon: BellRing, title: 'Never miss a date', body: 'Get a heads-up before a card expires, a bill is due or a warranty ends. Tap the reminder to open the document.' },
  { icon: ShieldCheck, title: 'Locked down', body: 'Pages are encrypted with a hardware-backed key, the database with SQLCipher. Nothing is uploaded, ever.' },
];

function openDocFromUrl(url: unknown) {
  const match = typeof url === 'string' ? /^paperwork:\/\/doc\/([\w-]+)$/.exec(url) : null;
  if (match) router.push({ pathname: '/doc/[id]', params: { id: match[1] } });
}

function Navigator() {
  const { colors, scheme } = useTheme();
  const lock = useLock();
  const [onboarded, setOnboarded] = onboardedSetting.use();
  const [locked] = lockSetting.use();

  useEffect(() => {
    try {
      Native.setSecure(locked);
    } catch {
      // Older native build.
    }
  }, [locked]);

  useEffect(() => {
    // Tapping a reminder opens its document, after unlocking if the lock is on.
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      lock.whenUnlocked(() => openDocFromUrl(response.notification.request.content.data?.url));
    });
    const cold = Notifications.getLastNotificationResponse();
    if (cold) {
      lock.whenUnlocked(() => openDocFromUrl(cold.notification.request.content.data?.url));
      Notifications.clearLastNotificationResponse();
    }
    return () => tap.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!onboarded) return <Onboarding appName="Paperwork" pages={PAGES} onDone={() => setOnboarded(true)} />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useBasaltFonts();

  useEffect(() => {
    // Start clean: no plaintext previews, exports or scanner leftovers from the last session,
    // and no encrypted pages that belong to no document.
    try {
      Native.sweepCaches();
    } catch {
      // Ignore.
    }
    allDocumentIds()
      .then((ids) => Native.sweepOrphans(ids))
      .catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        try {
          Native.clearPlainCache();
        } catch {
          // Nothing to clear.
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider accent={ACCENT}>
            <ToastProvider>
              <LockGate setting={lockSetting} appName="Paperwork" message="Your documents stay hidden until you unlock.">
                <Navigator />
              </LockGate>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
