import { useTheme } from '@basalt/core';
import React from 'react';
import { View } from 'react-native';
import { toIso } from '../lib/extract';
import { Stepper } from './Stepper';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Day, month and year steppers for an ISO date. The day is clamped when the month changes. */
export function DateField({ iso, onChange }: { iso: string; onChange: (iso: string) => void }) {
  const { spacing } = useTheme();
  const [y, m, d] = iso.split('-').map(Number);
  const set = (year: number, month: number, day: number) => onChange(toIso(year, month, Math.min(day, daysIn(year, month))));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      <Stepper label="Day" value={d} min={1} max={daysIn(y, m)} wrap onChange={(v) => set(y, m, v)} />
      <Stepper label="Month" value={m} min={1} max={12} wrap format={(v) => MONTHS[v - 1]} onChange={(v) => set(y, v, d)} />
      <Stepper label="Year" value={y} min={2000} max={2100} onChange={(v) => set(v, m, d)} />
    </View>
  );
}
