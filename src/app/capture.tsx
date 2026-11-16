import { Appear, Aurora, Button, Card, Chip, Header, ProgressBar, Ring, Screen, SectionTitle, Text, TextField, toMessage, useTheme, useToast } from '@basalt/core';
import { useLock } from '@basalt/core/src/lock/LockGate';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FileScan from 'lucide-react-native/icons/file-scan';
import Images from 'lucide-react-native/icons/images';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { DateEditor } from '../components/DateEditor';
import type { EditableDate } from '../components/DateEditor';
import { PageImage } from '../components/PageImage';
import { Native, processPages } from '../lib/capture';
import type { Captured, Step } from '../lib/capture';
import { insertDocument, newId, setDateReminders } from '../lib/db';
import { TYPE_LABELS } from '../lib/extract';
import type { DocType } from '../lib/extract';
import { cancelAll, ensurePermission, scheduleFor } from '../lib/reminders';
import { leadDaysSetting } from '../lib/settings';

type Phase = { name: 'picking' } | { name: 'working'; step: Step | null } | { name: 'review'; captured: Captured } | { name: 'error'; message: string; canImport: boolean };

export default function Capture() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const lock = useLock();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [phase, setPhase] = useState<Phase>({ name: 'picking' });
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocType>('document');
  const [notes, setNotes] = useState('');
  const [dates, setDates] = useState<EditableDate[]>([]);
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const saveLock = useRef(false);
  const alive = useRef(true);
  const capturedRef = useRef<Captured | null>(null);

  const run = useCallback(
    async (source: 'scan' | 'import' | 'recover') => {
      setPhase({ name: 'picking' });
      let uris: string[] = [];
      try {
        if (source === 'recover') {
          uris = Native.takePendingScan();
        } else if (source === 'scan') {
          uris = await lock.runExternal(() => Native.scan(20));
        } else {
          // No cache copy: the native side reads content:// directly, so no plaintext duplicate is made.
          const result = await lock.runExternal(() => DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: false }));
          uris = result.canceled ? [] : result.assets.map((a) => a.uri);
        }
      } catch (error) {
        if (alive.current) setPhase({ name: 'error', message: toMessage(error, 'Could not open the scanner.'), canImport: source === 'scan' });
        return;
      }
      if (!alive.current) {
        uris.forEach((u) => Native.discardSource(u));
        return;
      }
      if (uris.length === 0) {
        if (source === 'recover') toast('The pages from that scan were no longer available. Please scan again.', 'danger');
        router.back();
        return;
      }
      setPhase({ name: 'working', step: null });
      try {
        const captured = await processPages(uris, (step) => alive.current && setPhase({ name: 'working', step }), () => !alive.current);
        if (!captured) return;
        capturedRef.current = captured;
        const a = captured.analysis;
        setTitle(a.title);
        setType(a.type);
        setDates(a.dates.map((d) => ({ id: newId(), kind: d.kind, iso: d.iso, label: d.kind === 'warranty' ? d.raw : '', remind: ['expiry', 'due', 'warranty'].includes(d.kind) })));
        setPhase({ name: 'review', captured });
      } catch (error) {
        if (alive.current) setPhase({ name: 'error', message: toMessage(error, 'Could not process the pages.'), canImport: false });
      }
    },
    [router, lock, toast],
  );

  useEffect(() => {
    void run(mode === 'import' ? 'import' : mode === 'recover' ? 'recover' : 'scan');
  }, [mode, run]);

  // Leaving without saving removes the encrypted pages; leaving mid-processing stops it and cleans up.
  useEffect(
    () => () => {
      alive.current = false;
      const c = capturedRef.current;
      if (c && !saved.current) Native.deleteDocumentFiles(c.docId).catch(() => {});
    },
    [],
  );

  const save = async (captured: Captured) => {
    if (saveLock.current) return;
    if (!title.trim()) return toast('Give the document a title.', 'danger');
    saveLock.current = true;
    setSaving(true);
    try {
      await insertDocument({
        id: captured.docId,
        title: title.trim(),
        type,
        notes: notes.trim(),
        text: captured.text,
        amount: captured.analysis.amount?.value ?? null,
        currency: captured.analysis.amount?.currency ?? null,
        pages: captured.pages,
        dates,
      });
      saved.current = true;
      // Reminders only after the document exists, so they can never point at nothing.
      const wanted = dates.filter((d) => d.remind);
      if (wanted.length > 0) {
        if (await ensurePermission()) {
          for (const d of wanted) {
            const ids = await scheduleFor(title.trim(), d.kind, d.iso, leadDaysSetting.get(), captured.docId);
            try {
              await setDateReminders(d.id, true, ids);
            } catch {
              await cancelAll(ids);
            }
          }
        } else {
          toast('Saved. Notifications are off, so no reminders were set.', 'danger');
        }
      }
      toast('Saved and encrypted', 'success');
      router.replace({ pathname: '/doc/[id]', params: { id: captured.docId } });
    } catch (error) {
      saveLock.current = false;
      toast(toMessage(error, 'Could not save the document.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (phase.name === 'picking' || phase.name === 'working') {
    const step = phase.name === 'working' ? phase.step : null;
    const progress = step ? (step.page - 0.5) / step.total : 0;
    return (
      <Screen aurora contentStyle={{ flexGrow: 1 }}>
        <Header title={mode === 'import' ? 'Import' : mode === 'recover' ? 'Finishing your scan' : 'Scan'} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.xxxl }}>
          <Ring progress={progress} size={168} stroke={14}>
            <Text variant="display">{step ? `${step.page}/${step.total}` : '…'}</Text>
          </Ring>
          <View style={{ gap: spacing.sm, alignItems: 'center' }}>
            <Text variant="heading" align="center">
              {step ? `Reading and encrypting page ${step.page}` : 'Waiting for pages'}
            </Text>
            <Text variant="caption" color="textMuted" align="center">
              Text recognition runs on this phone. Pages are encrypted with a key that never leaves it, and the unencrypted copies are deleted.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  if (phase.name === 'error') {
    return (
      <Screen aurora>
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
  const words = captured.text ? captured.text.split(/\s+/).length : 0;
  return (
    <Screen aurora footer={<Button label="Save document" icon={ShieldCheck} size="lg" loading={saving} onPress={() => void save(captured)} />}>
      <Header title="Review" subtitle={`${captured.pages.length} page${captured.pages.length === 1 ? '' : 's'} · ${words ? `${words} words read` : 'no text found'}`} onBack={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {captured.pages.map((p, i) => (
          <Appear key={p.name} index={i}>
            <PageImage name={p.thumb} style={{ width: 132, height: 176, borderRadius: 14 }} />
          </Appear>
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
        <Card variant="glow">
          <Text variant="caption" color="textMuted">
            Total found
          </Text>
          <Text variant="display" style={{ color: colors.accent }}>
            {a.amount.currency} {a.amount.value.toLocaleString()}
          </Text>
        </Card>
      ) : null}
      <SectionTitle title={`Dates found · ${dates.length}`} />
      {dates.length === 0 ? (
        <Text variant="caption" color="textMuted">
          No dates were found. You can add one from the document page after saving.
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
