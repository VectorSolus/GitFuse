export const HISTORY_DAYS_PER_WEEK = 7;
export const HISTORY_WEEK_START = "sunday";

export type HistoryCalendarCell = {
  date: Date;
  dateKey: string;
  isSelectedYear: boolean;
  isFuture: boolean;
};

export type HistoryYearCalendar = {
  selectedYear: number;
  yearStart: Date;
  yearEnd: Date;
  gridStart: Date;
  gridEnd: Date;
  weeks: HistoryCalendarCell[][];
};

export type HistoryDayActivity = {
  dateKey: string;
  commitCount: number;
};

export type HistoryMonthMarker = {
  label: string;
  column: number;
};

export type HistoryCellPresentation = HistoryCalendarCell & {
  count: number;
  level: number;
  label: string;
};

export type HistoryDateSelectionsByYear = Record<number, string>;

export function atLocalNoon(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function normalizeLocalNoon(input: Date): Date {
  return atLocalNoon(
    input.getFullYear(),
    input.getMonth(),
    input.getDate(),
  );
}

export function addCalendarDays(input: Date, amount: number): Date {
  const date = normalizeLocalNoon(input);
  return atLocalNoon(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
  );
}

export function toLocalDateKey(input: Date): string {
  const date = normalizeLocalNoon(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return atLocalNoon(year, month - 1, day);
}

export function startOfSundayWeek(input: Date): Date {
  const date = normalizeLocalNoon(input);
  return addCalendarDays(date, -date.getDay());
}

export function endOfSaturdayWeek(input: Date): Date {
  const date = normalizeLocalNoon(input);
  return addCalendarDays(date, 6 - date.getDay());
}

export function buildYearCalendar(
  selectedYear: number,
  now = new Date(),
): HistoryYearCalendar {
  const today = normalizeLocalNoon(now);
  const yearStart = atLocalNoon(selectedYear, 0, 1);
  const yearEnd = atLocalNoon(selectedYear, 11, 31);
  const gridStart = startOfSundayWeek(yearStart);
  const gridEnd = endOfSaturdayWeek(yearEnd);
  const weeks: HistoryCalendarCell[][] = [];

  let cursor = gridStart;
  while (cursor.getTime() <= gridEnd.getTime()) {
    const week: HistoryCalendarCell[] = [];

    for (let dayIndex = 0; dayIndex < HISTORY_DAYS_PER_WEEK; dayIndex += 1) {
      const date = addCalendarDays(cursor, dayIndex);
      week.push({
        date,
        dateKey: toLocalDateKey(date),
        isSelectedYear: date.getFullYear() === selectedYear,
        isFuture: date.getTime() > today.getTime(),
      });
    }

    weeks.push(week);
    cursor = addCalendarDays(cursor, HISTORY_DAYS_PER_WEEK);
  }

  const calendar = {
    selectedYear,
    yearStart,
    yearEnd,
    gridStart,
    gridEnd,
    weeks,
  };

  if (process.env.NODE_ENV !== "production") {
    assertYearCalendarInvariants(calendar);
  }

  return calendar;
}

export function assertYearCalendarInvariants(calendar: HistoryYearCalendar) {
  const cells = calendar.weeks.flat();
  const selectedYearCells = cells.filter((cell) => cell.isSelectedYear);
  const expectedDays = isLeapYear(calendar.selectedYear) ? 366 : 365;
  const selectedYearKeys = selectedYearCells.map((cell) => cell.dateKey);

  if (
    !calendar.weeks.every(
      (week) => week.length === HISTORY_DAYS_PER_WEEK,
    )
  ) {
    throw new Error("History calendar must contain exactly seven cells per week.");
  }
  if (selectedYearCells.length !== expectedDays) {
    throw new Error(
      `History calendar expected ${expectedDays} dates for ${calendar.selectedYear} but generated ${selectedYearCells.length}.`,
    );
  }
  if (new Set(selectedYearKeys).size !== expectedDays) {
    throw new Error("History calendar contains duplicate selected-year dates.");
  }
  if (!selectedYearKeys.includes(`${calendar.selectedYear}-01-01`)) {
    throw new Error("History calendar is missing January 1.");
  }
  if (!selectedYearKeys.includes(`${calendar.selectedYear}-12-31`)) {
    throw new Error("History calendar is missing December 31.");
  }

  for (let index = 1; index < selectedYearCells.length; index += 1) {
    if (
      calendarDayDifference(
        selectedYearCells[index - 1].date,
        selectedYearCells[index].date,
      ) !== 1
    ) {
      throw new Error(
        `History calendar skips a date between ${selectedYearCells[index - 1].dateKey} and ${selectedYearCells[index].dateKey}.`,
      );
    }
  }
}

export function buildHistoryActivityByDate<T>(
  events: T[],
  getTimestamp: (event: T) => string,
  getCommitCount: (event: T) => number,
) {
  const activityByDate = new Map<string, HistoryDayActivity>();

  for (const event of events) {
    const dateKey = toLocalDateKey(new Date(getTimestamp(event)));
    const existing = activityByDate.get(dateKey) ?? {
      dateKey,
      commitCount: 0,
    };

    existing.commitCount += getCommitCount(event);
    activityByDate.set(dateKey, existing);
  }

  return activityByDate;
}

export function summarizeHistoryEvents<T>(
  events: T[],
  getTimestamp: (event: T) => string,
  getCommitCount: (event: T) => number,
  getRepositoryName: (event: T) => string,
) {
  return {
    totalCommits: events.reduce(
      (total, event) => total + getCommitCount(event),
      0,
    ),
    syncedDays: new Set(
      events.map((event) =>
        toLocalDateKey(new Date(getTimestamp(event))),
      ),
    ).size,
    totalRepos: new Set(events.map(getRepositoryName)).size,
    totalBundles: events.length,
  };
}

export function presentHistoryCell(
  cell: HistoryCalendarCell,
  activityByDate: ReadonlyMap<string, HistoryDayActivity>,
): HistoryCellPresentation {
  const count =
    cell.isSelectedYear && !cell.isFuture
      ? activityByDate.get(cell.dateKey)?.commitCount ?? 0
      : 0;

  return {
    ...cell,
    count,
    level: getActivityLevel(count),
    label: formatHistoryDateLabel(cell.dateKey),
  };
}

export function buildHistoryMonthMarkers(
  weeks: HistoryCalendarCell[][],
  selectedYear: number,
): HistoryMonthMarker[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const firstDateKey = toLocalDateKey(
      atLocalNoon(selectedYear, monthIndex, 1),
    );
    const column =
      weeks.findIndex((week) =>
        week.some(
          (cell) =>
            cell.isSelectedYear && cell.dateKey === firstDateKey,
        ),
      ) + 1;

    return {
      label: atLocalNoon(selectedYear, monthIndex, 1).toLocaleDateString(
        "en",
        { month: "short" },
      ),
      column,
    };
  });
}

