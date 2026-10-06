import type { Availability } from '@/types';

/** Sensible starting hours for a brand-new account (the setup wizard lets you change them). */
export const DEFAULT_AVAILABILITY: Availability = {
  weekly: [
    { weekday: 0, hours: 3, startTime: '10:00' },
    { weekday: 1, hours: 2, startTime: '17:00' },
    { weekday: 2, hours: 2, startTime: '17:00' },
    { weekday: 3, hours: 2, startTime: '17:00' },
    { weekday: 4, hours: 2, startTime: '17:00' },
    { weekday: 5, hours: 1, startTime: '17:00' },
    { weekday: 6, hours: 3, startTime: '10:00' },
  ],
  overrides: [],
};
