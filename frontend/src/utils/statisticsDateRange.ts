import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/** Must match `STATISTICS_TIMEZONE` in `backend/utils/statisticsPacific.ts`. */
export const STATISTICS_TIMEZONE = 'America/Los_Angeles' as const

/** Statistics date filter presets (bounds computed in {@link STATISTICS_TIMEZONE}). */
export type StatisticsDateRangePreset =
    | 'today'
    | 'week'
    | 'month'
    | 'all'
    | 'custom'

/**
 * Legacy rolling window (days before today 00:00 LA through now), UTC ISO for API.
 * Kept for callers/tests; the Statistics page uses {@link getStatisticsPresetBounds}.
 */
export const STATISTICS_ROLLING_WINDOW_DAYS = 7

export function getStatisticsRollingRangeBounds(): {
    startAt: string
    endAt: string
} {
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const start = end
        .startOf('day')
        .subtract(STATISTICS_ROLLING_WINDOW_DAYS, 'day')
    return {
        startAt: start.utc().toISOString(),
        endAt: end.utc().toISOString(),
    }
}

/** Caps retained for any chart widening helpers; Statistics chart uses the table window only. */
export const STATISTICS_CHART_MAX_PAST_EXTRA_DAYS = 120
export const STATISTICS_CHART_MAX_FUTURE_EXTRA_HOURS = 24 * 14

export function getStatisticsQueryBounds(
    opts: { pastExtraDays?: number; futureExtraHours?: number } = {}
): { startAt: string; endAt: string } {
    const base = getStatisticsRollingRangeBounds()
    const past = Math.max(
        0,
        Math.min(
            Math.floor(opts.pastExtraDays ?? 0),
            STATISTICS_CHART_MAX_PAST_EXTRA_DAYS
        )
    )
    const futH = Math.max(
        0,
        Math.min(
            Math.floor(opts.futureExtraHours ?? 0),
            STATISTICS_CHART_MAX_FUTURE_EXTRA_HOURS
        )
    )

    let startUtc = dayjs.utc(base.startAt)
    const endBase = dayjs.utc(base.endAt)

    if (past > 0) {
        startUtc = dayjs
            .utc(base.startAt)
            .tz(STATISTICS_TIMEZONE)
            .subtract(past, 'day')
            .startOf('day')
            .utc()
    }

    const endUtc = futH > 0 ? endBase.add(futH, 'hour') : endBase

    if (endUtc.valueOf() < startUtc.valueOf()) {
        return { startAt: startUtc.toISOString(), endAt: endBase.toISOString() }
    }

    return {
        startAt: startUtc.toISOString(),
        endAt: endUtc.toISOString(),
    }
}

/** Today in LA: 00:00 local through current instant (same instant end as “now”). */
export function getStatisticsTodayBoundsPST(): {
    startAt: string
    endAt: string
} {
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const start = end.startOf('day')
    return {
        startAt: start.utc().toISOString(),
        endAt: end.utc().toISOString(),
    }
}

/** Monday 00:00 LA (week starts Monday) through now. */
export function getStatisticsThisWeekBoundsPST(): {
    startAt: string
    endAt: string
} {
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const dow = end.day()
    const daysFromMonday = (dow + 6) % 7
    const start = end.subtract(daysFromMonday, 'day').startOf('day')
    return {
        startAt: start.utc().toISOString(),
        endAt: end.utc().toISOString(),
    }
}

/** First day of month 00:00 LA through now. */
export function getStatisticsThisMonthBoundsPST(): {
    startAt: string
    endAt: string
} {
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const start = end.startOf('month')
    return {
        startAt: start.utc().toISOString(),
        endAt: end.utc().toISOString(),
    }
}

/**
 * Earliest local midnight through now — counts all stored history in practice.
 */
export function getStatisticsAllTimeBoundsPST(): {
    startAt: string
    endAt: string
} {
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const start = dayjs
        .tz('1970-01-01T00:00:00', STATISTICS_TIMEZONE)
        .startOf('day')
    return {
        startAt: start.utc().toISOString(),
        endAt: end.utc().toISOString(),
    }
}

export function getStatisticsPresetBounds(
    preset: Exclude<StatisticsDateRangePreset, 'custom'>
): { startAt: string; endAt: string } {
    switch (preset) {
        case 'today':
            return getStatisticsTodayBoundsPST()
        case 'week':
            return getStatisticsThisWeekBoundsPST()
        case 'month':
            return getStatisticsThisMonthBoundsPST()
        case 'all':
            return getStatisticsAllTimeBoundsPST()
    }
}

/** RangePicker values aligned to LA wall clock from stored UTC ISO (read-only display). */
export function utcIsoRangeToLaDayjsTuple(
    startAt: string,
    endAt: string
): [Dayjs, Dayjs] {
    return [
        dayjs.utc(startAt).tz(STATISTICS_TIMEZONE),
        dayjs.utc(endAt).tz(STATISTICS_TIMEZONE),
    ]
}

export function statisticsRangeSummaryLabel(
    preset: StatisticsDateRangePreset
): string {
    if (preset === 'today') return 'Today (Pacific)'
    if (preset === 'week') return 'This week — Mon 00:00 to now (Pacific)'
    if (preset === 'month') return 'This month — 1st 00:00 to now (Pacific)'
    if (preset === 'all') return 'All time (1970-01-01 to now, Pacific end)'
    return 'Custom range (Pacific)'
}
