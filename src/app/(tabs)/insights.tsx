import { Appear, Bars, Card, EmptyState, Hero, Screen, SectionTitle, StatTile, TAB_BAR_SPACE, Text, useTheme } from '@basalt/core';
import { useFocusEffect } from 'expo-router';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { insights } from '../../lib/db';
import type { Insights } from '../../lib/db';
import { TYPE_LABELS } from '../../lib/extract';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InsightsScreen() {
  const { colors, spacing, radius } = useTheme();
  const [data, setData] = useState<Insights | null>(null);

  useFocusEffect(
    useCallback(() => {
      insights()
        .then(setData)
        .catch(() => setData(null));
    }, []),
  );

  const months = data ? [...data.spending].reverse() : [];
  const thisMonth = new Date().toISOString().slice(0, 7);
  const current = data?.spending.find((s) => s.month === thisMonth)?.total ?? 0;
  const maxType = Math.max(1, ...(data?.byType.map((t) => t.count) ?? [1]));

  return (
    <Screen aurora bottomSpace={TAB_BAR_SPACE}>
      <Hero overline="Paperwork" title="Insights" subtitle="What your documents say, worked out on the phone." />
      {data && data.documents === 0 ? <EmptyState icon={BarChart3} title="Nothing to show yet" message="Scan a few receipts and bills to see spending and trends." /> : null}
      {data && data.documents > 0 ? (
        <>
          <Appear index={0} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile label="Documents" value={String(data.documents)} detail={`${data.pages} pages`} />
            <StatTile label="Expiring" value={String(data.expiringThisYear)} detail="this year" />
          </Appear>
          {data.currency && months.length > 0 ? (
            <Appear index={1}>
              <Card variant="raised" style={{ gap: spacing.md }}>
                <View>
                  <Text variant="caption" color="textMuted">
                    Spent this month (receipts, bills, invoices)
                  </Text>
                  <Text variant="display" style={{ color: colors.accent }}>
                    {data.currency} {Math.round(current).toLocaleString()}
                  </Text>
                </View>
                <Bars
                  values={months.map((m) => m.total)}
                  labels={months.length > 1 ? [MONTH[Number(months[0].month.slice(5)) - 1], MONTH[Number(months[months.length - 1].month.slice(5)) - 1]] : undefined}
                  highlight={months.findIndex((m) => m.month === thisMonth)}
                  accessibilityLabel={`Spending over the last ${months.length} months`}
                />
                <Text variant="caption" color="textFaint">
                  Based on the totals Paperwork read from your documents, by the month you scanned them.
                </Text>
              </Card>
            </Appear>
          ) : null}
          <SectionTitle title="By type" />
          <Appear index={2}>
            <Card style={{ gap: spacing.md }}>
              {data.byType.map((t) => (
                <View key={t.type} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="label">{TYPE_LABELS[t.type]}</Text>
                    <Text variant="label" color="textMuted">
                      {t.count}
                    </Text>
                  </View>
                  <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.border }}>
                    <View style={{ height: 8, borderRadius: radius.pill, width: `${(t.count / maxType) * 100}%`, backgroundColor: colors.accent }} />
                  </View>
                </View>
              ))}
            </Card>
          </Appear>
        </>
      ) : null}
    </Screen>
  );
}
