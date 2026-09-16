import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { INTERVIEW_STATUS_OPTIONS } from '../types/constants'

const allowed = new Set<string>(INTERVIEW_STATUS_OPTIONS)

export type TScheduleMeetingEntry = {
    timezone: string
    /** ISO 8601 string or empty */
    meetingTime: string
    meetingLink: string
}

export type TScheduleMeetingsMap = Record<string, TScheduleMeetingEntry>

export function parseScheduleMeetingsFromApi(raw: unknown): TScheduleMeetingsMap {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: TScheduleMeetingsMap = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!allowed.has(k)) continue
        if (v == null || typeof v !== 'object' || Array.isArray(v)) continue
        const o = v as Record<string, unknown>
        const tz =
            typeof o.timezone === 'string' && o.timezone.trim()
                ? o.timezone.trim()
                : 'America/New_York'
        const meetingTime =
            typeof o.meetingTime === 'string' ? o.meetingTime.trim() : ''
        const meetingLink =
            typeof o.meetingLink === 'string' ? o.meetingLink.trim() : ''
        out[k] = { timezone: tz, meetingTime, meetingLink }
    }
    return out
}

export function formValuesToEntry(values: {
    timezone: string
    meetingTime: Dayjs | null | undefined
    meetingLink?: string
}): TScheduleMeetingEntry {
    return {
        timezone: values.timezone?.trim() || 'America/New_York',
        meetingTime: values.meetingTime
            ? dayjs(values.meetingTime).toISOString()
            : '',
        meetingLink: typeof values.meetingLink === 'string' ? values.meetingLink.trim() : '',
    }
}

export function entryToFormValues(entry: TScheduleMeetingEntry | undefined): {
    timezone: string
    meetingTime: Dayjs | undefined
    meetingLink: string
} {
    if (!entry) {
        return {
            timezone: 'America/New_York',
            meetingTime: undefined,
            meetingLink: '',
        }
    }
    let meetingTime: Dayjs | undefined
    if (entry.meetingTime) {
        const d = dayjs(entry.meetingTime)
        meetingTime = d.isValid() ? d : undefined
    }
    return {
        timezone: entry.timezone || 'America/New_York',
        meetingTime,
        meetingLink: entry.meetingLink ?? '',
    }
}
