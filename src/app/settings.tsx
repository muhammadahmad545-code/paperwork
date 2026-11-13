import { Button, Card, Chip, Header, ListItem, Screen, SectionTitle, SegmentedControl, Text, Toggle, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Code, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { canUseLock } from '../components/LockGate';
import { Native } from '../lib/capture';
import { wipeAll } from '../lib/db';
import { REPO_URL, UPDATE_SOURCE, leadDaysSetting, lockSetting } from '../lib/settings';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export default function Settings() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = themePreference.use();
  const [lock, setLock] = lockSetting.use();
  const [lead, setLead] = leadDaysSetting.use();
  const updater = useUpdater({ source: UPDATE_SOURCE, auto: false });

  const wipe = () =>
    Alert.alert('Erase everything?', 'All documents, pages and reminders are permanently erased from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: async () => {
          try {
            const { pages } = await wipeAll();
            await Native.deletePages(pages);
            await Notifications.cancelAllScheduledNotificationsAsync();
            toast('Everything erased', 'success');
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  return (
    <Screen>
      <Header title="Settings" onBack={() => router.back()} />

      <SectionTitle title="Security" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Lock with fingerprint or screen lock</Text>
          <Text variant="caption" color="textMuted">
            Asked when Paperwork opens and after 30 seconds away.
          </Text>
        </View>
        <Toggle
          value={lock}
          accessibilityLabel="Lock Paperwork"
          onChange={async (on) => {
            if (on && !(await canUseLock())) return toast('Set up a screen lock or fingerprint on this phone first.', 'danger');
            setLock(on);
          }}
        />
      </Card>

      <SectionTitle title="Reminders" />
      <Card style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          Heads-up before an expiry, due or warranty date (plus one on the day). Applies to reminders you set from now on.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[1, 3, 7, 14, 30].map((d) => (
            <Chip key={d} label={`${d} day${d === 1 ? '' : 's'} before`} selected={lead === d} onPress={() => setLead(d)} />
          ))}
        </View>
      </Card>

      <SectionTitle title="Appearance" />
      <SegmentedControl options={THEMES} value={theme} onChange={setTheme} />

      <SectionTitle title="Updates" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Version {updater.currentVersion}</Text>
          <Text variant="caption" color="textMuted">
            Updates come from this app’s GitHub releases.
          </Text>
        </View>
        <Button label="Check" icon={RefreshCw} variant="secondary" loading={updater.state.phase === 'checking'} onPress={() => void updater.check()} />
      </Card>
      <UpdateCard updater={updater} />

      <Card style={{ paddingVertical: spacing.xs }}>
        <ListItem
          title="Private by design"
          subtitle="Pages are encrypted with a hardware-backed key and the database with SQLCipher. Text is read on the phone. Nothing is uploaded; the only network request is the update check."
          icon={ShieldCheck}
          iconTone="success"
        />
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
      <Button label="Erase all documents" icon={Trash2} variant="danger" onPress={wipe} />
    </Screen>
  );
}
