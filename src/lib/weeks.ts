const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
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

  return year * 53 + week;
}

export function addWeeks(weekKey: string, delta: number): string {
  if (!Number.isInteger(delta)) {
    throw new RangeError(`Week delta must be an integer: ${delta}`);
  }

  const { year, week } = parseWeekKey(weekKey);
  const startMs = startOfIsoWeekMs(year, week);

  return weekKeyFromUtcMs(startMs + delta * DAYS_PER_WEEK * MS_PER_DAY);
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

function weekKeyFromUtcMs(utcMs: number): string {
  const isoWeekday = getIsoWeekday(utcMs);
  const thursdayMs = utcMs + (4 - isoWeekday) * MS_PER_DAY;
  const thursday = new Date(thursdayMs);
  const weekYear = thursday.getUTCFullYear();
  const yearStartMs = utcDateMs(weekYear, 0, 1);
  const daysIntoYear = Math.floor((thursdayMs - yearStartMs) / MS_PER_DAY);
  const week = Math.ceil((daysIntoYear + 1) / DAYS_PER_WEEK);

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
