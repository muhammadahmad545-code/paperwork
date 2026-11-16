import { Appear, Badge, Card, EmptyState, Hero, Ring, Screen, SectionTitle, TAB_BAR_SPACE, Text, useTheme } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { allDates } from '../../lib/db';
import type { DateRow } from '../../lib/db';
import { KIND_LABELS, daysUntil, formatIso, relativeDays, tone } from '../../lib/dates';

export default function Upcoming() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [dates, setDates] = useState<DateRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      allDates()
        .then(setDates)
        .catch(() => setDates([]));
    }, []),
  );

  const list = dates ?? [];
  const overdue = list.filter((d) => daysUntil(d.iso) < 0).reverse();
  const soon = list.filter((d) => daysUntil(d.iso) >= 0 && daysUntil(d.iso) <= 30);
  const later = list.filter((d) => daysUntil(d.iso) > 30);
  const covered = list.filter((d) => daysUntil(d.iso) >= 0);
  const reminded = covered.filter((d) => d.remind && d.reminderIds.length > 0).length;

  let index = 0;
  const group = (title: string, rows: DateRow[]) =>
    rows.length === 0 ? null : (
      <View key={title} style={{ gap: spacing.sm }}>
        <SectionTitle title={`${title} · ${rows.length}`} />
        {rows.map((d) => {
          const days = daysUntil(d.iso);
          const t = tone(days);
          return (
            <Appear key={d.id} index={index++}>
              <Card onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.docId } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ width: 54, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: t === 'textMuted' ? colors.surfaceRaised : t === 'danger' ? colors.dangerSoft : colors.accentSoft }}>
                  <Text variant="title" style={{ color: t === 'textMuted' ? colors.text : colors[t] }}>
                    {Math.abs(days) > 999 ? '∞' : Math.abs(days)}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {days < 0 ? 'ago' : 'days'}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {d.docTitle}
                  </Text>
                  <Badge label={`${KIND_LABELS[d.kind]} ${relativeDays(days)}`} tone={t === 'textMuted' ? 'muted' : t} />
                  <Text variant="caption" color="textFaint">
                    {formatIso(d.iso)}
                  </Text>
                </View>
                {d.remind && d.reminderIds.length > 0 ? <Bell size={18} color={colors.accent} accessibilityLabel="Reminder set" /> : null}
              </Card>
            </Appear>
          );
        })}
      </View>
    );

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Paperwork" title="Upcoming" subtitle="Every expiry, due and warranty date, soonest first." />
      {dates && dates.length === 0 ? <EmptyState icon={CalendarClock} title="No dates yet" message="Dates Paperwork finds in your documents show up here." /> : null}
      {covered.length > 0 ? (
        <Card variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Ring progress={covered.length ? reminded / covered.length : 0} size={88} stroke={10}>
            <Text variant="heading">{Math.round((reminded / covered.length) * 100)}%</Text>
          </Ring>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading">
              {reminded} of {covered.length} covered
            </Text>
            <Text variant="caption" color="textMuted">
              Future dates with a reminder set. Open a document to turn reminders on.
            </Text>
            {overdue.length ? <Badge label={`${overdue.length} overdue`} tone="danger" /> : null}
          </View>
        </Card>
      ) : null}
      {group('Overdue or expired', overdue)}
      {group('Next 30 days', soon)}
      {group('Later', later)}
    </Screen>
  );
}
