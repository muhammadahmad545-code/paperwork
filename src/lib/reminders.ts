import * as Notifications from 'expo-notifications';
import { reminderTime } from './dates';
import type { DateKind } from './extract';

const CHANNEL = 'paperwork-reminders';

export function setupNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Expiry and due-date reminders',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => {});
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

const VERB: Record<DateKind, string> = { expiry: 'expires', due: 'is due', warranty: 'warranty ends', issued: 'was issued', other: 'date' };

/** Schedules a heads-up `leadDays` before and one on the day. Past times are skipped. */
export async function scheduleFor(docTitle: string, kind: DateKind, iso: string, leadDays: number, docId: string): Promise<string[]> {
  const ids: string[] = [];
  const when = [...new Set([leadDays, 0])];
  for (const daysBefore of when) {
    const at = reminderTime(iso, daysBefore);
    if (at.getTime() <= Date.now()) continue;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: daysBefore === 0 ? `${docTitle} ${VERB[kind]} today` : `${docTitle} ${VERB[kind]} in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`,
        body: `On ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. Tap to open it in Paperwork.`,
        data: { url: `paperwork://doc/${docId}` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
    ids.push(id);
  }
  return ids;
}

export async function cancelAll(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}
