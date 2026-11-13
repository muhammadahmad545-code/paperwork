import { Button, Card, Chip, Hero, ListItem, Screen, SectionTitle, SegmentedControl, TAB_BAR_SPACE, Text, Toggle, UpdateCard, themePreference, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { canUseLock } from '@basalt/core/src/lock/LockGate';
import * as Linking from 'expo-linking';
import { Code, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Alert, View } from 'react-native';
import { Native } from '../../lib/capture';
import { allReminderIds, wipeAll } from '../../lib/db';
import { cancelAll } from '../../lib/reminders';
import { REPO_URL, UPDATE_SOURCE, leadDaysSetting, lockSetting, onboardedSetting } from '../../lib/settings';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export default function Settings() {
  const { spacing } = useTheme();
  const toast = useToast();
  const [theme, setTheme] = themePreference.use();
  const [lock, setLock] = lockSetting.use();
  const [lead, setLead] = leadDaysSetting.use();
  const updater = useUpdater({ source: UPDATE_SOURCE, auto: false });

  const wipe = () =>
    Alert.alert('Erase everything?', 'All documents, pages and reminders are permanently erased from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Erase',
        style: 'destructive',
        onPress: async () => {
          try {
            const ids = await allReminderIds().catch(() => []);
            await cancelAll(ids);
            await wipeAll();
            await Native.wipeVault();
            toast('Everything erased', 'success');
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Paperwork" title="Settings" />

      <SectionTitle title="Security" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">App lock</Text>
          <Text variant="caption" color="textMuted">
            Fingerprint, face or your screen lock when Paperwork opens and after 30 seconds away. Also hides documents from screenshots and the recent-apps view.
          </Text>
        </View>
        <Toggle
          value={lock}
          accessibilityLabel="App lock"
          onChange={async (on) => {
            if (on && !(await canUseLock())) return toast('Set up a screen lock on this phone first.', 'danger');
            setLock(on);
          }}
        />
      </Card>

      <SectionTitle title="Reminders" />
      <Card style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          Heads-up before an expiry, due or warranty date, plus one on the day. Applies to reminders you turn on from now.
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
        <ListItem title="Show the introduction again" icon={Sparkles} chevron onPress={() => onboardedSetting.set(false)} />
        <ListItem title="Source code" subtitle="MIT licensed on GitHub" icon={Code} chevron onPress={() => void Linking.openURL(REPO_URL)} />
      </Card>
      <Button label="Erase all documents" icon={Trash2} variant="danger" onPress={wipe} />
    </Screen>
  );
}
