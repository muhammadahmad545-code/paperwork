import { Button, Card, Chip, EmptyState, IconButton, Pressable, Screen, SectionTitle, Text, UpdateCard, formatRelativeTime, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarClock, FileScan, Images, Search, Settings, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { PageImage } from '../components/PageImage';
import { allDates, listDocuments } from '../lib/db';
import type { DateRow, DocumentRow } from '../lib/db';
import { KIND_LABELS, daysUntil, relativeDays, tone } from '../lib/dates';
import { TYPE_LABELS } from '../lib/extract';
import type { DocType } from '../lib/extract';
import { UPDATE_SOURCE } from '../lib/settings';

export default function Library() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const [search, setSearch] = useState('');
  const [type, setType] = useState<DocType | null>(null);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [upcoming, setUpcoming] = useState<DateRow[]>([]);

  const load = useCallback(async () => {
    try {
      setDocs(await listDocuments(search, type));
    } catch (error) {
      setDocs([]);
      toast(toMessage(error, 'Could not open your documents.'), 'danger');
    }
  }, [search, type, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
      allDates()
        .then((dates) => setUpcoming(dates.filter((d) => daysUntil(d.iso) >= -30 && daysUntil(d.iso) <= 90).slice(0, 8)))
        .catch(() => {});
    }, [load]),
  );

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Scan" icon={FileScan} size="lg" onPress={() => router.push({ pathname: '/capture', params: { mode: 'scan' } })} style={{ flex: 1 }} />
          <Button label="Import" icon={Images} variant="secondary" size="lg" onPress={() => router.push({ pathname: '/capture', params: { mode: 'import' } })} style={{ flex: 1 }} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="accent">
            Basalt
          </Text>
          <Text variant="display">Paperwork</Text>
        </View>
        <IconButton icon={CalendarClock} label="Upcoming dates" onPress={() => router.push('/upcoming')} />
        <IconButton icon={Settings} label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <UpdateCard updater={updater} />

      {upcoming.length > 0 ? (
        <>
          <SectionTitle title="Coming up" action="All dates" onAction={() => router.push('/upcoming')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {upcoming.map((d) => {
              const days = daysUntil(d.iso);
              return (
                <Card key={d.id} onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.docId } })} style={{ width: 180, gap: 4, borderColor: days < 0 ? colors.danger : days <= 14 ? colors.warning : colors.border }}>
                  <Text variant="caption" color={tone(days)}>
                    {KIND_LABELS[d.kind]} {relativeDays(days)}
                  </Text>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {d.docTitle}
                  </Text>
                </Card>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }}>
        <Search size={18} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search text inside every document"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Search documents"
          autoCorrect={false}
          style={[typography.body, { flex: 1, color: colors.text, paddingVertical: spacing.md }]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setSearch('')}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="All" selected={type === null} onPress={() => setType(null)} />
        {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
          <Chip key={t} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(type === t ? null : t)} />
        ))}
      </ScrollView>

      {docs && docs.length === 0 ? (
        <EmptyState
          icon={FileScan}
          title={search || type ? 'No matches' : 'No documents yet'}
          message={search || type ? 'Try another word or type.' : 'Scan a bill, receipt, ID card or warranty. Paperwork reads it on the phone and reminds you before anything expires.'}
        />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {(docs ?? []).map((doc) => (
          <Pressable
            key={doc.id}
            accessibilityRole="button"
            accessibilityLabel={`${doc.title}, ${TYPE_LABELS[doc.type]}`}
            onPress={() => router.push({ pathname: '/doc/[id]', params: { id: doc.id } })}
            style={{ width: '47.5%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}
          >
            <PageImage name={doc.firstPage} style={{ width: '100%', aspectRatio: 0.78 }} />
            <View style={{ padding: spacing.md, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {doc.title}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {TYPE_LABELS[doc.type]} · {formatRelativeTime(doc.createdAt)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
