import { Button, Card, Chip, Header, IconButton, Screen, SectionTitle, Text, TextField, toMessage, useTheme, useToast } from '@basalt/core';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Copy, FileDown, Pencil, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { DateEditor } from '../../components/DateEditor';
import { PageImage } from '../../components/PageImage';
import { Native } from '../../lib/capture';
import { deleteDocument, getDocument, setDateReminders, updateDocument } from '../../lib/db';
import type { DateRow, DocumentRow } from '../../lib/db';
import { TYPE_LABELS } from '../../lib/extract';
import type { DocType } from '../../lib/extract';
import { cancelAll, ensurePermission, scheduleFor } from '../../lib/reminders';
import { leadDaysSetting } from '../../lib/settings';

export default function DocumentScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ doc: DocumentRow; pages: string[]; dates: DateRow[] } | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', type: 'document' as DocType, notes: '' });
  const [exporting, setExporting] = useState(false);
  const [showText, setShowText] = useState(false);

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
      await cancelAll(date.reminderIds);
      let ids: string[] = [];
      if (remind) {
        if (!(await ensurePermission())) return toast('Turn on notifications for Paperwork to get reminders.', 'danger');
        ids = await scheduleFor(doc.title, date.kind, date.iso, leadDaysSetting.get(), doc.id);
      }
      await setDateReminders(date.id, remind, ids);
      await load();
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const uri = await Native.exportPdf(pages, doc.title);
      if (!(await Sharing.isAvailableAsync())) return toast('Sharing is not available on this phone.', 'danger');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: doc.title });
    } catch (error) {
      toast(toMessage(error, 'Could not create the PDF.'), 'danger');
    } finally {
      setExporting(false);
    }
  };

  const saveEdit = async () => {
    if (!draft.title.trim()) return toast('The title cannot be empty.', 'danger');
    try {
      await updateDocument(doc.id, { ...draft, title: draft.title.trim(), notes: draft.notes.trim() });
      setEditing(false);
      await load();
    } catch (error) {
      toast(toMessage(error), 'danger');
    }
  };

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
            await Native.deletePages(removed.pages);
            router.back();
          } catch (error) {
            toast(toMessage(error), 'danger');
          }
        },
      },
    ]);

  return (
    <Screen>
      <Header
        title={doc.title}
        subtitle={`${TYPE_LABELS[doc.type]} · ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}`}
        onBack={() => router.back()}
        right={<IconButton icon={Trash2} label="Delete document" tone="danger" onPress={remove} />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {pages.map((p) => (
          <PageImage key={p} name={p} style={{ width: 240, height: 320, borderRadius: 16 }} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Share PDF" icon={FileDown} loading={exporting} onPress={() => void exportPdf()} style={{ flex: 1 }} />
        <Button label="Edit" icon={Pencil} variant="secondary" onPress={() => setEditing(!editing)} style={{ flex: 1 }} />
      </View>

      {editing ? (
        <Card style={{ gap: spacing.md }}>
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
        <Card>
          <Text variant="caption" color="textMuted">
            Total
          </Text>
          <Text variant="title">
            {doc.currency} {doc.amount.toLocaleString()}
          </Text>
        </Card>
      ) : null}

      {dates.length > 0 ? (
        <>
          <SectionTitle title="Dates" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {dates.map((d) => (
              <DateEditor key={d.id} value={d} editableKind={false} onChange={(next) => (next.remind !== d.remind ? void toggleReminder(d, next.remind) : undefined)} />
            ))}
          </Card>
          <Text variant="caption" color="textFaint">
            Reminders arrive at 9:00, {leadDaysSetting.get()} days before and on the day.
          </Text>
        </>
      ) : null}

      <SectionTitle title="Text" action={doc.text ? (showText ? 'Hide' : 'Show') : undefined} onAction={() => setShowText(!showText)} />
      {doc.text ? (
        showText ? (
          <Card style={{ gap: spacing.md }}>
            <Text selectable variant="mono">
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
          <Text variant="caption" color="textMuted" numberOfLines={3}>
            {doc.text}
          </Text>
        )
      ) : (
        <Text variant="caption" color="textMuted">
          No text was recognised on these pages.
        </Text>
      )}
    </Screen>
  );
}
