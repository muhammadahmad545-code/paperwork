import { Button, Card, Chip, Header, ProgressBar, Screen, SectionTitle, Text, TextField, toMessage, useTheme, useToast } from '@basalt/core';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileScan, Images, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { DateEditor } from '../components/DateEditor';
import type { EditableDate } from '../components/DateEditor';
import { PageImage } from '../components/PageImage';
import { Native, processPages } from '../lib/capture';
import type { Captured, Step } from '../lib/capture';
import { insertDocument, newId } from '../lib/db';
import { TYPE_LABELS } from '../lib/extract';
import type { DocType } from '../lib/extract';
import { ensurePermission, scheduleFor } from '../lib/reminders';
import { leadDaysSetting } from '../lib/settings';

type Phase = { name: 'picking' } | { name: 'working'; step: Step | null } | { name: 'review'; captured: Captured } | { name: 'error'; message: string; canImport: boolean };

export default function Capture() {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [phase, setPhase] = useState<Phase>({ name: 'picking' });
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocType>('document');
  const [notes, setNotes] = useState('');
  const [dates, setDates] = useState<EditableDate[]>([]);
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const capturedRef = useRef<Captured | null>(null);

  const run = useCallback(async (source: 'scan' | 'import') => {
    setPhase({ name: 'picking' });
    let uris: string[] = [];
    try {
      if (source === 'scan') {
        uris = await Native.scan(20);
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
        uris = result.canceled ? [] : result.assets.map((a) => a.uri);
      }
    } catch (error) {
      setPhase({ name: 'error', message: toMessage(error, 'Could not open the scanner.'), canImport: source === 'scan' });
      return;
    }
    if (uris.length === 0) {
      router.back();
      return;
    }
    setPhase({ name: 'working', step: null });
    try {
      const captured = await processPages(uris, (step) => setPhase({ name: 'working', step }));
      capturedRef.current = captured;
      const a = captured.analysis;
      setTitle(a.title);
      setType(a.type);
      setDates(a.dates.map((d) => ({ id: newId(), kind: d.kind, iso: d.iso, label: d.kind === 'warranty' ? d.raw : '', remind: ['expiry', 'due', 'warranty'].includes(d.kind) })));
      setPhase({ name: 'review', captured });
    } catch (error) {
      setPhase({ name: 'error', message: toMessage(error, 'Could not process the pages.'), canImport: false });
    }
  }, [router]);

  useEffect(() => {
    void run(mode === 'import' ? 'import' : 'scan');
  }, [mode, run]);

  // Leaving without saving must not leave encrypted pages behind.
  useEffect(
    () => () => {
      const c = capturedRef.current;
      if (c && !saved.current) Native.deletePages(c.pages).catch(() => {});
    },
    [],
  );

  const save = async (captured: Captured) => {
    if (!title.trim()) return toast('Give the document a title.', 'danger');
    setSaving(true);
    try {
      const lead = leadDaysSetting.get();
      const wantsReminders = dates.some((d) => d.remind);
      const allowed = wantsReminders ? await ensurePermission() : false;
      if (wantsReminders && !allowed) toast('Notifications are off, so reminders were not scheduled.', 'danger');
      const withReminders = await Promise.all(
        dates.map(async (d) => ({ ...d, reminderIds: d.remind && allowed ? await scheduleFor(title.trim(), d.kind, d.iso, lead, captured.docId) : [] })),
      );
      await insertDocument({
        id: captured.docId,
        title: title.trim(),
        type,
        notes: notes.trim(),
        text: captured.text,
        amount: captured.analysis.amount?.value ?? null,
        currency: captured.analysis.amount?.currency ?? null,
        pages: captured.pages,
        dates: withReminders,
      });
      saved.current = true;
      toast('Saved and encrypted', 'success');
      router.replace({ pathname: '/doc/[id]', params: { id: captured.docId } });
    } catch (error) {
      toast(toMessage(error, 'Could not save the document.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (phase.name === 'picking' || phase.name === 'working') {
    const step = phase.name === 'working' ? phase.step : null;
    const progress = step ? (step.page - (step.stage === 'reading' ? 1 : 0.5)) / step.total : 0;
    return (
      <Screen>
        <Header title={mode === 'import' ? 'Import' : 'Scan'} onBack={() => router.back()} />
        <Card style={{ gap: spacing.md, paddingVertical: spacing.xl }}>
          <Text variant="heading">{step ? (step.stage === 'reading' ? `Reading page ${step.page} of ${step.total}` : `Encrypting page ${step.page} of ${step.total}`) : 'Waiting for pages…'}</Text>
          <ProgressBar progress={progress} />
          <Text variant="caption" color="textMuted">
            Text recognition runs on this phone. Pages are encrypted with a key that never leaves it.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (phase.name === 'error') {
    return (
      <Screen>
        <Header title="Something went wrong" onBack={() => router.back()} />
        <Card style={{ gap: spacing.md }}>
          <Text color="textMuted">{phase.message}</Text>
          {phase.canImport ? <Button label="Import images instead" icon={Images} onPress={() => void run('import')} /> : null}
          <Button label="Try again" icon={FileScan} variant="secondary" onPress={() => void run(mode === 'import' ? 'import' : 'scan')} />
        </Card>
      </Screen>
    );
  }

  const { captured } = phase;
  const a = captured.analysis;
  return (
    <Screen footer={<Button label="Save document" icon={ShieldCheck} size="lg" loading={saving} onPress={() => void save(captured)} />}>
      <Header title="Review" subtitle={`${captured.pages.length} page${captured.pages.length === 1 ? '' : 's'} · ${captured.text.length ? `${captured.text.split(/\s+/).length} words read` : 'no text found'}`} onBack={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {captured.pages.map((p) => (
          <PageImage key={p} name={p} style={{ width: 120, height: 160, borderRadius: 12 }} />
        ))}
      </ScrollView>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={80} />
      <SectionTitle title="Type" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
          <Chip key={t} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      {a.amount ? (
        <Card>
          <Text variant="caption" color="textMuted">
            Total found
          </Text>
          <Text variant="title">
            {a.amount.currency} {a.amount.value.toLocaleString()}
          </Text>
        </Card>
      ) : null}
      <SectionTitle title={`Dates found · ${dates.length}`} />
      {dates.length === 0 ? (
        <Text variant="caption" color="textMuted">
          No dates were found in the text. You can still save the document.
        </Text>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {dates.map((d) => (
            <DateEditor key={d.id} value={d} onChange={(next) => setDates(dates.map((x) => (x.id === d.id ? next : x)))} onRemove={() => setDates(dates.filter((x) => x.id !== d.id))} />
          ))}
        </Card>
      )}
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="Anything you want to find this by later" />
    </Screen>
  );
}
