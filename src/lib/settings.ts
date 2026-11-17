import { createSetting } from '@basalt/core';

export const lockSetting = createSetting<boolean>('paperwork.lock', false);
export const leadDaysSetting = createSetting<number>('paperwork.leadDays', 7);
export const sortSetting = createSetting<'newest' | 'oldest' | 'title' | 'expiring'>('paperwork.sort', 'newest');
export const onboardedSetting = createSetting<boolean>('paperwork.onboarded', false);

export const UPDATE_SOURCE = { owner: 'muhammadahmad545-code', repo: 'paperwork' } as const;
export const REPO_URL = `https://github.com/${UPDATE_SOURCE.owner}/${UPDATE_SOURCE.repo}`;
export const ACCENT = { dark: '#FBBF24', dark2: '#F59E0B', light: '#B45309', light2: '#92400E', onAccent: '#1F1503' } as const;
