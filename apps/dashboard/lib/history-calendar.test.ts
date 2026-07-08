import assert from "node:assert/strict";
import test from "node:test";

import {
  addCalendarDays,
  assertYearCalendarInvariants,
  buildHistoryActivityByDate,
  buildHistoryMonthMarkers,
  buildYearCalendar,
  calendarDayDifference,
  getDefaultSelectedHistoryDate,
  getHistoryTooltip,
  getSelectableDateForHistoryCell,
  rememberSelectedHistoryDate,
  presentHistoryCell,
  resolveSelectedHistoryDate,
  summarizeHistoryEvents,
  toLocalDateKey,
} from "./history-calendar";

function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function selectedYearCells(
  calendar: ReturnType<typeof buildYearCalendar>,
) {
  return calendar.weeks.flat().filter((cell) => cell.isSelectedYear);
}

function findCell(
  calendar: ReturnType<typeof buildYearCalendar>,
  dateKey: string,
) {
  const cell = calendar.weeks.flat().find((item) => item.dateKey === dateKey);
  assert.ok(cell, `${dateKey} should exist in the rendered calendar`);
  return cell;
}

function assertSelectedYearContinuity(
  calendar: ReturnType<typeof buildYearCalendar>,
) {
  const cells = selectedYearCells(calendar);
  for (let index = 1; index < cells.length; index += 1) {
    assert.equal(
      calendarDayDifference(cells[index - 1].date, cells[index].date),
      1,
      `${cells[index - 1].dateKey} should be followed by ${cells[index].dateKey}`,
    );
  }
}

test("non-leap yearly calendar contains every date exactly once", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 5, 18));
  const cells = selectedYearCells(calendar);
  const keys = cells.map((cell) => cell.dateKey);

  assert.equal(cells.length, 365);
  assert.equal(new Set(keys).size, 365);
  assert.equal(keys.filter((key) => key === "2026-01-01").length, 1);
  assert.equal(keys.filter((key) => key === "2026-12-31").length, 1);
  assert.equal(keys.includes("2026-02-29"), false);
  assertSelectedYearContinuity(calendar);
  assertYearCalendarInvariants(calendar);
});

test("leap-year calendar contains February 29 exactly once", () => {
  const calendar = buildYearCalendar(2024, localDate(2026, 5, 18));
  const cells = selectedYearCells(calendar);
  const keys = cells.map((cell) => cell.dateKey);

  assert.equal(cells.length, 366);
  assert.equal(new Set(keys).size, 366);
  assert.equal(keys.filter((key) => key === "2024-02-29").length, 1);
  assert.equal(
    keys.indexOf("2024-02-29"),
    keys.indexOf("2024-02-28") + 1,
  );
  assert.equal(
    keys.indexOf("2024-03-01"),
    keys.indexOf("2024-02-29") + 1,
  );
  assertSelectedYearContinuity(calendar);
});

