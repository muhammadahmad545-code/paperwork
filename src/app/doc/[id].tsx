import { Appear, Badge, Button, Card, Chip, Header, IconButton, Pressable, Screen, SectionTitle, Text, TextField, toMessage, useTheme, useToast } from '@basalt/core';
import { useLock } from '@basalt/core/src/lock/LockGate';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CalendarPlus, Copy, FileDown, ImageDown, Pencil, Pin, PinOff, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { DateEditor } from '../../components/DateEditor';
import { DateField } from '../../components/DateField';
import { PageImage } from '../../components/PageImage';
import { PageViewer } from '../../components/PageViewer';
import { Native } from '../../lib/capture';
import { KIND_LABELS } from '../../lib/dates';
import { addDate, deleteDocument, getDocument, newId, removeDate, setDateReminders, setPinned, updateDocument } from '../../lib/db';
import type { DateRow, DocumentRow, PageRow } from '../../lib/db';
import { TYPE_LABELS, toIso } from '../../lib/extract';
import type { DateKind, DocType } from '../../lib/extract';
import { cancelAll, ensurePermission, reschedule, scheduleFor } from '../../lib/reminders';
import { leadDaysSetting } from '../../lib/settings';

type Data = { doc: DocumentRow; pages: PageRow[]; dates: DateRow[] };

