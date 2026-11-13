import { Card, EmptyState, Header, Screen, SectionTitle, Text, useTheme } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, CalendarClock } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { allDates } from '../lib/db';
import type { DateRow } from '../lib/db';
import { KIND_LABELS, daysUntil, formatIso, relativeDays, tone } from '../lib/dates';

export default function Upcoming() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [dates, setDates] = useState<DateRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      allDates()
        .then(setDates)
        .catch(() => setDates([]));
    }, []),
  );

  const groups: [string, DateRow[]][] = [
    ['Overdue or expired', (dates ?? []).filter((d) => daysUntil(d.iso) < 0).reverse()],
    ['Next 30 days', (dates ?? []).filter((d) => daysUntil(d.iso) >= 0 && daysUntil(d.iso) <= 30)],
    ['Later', (dates ?? []).filter((d) => daysUntil(d.iso) > 30)],
  ];

  return (
    <Screen>
      <Header title="Upcoming" subtitle="Expiry, due and warranty dates" onBack={() => router.back()} />
      {dates && dates.length === 0 ? <EmptyState icon={CalendarClock} title="No dates yet" message="Dates Paperwork finds in your documents show up here, soonest first." /> : null}
      {groups.map(([title, rows]) =>
        rows.length === 0 ? null : (
          <View key={title} style={{ gap: spacing.sm }}>
            <SectionTitle title={`${title} · ${rows.length}`} />
            {rows.map((d) => {
              const days = daysUntil(d.iso);
              return (
                <Card key={d.id} onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.docId } })} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors[tone(days) === 'textMuted' ? 'border' : tone(days)] }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {d.docTitle}
                    </Text>
                    <Text variant="caption" color={tone(days)}>
                      {KIND_LABELS[d.kind]} {relativeDays(days)} · {formatIso(d.iso)}
                    </Text>
                  </View>
                  {d.remind && d.reminderIds.length > 0 ? <Bell size={16} color={colors.accent} accessibilityLabel="Reminder set" /> : null}
                </Card>
              );
            })}
          </View>
        ),
      )}
    </Screen>
  );
}
