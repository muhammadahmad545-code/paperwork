import { Button, Text, useTheme } from '@basalt/core';
import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { lockSetting } from '../lib/settings';

const RELOCK_AFTER_MS = 30_000;

/** Hides the app behind the phone's biometric or screen lock when the user turns the lock on. */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const [enabled] = lockSetting.use();
  const [locked, setLocked] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Paperwork', disableDeviceFallback: false });
      if (result.success) setLocked(false);
      else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') setError('Could not verify. Try again.');
    } catch {
      setError('Biometric unlock is unavailable. Set a screen lock on this phone.');
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  useEffect(() => {
    if (locked && enabled) void unlock();
  }, [locked, enabled, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && lockSetting.get() && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  if (!enabled || !locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
      <Lock size={40} color={colors.accent} />
      <Text variant="title">Paperwork is locked</Text>
      <Text color="textMuted" align="center">
        Your documents stay hidden until you unlock.
      </Text>
      {error ? <Text color="danger">{error}</Text> : null}
      <Button label="Unlock" onPress={() => void unlock()} />
    </View>
  );
}

export async function canUseLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}
