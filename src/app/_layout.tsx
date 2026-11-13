import { ErrorBoundary, ThemeProvider, ToastProvider, useBasaltFonts, useTheme } from '@basalt/core';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockGate } from '../components/LockGate';
import { Native } from '../lib/capture';
import { setupNotifications } from '../lib/reminders';
import { ACCENT } from '../lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});
setupNotifications();

function Navigator() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <LockGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
      </LockGate>
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useBasaltFonts();

  useEffect(() => {
    // Decrypted page images only live while the app is in use.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        try {
          Native.clearPlainCache();
        } catch {
          // Nothing to clear.
        }
      }
    });
    // Tapping a reminder opens its document.
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      const match = typeof url === 'string' ? /^paperwork:\/\/doc\/([\w-]+)$/.exec(url) : null;
      if (match) router.push({ pathname: '/doc/[id]', params: { id: match[1] } });
    });
    return () => {
      sub.remove();
      tap.remove();
    };
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
              <Navigator />
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
