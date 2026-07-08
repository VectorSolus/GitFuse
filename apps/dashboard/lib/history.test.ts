import assert from "node:assert/strict";
import test from "node:test";

import {
  historyYearRange,
  isTimestampInHistoryYear,
} from "./history";

test("history year range uses inclusive January 1 and exclusive next January 1", () => {
  const range = historyYearRange(2026);

  assert.equal(range.start.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(isTimestampInHistoryYear("2025-12-31T23:59:59.999Z", 2026), false);
  assert.equal(isTimestampInHistoryYear("2026-01-01T00:00:00.000Z", 2026), true);
  assert.equal(isTimestampInHistoryYear("2026-12-31T23:59:59.999Z", 2026), true);
  assert.equal(isTimestampInHistoryYear("2027-01-01T00:00:00.000Z", 2026), false);
});

test("history year range respects the browser timezone offset", () => {
  const indiaOffset = -330;
  const range = historyYearRange(2026, indiaOffset);

  assert.equal(range.start.toISOString(), "2025-12-31T18:30:00.000Z");
  assert.equal(range.end.toISOString(), "2026-12-31T18:30:00.000Z");
  assert.equal(
    isTimestampInHistoryYear(
      "2025-12-31T20:00:00.000Z",
      2026,
      indiaOffset,
    ),
    true,
  );
});
