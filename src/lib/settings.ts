import { createSetting } from '@basalt/core';

export const lockSetting = createSetting<boolean>('paperwork.lock', false);
export const leadDaysSetting = createSetting<number>('paperwork.leadDays', 7);

export const UPDATE_SOURCE = { owner: 'muhammadahmad545-code', repo: 'paperwork' } as const;
export const REPO_URL = `https://github.com/${UPDATE_SOURCE.owner}/${UPDATE_SOURCE.repo}`;
export const ACCENT = { dark: '#F5C451', light: '#9A6B00', onAccent: '#1E1500' } as const;