export function formatHistoryDateLabel(dateKey: string): string {
  return parseLocalDateKey(dateKey).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getHistoryTooltip(cell: HistoryCellPresentation) {
  return {
    date: cell.label,
    activity:
      !cell.isSelectedYear
        ? "Outside the selected year"
        : cell.isFuture
          ? "Future date"
          : cell.count === 0
            ? "No commits synced"
            : `${cell.count} commit${cell.count === 1 ? "" : "s"} synced`,
  };
}

export function getSelectableDateForHistoryCell(
  cell: HistoryCalendarCell,
) {
  return cell.isSelectedYear && !cell.isFuture ? cell.dateKey : null;
}

export function getDefaultSelectedHistoryDate(
  _activeDateKeys: string[],
  selectedYear: number,
  now = new Date(),
) {
  const currentYear = now.getFullYear();
  return selectedYear === currentYear ? toLocalDateKey(now) : null;
}

export function resolveSelectedHistoryDate(
  activeDateKeys: string[],
  selectedYear: number,
  explicitSelectionsByYear: HistoryDateSelectionsByYear,
  now = new Date(),
) {
  return (
    explicitSelectionsByYear[selectedYear] ??
    getDefaultSelectedHistoryDate(activeDateKeys, selectedYear, now)
  );
}

export function rememberSelectedHistoryDate(
  explicitSelectionsByYear: HistoryDateSelectionsByYear,
  selectedYear: number,
  dateKey: string,
) {
  if (!dateKey.startsWith(`${selectedYear}-`)) {
    return explicitSelectionsByYear;
  }

  return {
    ...explicitSelectionsByYear,
    [selectedYear]: dateKey,
  };
}

export function getActivityLevel(count: number) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  if (count <= 10) return 4;
  return 5;
}

export function calendarDayDifference(start: Date, end: Date) {
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1000));
}

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