test("all twelve month labels align to their first calendar week", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 5, 18));
  const markers = buildHistoryMonthMarkers(calendar.weeks, 2026);

  assert.deepEqual(
    markers.map((marker) => marker.label),
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  );

  markers.forEach((marker, monthIndex) => {
    const firstDateKey = `2026-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const expectedColumn =
      calendar.weeks.findIndex((week) =>
        week.some((cell) => cell.dateKey === firstDateKey),
      ) + 1;
    assert.equal(marker.column, expectedColumn);
  });
});

test("padding and future cells are not selectable", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 5, 18));
  const cells = calendar.weeks.flat();

  assert.ok(calendar.weeks.every((week) => week.length === 7));
  assert.ok(cells.some((cell) => !cell.isSelectedYear));
  assert.ok(cells.some((cell) => cell.isSelectedYear && cell.isFuture));
  assert.ok(
    cells
      .filter((cell) => !cell.isSelectedYear || cell.isFuture)
      .every((cell) => getSelectableDateForHistoryCell(cell) === null),
  );
});

test("UTC events near midnight use the same local date key as cells", () => {
  const event = {
    createdAt: "2026-06-16T23:30:00.000Z",
    commitCount: 4,
  };
  const expectedKey = toLocalDateKey(new Date(event.createdAt));
  const activity = buildHistoryActivityByDate(
    [event],
    (item) => item.createdAt,
    (item) => item.commitCount,
  );

  assert.equal(activity.size, 1);
  assert.equal(activity.get(expectedKey)?.commitCount, 4);
});

test("tooltip and clicked selection use the exact cell date key", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 5, 18));
  const activity = new Map([
    ["2026-06-17", { dateKey: "2026-06-17", commitCount: 4 }],
  ]);
  const cell = findCell(calendar, "2026-06-17");
  const presented = presentHistoryCell(cell, activity);
  const tooltip = getHistoryTooltip(presented);

  assert.equal(tooltip.date, "Jun 17, 2026");
  assert.equal(tooltip.activity, "4 commits synced");
  assert.equal(getSelectableDateForHistoryCell(cell), "2026-06-17");
});

test("default selection uses today instead of latest activity", () => {
  assert.equal(
    getDefaultSelectedHistoryDate(
      ["2026-06-15", "2026-06-17"],
      2026,
      localDate(2026, 5, 18),
    ),
    "2026-06-18",
  );
  assert.equal(
    getDefaultSelectedHistoryDate([], 2026, localDate(2026, 5, 18)),
    "2026-06-18",
  );
  assert.equal(
    getDefaultSelectedHistoryDate([], 2025, localDate(2026, 5, 18)),
    null,
  );
});

test("previous activity remains highlighted when today is selected", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 6, 7));
  const activity = new Map([
    ["2026-07-06", { dateKey: "2026-07-06", commitCount: 2 }],
  ]);
  const todayCell = presentHistoryCell(
    findCell(calendar, "2026-07-07"),
    activity,
  );
  const previousCell = presentHistoryCell(
    findCell(calendar, "2026-07-06"),
    activity,
  );

  assert.equal(
    resolveSelectedHistoryDate(["2026-07-06"], 2026, {}, localDate(2026, 6, 7)),
    "2026-07-07",
  );
  assert.equal(todayCell.count, 0);
  assert.equal(todayCell.level, 0);
  assert.equal(previousCell.count, 2);
  assert.ok(previousCell.level > 0);
});

test("activity on today renders as the selected date activity", () => {
  const calendar = buildYearCalendar(2026, localDate(2026, 6, 7));
  const activity = new Map([
    ["2026-07-07", { dateKey: "2026-07-07", commitCount: 3 }],
  ]);
  const todayCell = presentHistoryCell(
    findCell(calendar, "2026-07-07"),
    activity,
  );

  assert.equal(
    resolveSelectedHistoryDate(["2026-07-07"], 2026, {}, localDate(2026, 6, 7)),
    "2026-07-07",
  );
  assert.equal(todayCell.count, 3);
  assert.equal(getHistoryTooltip(todayCell).activity, "3 commits synced");
});

test("explicit clicked dates are remembered by selected year", () => {
  const clicked = rememberSelectedHistoryDate({}, 2026, "2026-07-06");

  assert.deepEqual(clicked, { 2026: "2026-07-06" });
  assert.equal(
    resolveSelectedHistoryDate(["2026-07-06"], 2026, clicked, localDate(2026, 6, 7)),
    "2026-07-06",
  );
});

test("year switching clears automatic selection and restores today when appropriate", () => {
  const now = localDate(2026, 6, 7);

  assert.equal(
    resolveSelectedHistoryDate(["2025-12-30"], 2025, {}, now),
    null,
  );
  assert.equal(
    resolveSelectedHistoryDate(["2026-07-06"], 2026, {}, now),
    "2026-07-07",
  );
  assert.equal(
    resolveSelectedHistoryDate(
      ["2026-07-06"],
      2026,
      { 2026: "2026-07-06" },
      now,
    ),
    "2026-07-06",
  );
});

test("explicit selections cannot target dates outside the selected year", () => {
  const selections = { 2026: "2026-07-06" };

  assert.strictEqual(
    rememberSelectedHistoryDate(selections, 2025, "2026-07-06"),
    selections,
  );
});

test("selected-year summary values match the supplied events", () => {
  const events = [
    {
      createdAt: "2026-06-17T10:00:00.000Z",
      commitCount: 3,
      repositoryName: "alpha",
    },
    {
      createdAt: "2026-06-17T12:00:00.000Z",
      commitCount: 2,
      repositoryName: "beta",
    },
  ];
  const summary = summarizeHistoryEvents(
    events,
    (event) => event.createdAt,
    (event) => event.commitCount,
    (event) => event.repositoryName,
  );

  assert.deepEqual(summary, {
    totalCommits: 5,
    syncedDays: 1,
    totalRepos: 2,
    totalBundles: 2,
  });
});

test("calendar date arithmetic survives DST boundaries", () => {
  const beforeDst = localDate(2026, 2, 7);
  const afterDst = addCalendarDays(beforeDst, 1);

  assert.equal(calendarDayDifference(beforeDst, afterDst), 1);
  assert.equal(toLocalDateKey(afterDst), "2026-03-08");
});

test("local date keys do not shift across positive or negative timezone-style offsets", () => {
  assert.equal(toLocalDateKey(localDate(2026, 6, 7)), "2026-07-07");
  assert.equal(toLocalDateKey(new Date(2026, 6, 7, 0, 30)), "2026-07-07");
  assert.equal(toLocalDateKey(new Date(2026, 6, 7, 23, 30)), "2026-07-07");
});
