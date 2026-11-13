import { Pressable, Text, useTheme } from '@basalt/core';
import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  label: string;
  wrap?: boolean;
}

export function Stepper({ value, onChange, min, max, step = 1, format = String, label, wrap = false }: StepperProps) {
  const { colors, radius, spacing } = useTheme();
  const move = (delta: number) => {
    let next = value + delta;
    if (wrap) {
      const span = max - min + 1;
      next = ((((next - min) % span) + span) % span) + min;
    } else {
      next = Math.min(max, Math.max(min, next));
    }
    onChange(next);
  };
  const button = (Icon: typeof Plus, delta: number, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} ${label}`}
      haptic
      hitSlop={6}
      onPress={() => move(delta)}
      style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon size={18} color={colors.text} />
    </Pressable>
  );
  return (
    <View accessible accessibilityLabel={`${label}: ${format(value)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {button(Minus, -step, 'Decrease')}
      <Text variant="heading" align="center" style={{ minWidth: 64, fontVariant: ['tabular-nums'] }}>
        {format(value)}
      </Text>
      {button(Plus, step, 'Increase')}
    </View>
  );
}

/** Hour and minute steppers for a time of day stored as minutes since midnight. */
export function TimeField({ minutes, onChange, label }: { minutes: number; onChange: (m: number) => void; label: string }) {
  const { spacing } = useTheme();
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'center' }}>
      <Stepper label={`${label} hour`} value={hour} min={0} max={23} wrap format={(v) => String(v).padStart(2, '0')} onChange={(h) => onChange(h * 60 + minute)} />
      <Text variant="heading">:</Text>
      <Stepper label={`${label} minute`} value={minute} min={0} max={55} step={5} wrap format={(v) => String(v).padStart(2, '0')} onChange={(m) => onChange(hour * 60 + m)} />
    </View>
  );
}
