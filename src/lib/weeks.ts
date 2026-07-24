const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const MS_PER_WEEK = DAYS_PER_WEEK * MS_PER_DAY;
const ROTATION_PHASE_OFFSET = 1667;
const WEEK_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function toWeekKey(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid date');
  }

  return weekKeyFromUtcMs(
    utcDateMs(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

export function parseWeekKey(weekKey: string): { year: number; week: number } {
  const match = WEEK_KEY_PATTERN.exec(weekKey);

  if (!match) {
    throw new RangeError(`Invalid ISO week key: ${weekKey}`);
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const maxWeek = weeksInIsoYear(year);

  if (week < 1 || week > maxWeek) {
    throw new RangeError(`Invalid ISO week key: ${weekKey}`);
  }

  return { year, week };
}

export function weekOrdinal(weekKey: string): number {
  const { year, week } = parseWeekKey(weekKey);
  const weeksSinceOrdinalEpoch =
    (startOfIsoWeekMs(year, week) - startOfIsoWeekMs(0, 1)) / MS_PER_WEEK;

  // Anchor the continuous ordinal to the original 2026-W30 rotation value.
  return Math.round(weeksSinceOrdinalEpoch) + 1 + ROTATION_PHASE_OFFSET;
}

export function addWeeks(weekKey: string, delta: number): string {
  if (!Number.isInteger(delta)) {
    throw new RangeError(`Week delta must be an integer: ${delta}`);
  }

  const { year, week } = parseWeekKey(weekKey);
  const startMs = startOfIsoWeekMs(year, week);

  return weekKeyFromUtcMs(startMs + delta * MS_PER_WEEK);
}

export function currentWeekKey(now = new Date()): string {
  return toWeekKey(now);
}

export function formatWeekLabel(weekKey: string): string {
  const { year, week } = parseWeekKey(weekKey);
  const startMs = startOfIsoWeekMs(year, week);
  const endMs = startMs + 6 * MS_PER_DAY;
  const start = utcDateParts(startMs);
  const end = utcDateParts(endMs);
  const rangeDash = '\u2013';

  if (start.year === end.year && start.month === end.month) {
    return `${MONTH_NAMES[start.month]} ${start.day}${rangeDash}${end.day}, ${start.year}`;
  }

  if (start.year === end.year) {
    return `${MONTH_NAMES[start.month]} ${start.day}${rangeDash}${MONTH_NAMES[end.month]} ${end.day}, ${start.year}`;
  }

  return `${MONTH_NAMES[start.month]} ${start.day}, ${start.year}${rangeDash}${MONTH_NAMES[end.month]} ${end.day}, ${end.year}`;
}

export function listUpcomingWeekKeys(
  fromWeekKey: string,
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Week count must be a non-negative integer: ${count}`);
  }

  return Array.from({ length: count }, (_, index) =>
    addWeeks(fromWeekKey, index),
  );
}

/** Shift an ISO date (YYYY-MM-DD) by a whole number of days. */
export function addDaysToIsoDate(date: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError(`Day delta must be an integer: ${days}`);
  }

  return formatUtcDate(parseIsoDate(date) + days * MS_PER_DAY);
}

/** ISO week key containing the given calendar date. */
export function weekKeyFromIsoDate(isoDate: string): string {
  return weekKeyFromUtcMs(parseIsoDate(isoDate));
}

/**
 * Inclusive date range → ISO week keys that overlap it.
 * Caps at 80 weeks to keep exports bounded.
 */
export function weekKeysOverlappingRange(from: string, until: string): string[] {
  if (until < from) {
    return [];
  }

  const rangeStart = parseIsoDate(from);
  const rangeEnd = parseIsoDate(until);
  const keys: string[] = [];
  let weekKey = weekKeyFromIsoDate(from);

  for (let i = 0; i < 80; i += 1) {
    const weekStart = parseIsoDate(weekStartDate(weekKey));
    const weekEnd = parseIsoDate(weekEndExclusiveDate(weekKey));

    if (weekStart > rangeEnd) {
      break;
    }

    if (weekEnd > rangeStart && weekStart <= rangeEnd) {
      keys.push(weekKey);
    }

    weekKey = addWeeks(weekKey, 1);
  }

  return keys;
}

/** Monday 00:00 UTC of the ISO week, as YYYY-MM-DD. */
export function weekStartDate(weekKey: string): string {
  const { year, week } = parseWeekKey(weekKey);
  return formatUtcDate(startOfIsoWeekMs(year, week));
}

/** Exclusive end = next Monday YYYY-MM-DD. */
export function weekEndExclusiveDate(weekKey: string): string {
  const { year, week } = parseWeekKey(weekKey);
  return formatUtcDate(startOfIsoWeekMs(year, week) + MS_PER_WEEK);
}

export function parseIsoDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new RangeError(`Invalid ISO date: ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = utcDateMs(year, month - 1, day);
  const parts = utcDateParts(ms);

  if (parts.year !== year || parts.month !== month - 1 || parts.day !== day) {
    throw new RangeError(`Invalid ISO date: ${date}`);
  }

  return ms;
}

export function formatUtcDate(utcMs: number): string {
  const { year, month, day } = utcDateParts(utcMs);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days overlapping [from, until) with the Mon–Sun ISO week. */
export function overlapDaysInWeek(
  from: string,
  until: string,
  weekKey: string,
): number {
  const rangeStart = parseIsoDate(from);
  const rangeEnd = parseIsoDate(until);
  if (rangeEnd <= rangeStart) {
    return 0;
  }

  const weekStart = parseIsoDate(weekStartDate(weekKey));
  const weekEnd = parseIsoDate(weekEndExclusiveDate(weekKey));
  const start = Math.max(rangeStart, weekStart);
  const end = Math.min(rangeEnd, weekEnd);
  if (end <= start) {
    return 0;
  }

  return Math.round((end - start) / MS_PER_DAY);
}

function weekKeyFromUtcMs(utcMs: number): string {
  const isoWeekday = getIsoWeekday(utcMs);
  const thursdayMs = utcMs + (4 - isoWeekday) * MS_PER_DAY;
  const thursday = new Date(thursdayMs);
  const weekYear = thursday.getUTCFullYear();
  const weekOneStartMs = startOfIsoWeekMs(weekYear, 1);
  const week = Math.floor((utcMs - weekOneStartMs) / MS_PER_WEEK) + 1;

  return `${String(weekYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;
}

function weeksInIsoYear(year: number): number {
  const dec28WeekKey = weekKeyFromUtcMs(utcDateMs(year, 11, 28));

  return Number(dec28WeekKey.slice(6));
}

function startOfIsoWeekMs(year: number, week: number): number {
  const jan4Ms = utcDateMs(year, 0, 4);
  const weekOneMondayMs = jan4Ms - (getIsoWeekday(jan4Ms) - 1) * MS_PER_DAY;

  return weekOneMondayMs + (week - 1) * DAYS_PER_WEEK * MS_PER_DAY;
}

function getIsoWeekday(utcMs: number): number {
  const weekday = new Date(utcMs).getUTCDay();

  return weekday === 0 ? 7 : weekday;
}

function utcDateMs(year: number, monthIndex: number, day: number): number {
  const date = new Date(0);

  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);

  return date.getTime();
}

function utcDateParts(utcMs: number): {
  year: number;
  month: number;
  day: number;
} {
  const date = new Date(utcMs);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}
