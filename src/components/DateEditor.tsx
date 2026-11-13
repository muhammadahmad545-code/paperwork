import { Chip, Text, Toggle, useTheme } from '@basalt/core';
import React from 'react';
import { View } from 'react-native';
import { KIND_LABELS, daysUntil, formatIso, relativeDays, tone } from '../lib/dates';
import type { DateKind } from '../lib/extract';

export interface EditableDate {
  id: string;
  kind: DateKind;
  iso: string;
  label: string;
  remind: boolean;
}

const REMINDABLE: DateKind[] = ['expiry', 'due', 'warranty'];

export function DateEditor({ value, onChange, onRemove, editableKind = true }: { value: EditableDate; onChange: (d: EditableDate) => void; onRemove?: () => void; editableKind?: boolean }) {
  const { spacing } = useTheme();
  const days = daysUntil(value.iso);
  const canRemind = REMINDABLE.includes(value.kind) && days >= 0;
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{formatIso(value.iso)}</Text>
          <Text variant="caption" color={REMINDABLE.includes(value.kind) ? tone(days) : 'textMuted'}>
            {KIND_LABELS[value.kind]} · {relativeDays(days)}
            {value.label ? ` · ${value.label}` : ''}
          </Text>
        </View>
        {canRemind ? <Toggle value={value.remind} accessibilityLabel={`Remind me about ${formatIso(value.iso)}`} onChange={(remind) => onChange({ ...value, remind })} /> : null}
      </View>
      {editableKind ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {(Object.keys(KIND_LABELS) as DateKind[]).map((k) => (
          <Chip key={k} label={KIND_LABELS[k]} selected={value.kind === k} onPress={() => onChange({ ...value, kind: k, remind: REMINDABLE.includes(k) })} />
        ))}
        {onRemove ? <Chip label="Remove" tone="danger" onPress={onRemove} /> : null}
      </View>
      ) : null}
    </View>
  );
}
