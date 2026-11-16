import { SlotTabs } from '@basalt/core';
import { BarChart3, CalendarClock, Library, Settings } from 'lucide-react-native';
import React from 'react';

const TABS = [
  { href: '/', label: 'Library', icon: Library },
  { href: '/upcoming', label: 'Upcoming', icon: CalendarClock },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function TabsLayout() {
  return <SlotTabs tabs={TABS} />;
}
