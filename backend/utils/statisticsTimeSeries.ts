import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { STATISTICS_TIMEZONE } from './statisticsPacific'

dayjs.extend(utc)
dayjs.extend(timezone)

export type TimeSeriesBucket = 'hour' | 'day' | 'month'

/** Stable key for chart `dataKey` (avoids collisions with reserved keys). */
export function profileDataKey(profileId: number): string {
    return `p${profileId}`
}

/**
 * Ordered bucket keys between [startUtc, endUtc] in LA, inclusive of both ends
 * at the chosen granularity.
 */
export function buildOrderedBucketKeys(
    startIsoUtc: string,
    endIsoUtc: string,
    bucket: TimeSeriesBucket
): string[] {
    const keys: string[] = []
    const start = dayjs.utc(startIsoUtc).tz(STATISTICS_TIMEZONE)
    const end = dayjs.utc(endIsoUtc).tz(STATISTICS_TIMEZONE)

    if (bucket === 'hour') {
        let cur = start.startOf('hour')
        const endH = end.startOf('hour')
        const max = 200
        let n = 0
        while (
            (cur.isBefore(endH) || cur.isSame(endH, 'hour')) &&
            n < max
        ) {
            keys.push(cur.format('YYYY-MM-DD_HH'))
            cur = cur.add(1, 'hour')
            n += 1
        }
        return keys
    }

    if (bucket === 'day') {
        const endD = end.startOf('day')
        const startOrig = start.startOf('day')
        const maxBuckets = 400
        let curStart = startOrig
        const spanDays = endD.diff(curStart, 'day') + 1
        if (spanDays > maxBuckets) {
            curStart = endD.subtract(maxBuckets - 1, 'day')
        }
        let cur = curStart
        let n = 0
        while (
            (cur.isBefore(endD) || cur.isSame(endD, 'day')) &&
            n < maxBuckets
        ) {
            keys.push(cur.format('YYYY-MM-DD'))
            cur = cur.add(1, 'day')
            n += 1
        }
        return keys
    }

    // month — cap bucket count; when the span is huge (e.g. “all time”), keep the
    // **latest** months so the chart shows recent activity instead of only 1970s.
    const endM = end.startOf('month')
    let curStart = start.startOf('month')
    const maxBuckets = 180
    const spanMonths = endM.diff(curStart, 'month') + 1
    if (spanMonths > maxBuckets) {
        curStart = endM
            .subtract(maxBuckets - 1, 'month')
            .startOf('month')
    }
    let cur = curStart
    let n = 0
    while (
        (cur.isBefore(endM) || cur.isSame(endM, 'month')) &&
        n < maxBuckets
    ) {
        keys.push(cur.format('YYYY-MM'))
        cur = cur.add(1, 'month')
        n += 1
    }
    return keys
}

export function rowToBucketKey(
    createdAt: Date | string,
    bucket: TimeSeriesBucket
): string {
    const t = dayjs.utc(createdAt).tz(STATISTICS_TIMEZONE)
    if (bucket === 'hour') return t.format('YYYY-MM-DD_HH')
    if (bucket === 'day') return t.format('YYYY-MM-DD')
    return t.format('YYYY-MM')
}

export function formatBucketLabel(
    key: string,
    bucket: TimeSeriesBucket
): string {
    if (bucket === 'hour') {
        const [datePart, hourPart] = key.split('_')
        const h = (hourPart ?? '0').padStart(2, '0')
        return dayjs
            .tz(`${datePart}T${h}:00:00`, STATISTICS_TIMEZONE)
            .format('h:mm A')
    }
    if (bucket === 'day') {
        return dayjs.tz(key, 'YYYY-MM-DD', STATISTICS_TIMEZONE).format('MMM D')
    }
    return dayjs
        .tz(`${key}-01`, 'YYYY-MM-DD', STATISTICS_TIMEZONE)
        .format('MMM YYYY')
}

export function humanizeBucket(bucket: TimeSeriesBucket): string {
    if (bucket === 'hour') return 'Per hour'
    if (bucket === 'day') return 'Per day'
    return 'Per month'
}
