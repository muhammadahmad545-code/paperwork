import { SlotTabs } from '@basalt/core';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import Library from 'lucide-react-native/icons/library';
import Settings from 'lucide-react-native/icons/settings';
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
