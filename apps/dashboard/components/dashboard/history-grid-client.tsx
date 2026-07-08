"use client";

import type { CSSProperties } from "react";

import {
  buildHistoryMonthMarkers,
  getHistoryTooltip,
  getSelectableDateForHistoryCell,
  presentHistoryCell,
  type HistoryDayActivity,
  type HistoryYearCalendar,
} from "@/lib/history-calendar";

type HistoryGridClientProps = {
  calendar: HistoryYearCalendar;
  activityByDate: ReadonlyMap<string, HistoryDayActivity>;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
  loading?: boolean;
};

export function HistoryGridClient({
  calendar,
  activityByDate,
  selectedDateKey,
  onSelectDate,
  loading = false,
}: HistoryGridClientProps) {
  const monthMarkers = buildHistoryMonthMarkers(
    calendar.weeks,
    calendar.selectedYear,
  );

  return (
    <div
      className={`gf-history-graph-shell ${loading ? "is-loading" : ""}`}
      aria-busy={loading}
      style={
        {
          "--history-week-columns": calendar.weeks.length,
        } as CSSProperties
      }
    >
      <div className="gf-history-month-row">
        {monthMarkers.map((month) => (
          <span
            key={`${month.label}-${month.column}`}
            style={{ gridColumnStart: month.column }}
          >
            {month.label}
          </span>
        ))}
      </div>

      <div className="gf-history-graph-body">
        <div className="gf-history-weekdays">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>

        <div className="gf-history-squares" aria-label="Sync history graph">
          {calendar.weeks.map((week) => (
            <div className="gf-history-week" key={week[0].dateKey}>
              {week.map((cell) => {
                const presentedCell = presentHistoryCell(cell, activityByDate);
                const isPadding = !presentedCell.isSelectedYear;

                if (isPadding) {
                  return (
                    <span
                      key={presentedCell.dateKey}
                      className="gf-history-square gf-history-square--padding"
                      aria-hidden="true"
                    />
                  );
                }

                const tooltip = getHistoryTooltip(presentedCell);
                const selectableDate =
                  getSelectableDateForHistoryCell(presentedCell);

                return (
                  <button
                    key={presentedCell.dateKey}
                    type="button"
                    className={`gf-history-square level-${presentedCell.level} ${
                      selectedDateKey === presentedCell.dateKey
                        ? "is-selected"
                        : ""
                    } ${presentedCell.isFuture ? "is-future" : ""}`}
                    aria-disabled={!selectableDate}
                    tabIndex={selectableDate ? 0 : -1}
                    aria-label={`${tooltip.date}: ${tooltip.activity}`}
                    onClick={() => {
                      if (selectableDate) onSelectDate(selectableDate);
                    }}
                  >
                    <span className="gf-history-tooltip">
                      <strong>{tooltip.date}</strong>
                      <small>{tooltip.activity}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="gf-history-legend">
        <span>Less</span>
        <i className="level-0" />
        <i className="level-1" />
        <i className="level-2" />
        <i className="level-3" />
        <i className="level-4" />
        <i className="level-5" />
        <span>More</span>
      </div>
    </div>
  );
}
