import { Appear, Aurora, Badge, Button, Card, Chip, EmptyState, Gradient, Hero, Pressable, Skeleton, TAB_BAR_SPACE, Text, UpdateCard, formatRelativeTime, toMessage, useTheme, useToast, useUpdater } from '@basalt/core';
import { useFocusEffect, useRouter } from 'expo-router';
import FileScan from 'lucide-react-native/icons/file-scan';
import Images from 'lucide-react-native/icons/images';
import Pin from 'lucide-react-native/icons/pin';
import Search from 'lucide-react-native/icons/search';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import X from 'lucide-react-native/icons/x';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageImage } from '../../components/PageImage';
import { Native } from '../../lib/capture';
import { allDates, listDocuments } from '../../lib/db';
import type { DateRow, DocumentRow } from '../../lib/db';
import { KIND_LABELS, daysUntil, relativeDays, tone } from '../../lib/dates';
import { TYPE_LABELS } from '../../lib/extract';
import type { DocType } from '../../lib/extract';
import { UPDATE_SOURCE, sortSetting } from '../../lib/settings';

function badgeTone(days: number): 'danger' | 'warning' | 'muted' {
  const t = tone(days);
  return t === 'textMuted' ? 'muted' : t;
}

export default function Library() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const updater = useUpdater({ source: UPDATE_SOURCE });
  const [search, setSearch] = useState('');
  const [type, setType] = useState<DocType | null>(null);
  const [sort, setSort] = sortSetting.use();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [upcoming, setUpcoming] = useState<DateRow[]>([]);

  const load = useCallback(async () => {
    try {
      setDocs(await listDocuments(search, type, sort));
    } catch (error) {
      setDocs([]);
      toast(toMessage(error, 'Could not open your documents.'), 'danger');
    }
  }, [search, type, sort, toast]);

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
      // A scan that finished while Android had closed the app: offer to finish saving it.
      try {
        if (Native.hasPendingScan()) router.push({ pathname: '/capture', params: { mode: 'recover' } });
      } catch {
        // Ignore.
      }
    }, [load, router]),
  );

  const header = (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.md }}>
      <Hero overline="Basalt" title="Paperwork" subtitle={docs ? `${docs.length} document${docs.length === 1 ? '' : 's'} · encrypted on this phone` : 'Encrypted on this phone'} />
      <UpdateCard updater={updater} />

      <Appear index={1}>
        <Gradient colors={[colors.accent, colors.accent2]} radius={radius.xl} style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading" style={{ color: colors.onAccent }}>
                Add a document
              </Text>
              <Text variant="caption" style={{ color: colors.onAccent, opacity: 0.8 }}>
                Scan with edge detection, or import photos you already have.
              </Text>
            </View>
            <ShieldCheck size={28} color={colors.onAccent} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan a document"
              haptic
              onPress={() => router.push({ pathname: '/capture', params: { mode: 'scan' } })}
              style={{ flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.onAccent }}
            >
              <FileScan size={18} color={colors.accent} />
              <Text variant="bodyStrong" style={{ color: colors.accent }}>
                Scan
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import images"
              haptic
              onPress={() => router.push({ pathname: '/capture', params: { mode: 'import' } })}
              style={{ flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.onAccent }}
            >
              <Images size={18} color={colors.onAccent} />
              <Text variant="bodyStrong" style={{ color: colors.onAccent }}>
                Import
              </Text>
            </Pressable>
          </View>
        </Gradient>
      </Appear>

      {upcoming.length > 0 ? (
        <Appear index={2} style={{ gap: spacing.sm }}>
          <Text variant="overline" color="textMuted">
            Coming up
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {upcoming.map((d) => {
              const days = daysUntil(d.iso);
              return (
                <Card key={d.id} variant="raised" onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.docId } })} style={{ width: 190, gap: 6, borderColor: days < 0 ? colors.danger : days <= 14 ? colors.warning : colors.border }}>
                  <Badge label={`${KIND_LABELS[d.kind]} ${relativeDays(days)}`} tone={badgeTone(days)} />
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {d.docTitle}
                  </Text>
                </Card>
              );
            })}
          </ScrollView>
        </Appear>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md }}>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="caption" color="textMuted">
          Sort
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(
            [
              ['newest', 'Newest'],
              ['oldest', 'Oldest'],
              ['title', 'A–Z'],
              ['expiring', 'Expiring soon'],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} label={label} selected={sort === value} onPress={() => setSort(value)} />
          ))}
        </ScrollView>
      </View>
      {docs === null ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Skeleton width="48%" height={220} radius={16} />
          <Skeleton width="48%" height={220} radius={16} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Aurora />
      <FlatList
        data={docs ?? []}
        keyExtractor={(d) => d.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
        ListEmptyComponent={
          docs ? (
            <EmptyState
              icon={FileScan}
              title={search || type ? 'No matches' : 'No documents yet'}
              message={search || type ? 'Try another word or type.' : 'Scan your first bill, receipt or ID card. Paperwork reads it and reminds you before anything expires.'}
              action={!search && !type ? <Button label="Scan a document" icon={FileScan} onPress={() => router.push({ pathname: '/capture', params: { mode: 'scan' } })} /> : undefined}
            />
          ) : undefined
        }
        renderItem={({ item: doc, index }) => (
          <Appear index={index} style={{ flex: 1, maxWidth: '50%' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${doc.title}, ${TYPE_LABELS[doc.type]}${doc.pinned ? ', pinned' : ''}`}
              onPress={() => router.push({ pathname: '/doc/[id]', params: { id: doc.id } })}
              style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: doc.pinned ? colors.accent : colors.border, overflow: 'hidden' }}
            >
              <PageImage name={doc.thumb} style={{ width: '100%', aspectRatio: 0.8 }} />
              {doc.pinned ? (
                <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill, padding: 5 }}>
                  <Pin size={12} color={colors.onAccent} />
                </View>
              ) : null}
              <View style={{ padding: spacing.md, gap: 4 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {doc.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Badge label={TYPE_LABELS[doc.type]} tone="muted" />
                  <Text variant="caption" color="textFaint" numberOfLines={1} style={{ flex: 1 }}>
                    {formatRelativeTime(doc.createdAt)}
                  </Text>
                </View>
              </View>
            </Pressable>
          </Appear>
        )}
      />
    </View>
  );
}
