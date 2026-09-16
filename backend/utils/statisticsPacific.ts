import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/** Business timezone for statistics (PST / PDT). Keep in sync with frontend `STATISTICS_TIMEZONE`. */
export const STATISTICS_TIMEZONE = 'America/Los_Angeles'

/**
 * Parse client UTC ISO bounds as absolute instants — no timezone reinterpretation.
 * Returns normalized ISO strings for Sequelize (UTC storage).
 */
export function parseUtcIsoBound(raw: string): string | null {
    const s = raw.trim()
    if (!s) return null
    const d = dayjs.utc(s)
    if (!d.isValid()) return null
    return d.toISOString()
}

export function orderUtcIsoInclusive(
    startIso: string,
    endIso: string
): { startIso: string; endIso: string } {
    const a = dayjs.utc(startIso)
    const b = dayjs.utc(endIso)
    if (a.valueOf() <= b.valueOf()) {
        return { startIso: a.toISOString(), endIso: b.toISOString() }
    }
    return { startIso: b.toISOString(), endIso: a.toISOString() }
}

/**
 * Legacy `period` query: from N calendar days before today at 00:00 LA through now (LA).
 * Bounds as UTC ISO for `createdAt >=` / `createdAt <=`.
 */
export function getPeriodBoundsPacific(
    periodDays: number
): { startIso: string; endIso: string } | null {
    if (!Number.isFinite(periodDays) || periodDays <= 0) return null
    const end = dayjs.tz(new Date(), STATISTICS_TIMEZONE)
    const start = end.startOf('day').subtract(periodDays, 'day')
    return {
        startIso: start.utc().toISOString(),
        endIso: end.utc().toISOString(),
    }
}

/** `start` query: calendar day in LA → start of that day (UTC ISO). */
export function parseStartDateQueryPacific(raw: string): string | null {
    const s = raw.trim()
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = dayjs.tz(s, 'YYYY-MM-DD', STATISTICS_TIMEZONE).startOf('day')
        return d.isValid() ? d.utc().toISOString() : null
    }
    const inst = dayjs.utc(s)
    if (!inst.isValid()) {
        const fallback = dayjs(s)
        if (!fallback.isValid()) return null
        return fallback
            .tz(STATISTICS_TIMEZONE)
            .startOf('day')
            .utc()
            .toISOString()
    }
    return inst
        .tz(STATISTICS_TIMEZONE)
        .startOf('day')
        .utc()
        .toISOString()
}

/** `end` query: calendar day in LA → end of that day (UTC ISO). */
export function parseEndDateQueryPacific(raw: string): string | null {
    const s = raw.trim()
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = dayjs.tz(s, 'YYYY-MM-DD', STATISTICS_TIMEZONE).endOf('day')
        return d.isValid() ? d.utc().toISOString() : null
    }
    const inst = dayjs.utc(s)
    if (!inst.isValid()) {
        const fallback = dayjs(s)
        if (!fallback.isValid()) return null
        return fallback
            .tz(STATISTICS_TIMEZONE)
            .endOf('day')
            .utc()
            .toISOString()
    }
    return inst
        .tz(STATISTICS_TIMEZONE)
        .endOf('day')
        .utc()
        .toISOString()
}