const today = () => {
  const d = new Date();
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

export default function DocumentScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const lock = useLock();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'document' as DocType, notes: '' });
  const [busy, setBusy] = useState<'pdf' | 'page' | null>(null);
  const [showText, setShowText] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [adding, setAdding] = useState<{ kind: DateKind; iso: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getDocument(id);
      setData(result);
      if (result) setDraft({ title: result.doc.title, type: result.doc.type, notes: result.doc.notes });
    } catch (error) {
      setData(null);
      toast(toMessage(error), 'danger');
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (data === undefined) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (data === null) {
    return (
      <Screen>
        <Header title="Not found" onBack={() => router.back()} />
        <Text color="textMuted">This document no longer exists.</Text>
      </Screen>
    );
  }
  const { doc, pages, dates } = data;

  const toggleReminder = async (date: DateRow, remind: boolean) => {
    try {
      if (remind && !(await ensurePermission())) return toast('Turn on notifications for Paperwork to get reminders.', 'danger');
      await cancelAll(date.reminderIds);
      const ids = remind ? await scheduleFor(doc.title, date.kind, date.iso, leadDaysSetting.get(), doc.id) : [];
      await setDateReminders(date.id, remind, ids);
      await load();
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const share = async (kind: 'pdf' | 'page') => {
    setBusy(kind);
    try {
      const uri = kind === 'pdf' ? await Native.exportPdf(pages.map((p) => p.name), doc.title) : await Native.exportPage(pages[0].name, doc.title);
      if (!(await Sharing.isAvailableAsync())) return toast('Sharing is not available on this phone.', 'danger');
      lock.expectExternal();
      await Sharing.shareAsync(uri, { mimeType: kind === 'pdf' ? 'application/pdf' : 'image/jpeg', dialogTitle: doc.title });
    } catch (error) {
      toast(toMessage(error, 'Could not prepare the file.'), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    const title = draft.title.trim();
    if (!title) return toast('The title cannot be empty.', 'danger');
    try {
      await updateDocument(doc.id, { ...draft, title, notes: draft.notes.trim() });
      // Reminders carry the title, so refresh them when it changes.
      if (title !== doc.title) {
        for (const d of dates.filter((x) => x.remind && x.reminderIds.length)) {
          const ids = await reschedule(d.reminderIds, title, d.kind, d.iso, leadDaysSetting.get(), doc.id);
          await setDateReminders(d.id, true, ids);
        }
      }
      setEditing(false);
      await load();
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const saveNewDate = async () => {
    if (!adding) return;
    try {
      await addDate(doc.id, { id: newId(), kind: adding.kind, iso: adding.iso, label: 'Added by you' });
      setAdding(null);
      await load();
      toast('Date added. Turn on its reminder below.', 'success');
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const deleteDate = (d: DateRow) =>
    Alert.alert('Remove this date?', 'Its reminders are cancelled too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelAll(d.reminderIds);
            await removeDate(d.id);
            await load();
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  const remove = () =>
    Alert.alert('Delete this document?', 'Its pages, text and reminders are erased from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const removed = await deleteDocument(doc.id);
            await cancelAll(removed.reminderIds);
            await Native.deleteDocumentFiles(doc.id);
            router.back();
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  const togglePin = async () => {
    try {
      await setPinned(doc.id, !doc.pinned);
      await load();
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  return (
    <Screen aurora>
      <Header
        title={doc.title}
        subtitle={`${TYPE_LABELS[doc.type]} · ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'} · ${new Date(doc.createdAt).toLocaleDateString()}`}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <IconButton icon={doc.pinned ? PinOff : Pin} label={doc.pinned ? 'Unpin' : 'Pin to top'} tone={doc.pinned ? 'accent' : 'text'} onPress={() => void togglePin()} />
            <IconButton icon={Trash2} label="Delete document" tone="danger" onPress={remove} />
          </View>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {pages.map((p, i) => (
          <Appear key={p.name} index={i}>
            <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open page ${i + 1}`} onPress={() => setViewer(i)}>
              <PageImage name={p.thumb} style={{ width: 230, height: 306, borderRadius: 18 }} />
            </Pressable>
          </Appear>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="PDF" icon={FileDown} loading={busy === 'pdf'} onPress={() => void share('pdf')} style={{ flex: 1 }} />
        <Button label="Image" icon={ImageDown} variant="secondary" loading={busy === 'page'} onPress={() => void share('page')} style={{ flex: 1 }} />
        <Button label="Edit" icon={Pencil} variant="secondary" onPress={() => setEditing(!editing)} style={{ flex: 1 }} />
      </View>

      {editing ? (
        <Card variant="raised" style={{ gap: spacing.md }}>
          <TextField label="Title" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} maxLength={80} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
              <Chip key={t} label={TYPE_LABELS[t]} selected={draft.type === t} onPress={() => setDraft({ ...draft, type: t })} />
            ))}
          </View>
          <TextField label="Notes" value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline maxLength={2000} />
          <Button label="Save changes" onPress={() => void saveEdit()} />
        </Card>
      ) : doc.notes ? (
        <Card>
          <Text>{doc.notes}</Text>
        </Card>
      ) : null}

      {doc.amount ? (
        <Card variant="glow">
          <Text variant="caption" color="textMuted">
            Total
          </Text>
          <Text variant="display" style={{ color: colors.accent }}>
            {doc.currency} {doc.amount.toLocaleString()}
          </Text>
        </Card>
      ) : null}

      <SectionTitle title={`Dates · ${dates.length}`} action={adding ? undefined : 'Add date'} onAction={() => setAdding({ kind: 'expiry', iso: today() })} />
      {adding ? (
        <Card variant="raised" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {(Object.keys(KIND_LABELS) as DateKind[]).map((k) => (
              <Chip key={k} label={KIND_LABELS[k]} selected={adding.kind === k} onPress={() => setAdding({ ...adding, kind: k })} />
            ))}
          </View>
          <DateField iso={adding.iso} onChange={(iso) => setAdding({ ...adding, iso })} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Cancel" variant="secondary" onPress={() => setAdding(null)} style={{ flex: 1 }} />
            <Button label="Add" icon={CalendarPlus} onPress={() => void saveNewDate()} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}
      {dates.length > 0 ? (
        <Card style={{ paddingVertical: spacing.xs }}>
          {dates.map((d) => (
            <DateEditor key={d.id} value={d} editableKind={false} onRemove={() => deleteDate(d)} onChange={(next) => (next.remind !== d.remind ? void toggleReminder(d, next.remind) : undefined)} />
          ))}
        </Card>
      ) : !adding ? (
        <Text variant="caption" color="textMuted">
          No dates on this document. Add one to get reminders.
        </Text>
      ) : null}
      {dates.some((d) => d.remind) ? (
        <Badge label={`Reminders at 9:00, ${leadDaysSetting.get()} days before and on the day`} tone="muted" />
      ) : null}

      <SectionTitle title="Text" action={doc.text ? (showText ? 'Hide' : 'Show all') : undefined} onAction={() => setShowText(!showText)} />
      {doc.text ? (
        <Card style={{ gap: spacing.md }}>
          <Text selectable variant="mono" numberOfLines={showText ? undefined : 4}>
            {doc.text}
          </Text>
          <Button
            label="Copy text"
            icon={Copy}
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(doc.text);
              toast('Text copied', 'success');
            }}
          />
        </Card>
      ) : (
        <Text variant="caption" color="textMuted">
          No text was recognised on these pages.
        </Text>
      )}
      {viewer !== null ? <PageViewer pages={pages} start={viewer} onClose={() => setViewer(null)} /> : null}
    </Screen>
  );
}
