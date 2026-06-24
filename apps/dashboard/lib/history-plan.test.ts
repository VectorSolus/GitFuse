import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_LIMITS,
  availableHistoryYears,
  resolvePermittedHistoryYear,
} from "@gitfuse/types/billing";

test("plan history retention exposes configured calendar years", () => {
  assert.equal(PLAN_LIMITS.free.historyDays, 7);
  assert.equal(PLAN_LIMITS.pro.historyDays, 730);
  assert.equal(PLAN_LIMITS.team.historyDays, 730);

  assert.deepEqual(availableHistoryYears("free", 2026), [2026]);
  assert.deepEqual(availableHistoryYears("pro", 2026), [2026, 2025]);
  assert.deepEqual(availableHistoryYears("team", 2026), [2026, 2025]);
});

test("unavailable history years fall back to the current year", () => {
  assert.equal(resolvePermittedHistoryYear("free", 2025, 2026), 2026);
  assert.equal(resolvePermittedHistoryYear("pro", 2025, 2026), 2025);
  assert.equal(resolvePermittedHistoryYear("pro", 2024, 2026), 2026);
});
