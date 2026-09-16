import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
    App,
    Button,
    Checkbox,
    Input,
    Modal,
    Select,
    Table,
    Tooltip,
} from 'antd'
import {
    LeftOutlined,
    ReloadOutlined,
    RightOutlined,
} from '@ant-design/icons'
import moment from 'moment-timezone'

import PageShell from '@/components/PageShell'
import { TABLE_PAGINATION_COMFORT_CLASSNAME } from '@/constants/tablePagination'
import { useThemeMode } from '@/components/ThemeContext'
import { ScheduleImportsPanel } from '@/components/ScheduleImportsPanel'
import {
    FetchCalendarProgressModal,
    type FetchCalendarProgressSnapshot,
} from '@/components/FetchCalendarProgressModal'
import { getProfile, listProfiles } from '@/actions/profiles'
import { listHistory } from '@/actions/history'
import {
    clearCalendarForProfile,
    fetchGoogleCalendarForProfile,
    getCalendarEventsForProfile,
    type ProfileCalendarEvent,
} from '@/actions/calendar'
import type { TProfile } from '@/types'
import type { THistory } from '@/types'
import { useProfileUsers } from '@/components/ProfileUsersContext'
import { getLatestStatusStage } from '@/utils/historyStatusStages'
import { normalizeProfileUserIndex } from '@/utils/profileUserIndex'
import { parseScheduleMeetingsFromApi } from '@/utils/scheduleMeetings'
import { htmlToPlainTextForDisplay } from '@/utils/htmlToPlainText'

/** Default for Google Calendar view: Pacific (incl. DST). */
const DEFAULT_CALENDAR_DISPLAY_TZ = 'America/Los_Angeles'

/** Google Calendar toolbar: US zones + UTC/GMT only (no full global list). */
const CALENDAR_TIMEZONE_SELECT_OPTIONS: { label: string; value: string }[] = [
    { label: 'Eastern Time (US)', value: 'America/New_York' },
    { label: 'Central Time (US)', value: 'America/Chicago' },
    { label: 'Mountain Time (US)', value: 'America/Denver' },
    { label: 'Mountain Time — Arizona (US, no DST)', value: 'America/Phoenix' },
    { label: 'Pacific Time (US)', value: 'America/Los_Angeles' },
    { label: 'Alaska Time (US)', value: 'America/Anchorage' },
    { label: 'Hawaii Time (US)', value: 'Pacific/Honolulu' },
    { label: 'UTC / GMT (standard)', value: 'Etc/UTC' },
]

/** When DTEND is missing or schedule import has no end time (use 30m, not 45m). */
const DEFAULT_EVENT_DURATION_MIN = 30

const CLOSED_FETCH_PROGRESS: FetchCalendarProgressSnapshot = {
    open: false,
    phase: 'fetching',
    profiles: [],
    totals: {
        success: 0,
        failed: 0,
        warnings: 0,
        events: 0,
        scheduleRows: 0,
    },
}

const hasCalendarUrl = (p: TProfile): boolean => {
    const raw = p.calendarUrl
    return raw != null && String(raw).trim() !== ''
}

type ViewMode = 'table' | 'scheduleTable'
type CalendarDisplayMode = 'day' | 'week' | 'month' | 'year' | 'schedule' | '4days'

/** Google Calendar toolbar: one `TProfileUser.id` vs all (matches Schedule Table). */
type GoogleCalProfileUserSlot = 'all' | number

type CalendarTableEvent = {
    id: string
    profileName: string
    company: string
    position: string
    timezone: string
    source: 'json' | 'temporary'
    description: string
    location: string
    rawStart: string
    rawEnd: string
    startLocal: moment.Moment
    endLocal: moment.Moment
}

function normalizeCalendarDedupeTitle(raw: string): string {
    let s = raw.toLowerCase().replace(/\s+/g, ' ').trim()
    s = s.replace(/^suggested!+\s*/i, '').replace(/^suggested\s*/i, '')
    s = s.replace(/^your virtual (interview|recruiter screen) at\s+/i, '')
    return s.slice(0, 160)
}

function calendarImportTitlesLikelySame(a: string, b: string): boolean {
    const na = normalizeCalendarDedupeTitle(a)
    const nb = normalizeCalendarDedupeTitle(b)
    if (!na || !nb) return false
    if (na.includes(nb) || nb.includes(na)) return true
    const words = (x: string) =>
        x.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
    const wb = new Set(words(nb))
    const shared = words(na).filter((w) => wb.has(w))
    return shared.length >= 2 || (shared.length === 1 && shared[0].length >= 8)
}

/** Normalize URL for dedupe: lowercase, strip query/hash, trim trailing slash. */
function normalizeMeetingUrlKey(raw: string): string {
    try {
        let s = raw.trim().toLowerCase()
        const q = s.indexOf('?')
        if (q !== -1) s = s.slice(0, q)
        const h = s.indexOf('#')
        if (h !== -1) s = s.slice(0, h)
        return s.replace(/\/$/, '')
    } catch {
        return raw.trim().toLowerCase()
    }
}

/**
 * Pull stable join-booking keys from title + description + location (ICS + schedule import).
 * Same physical meeting often shares Meet / Zoom / Teams / Calendly even when titles differ
 * (e.g. "30 Minute Meeting with …" vs employer name "Prenuvo").
 */
function gatherCalendarMeetingUrlKeys(
    company: string,
    description: string,
    location: string
): Set<string> {
    const blob = `${company}\n${description}\n${location}`
    const keys = new Set<string>()
    const patterns: RegExp[] = [
        /https?:\/\/meet\.google\.com\/[a-z0-9-]+/gi,
        /https?:\/\/(?:[\w.-]+\.)?zoom\.us\/j\/\d+/gi,
        /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^?\s"'<>]+/gi,
        /https?:\/\/teams\.microsoft\.com\/meet\/\d+/gi,
        /https?:\/\/(?:www\.)?calendly\.com\/events\/[a-f0-9-]{8,}/gi,
    ]
    for (const re of patterns) {
        for (const m of blob.matchAll(re)) {
            const k = normalizeMeetingUrlKey(m[0] ?? '')
            if (k.length >= 14) keys.add(k)
        }
    }
    return keys
}

function calendarMeetingUrlKeysOverlap(a: Set<string>, b: Set<string>): boolean {
    for (const x of a) {
        if (b.has(x)) return true
    }
    return false
}

const GENERIC_SCHEDULE_COMPANY = new Set([
    'company',
    'interview',
    'meeting',
    'scheduled',
    'calendar',
    'unknown',
    'n/a',
    'remote',
])

/** True when a saved JSON calendar row and a schedule-import temp describe the same meeting. */
function calendarImportTempMatchesJsonEvent(
    jsonEv: CalendarTableEvent,
    temp: CalendarTableEvent
): boolean {
    if (calendarImportTitlesLikelySame(jsonEv.company, temp.company)) return true
    const employer = temp.company.trim().toLowerCase()
    if (
        employer.length >= 5 &&
        !GENERIC_SCHEDULE_COMPANY.has(employer)
    ) {
        const jsonText = `${jsonEv.company}\n${jsonEv.description}\n${jsonEv.location}`
            .toLowerCase()
        if (jsonText.includes(employer)) return true
    }
    const jKeys = gatherCalendarMeetingUrlKeys(
        jsonEv.company,
        jsonEv.description,
        jsonEv.location
    )
    const tKeys = gatherCalendarMeetingUrlKeys(
        temp.company,
        temp.description,
        temp.location
    )
    if (jKeys.size > 0 && tKeys.size > 0 && calendarMeetingUrlKeysOverlap(jKeys, tKeys)) {
        return true
    }
    const jsonBlob = `${jsonEv.company}\n${jsonEv.description}\n${jsonEv.location}`
        .toLowerCase()
    const tempBlob = `${temp.company}\n${temp.description}\n${temp.location}`
        .toLowerCase()
    const tLink = normalizeMeetingUrlKey(temp.location)
    if (tLink.startsWith('http') && tLink.length >= 14 && jsonBlob.includes(tLink)) {
        return true
    }
    const jLink = normalizeMeetingUrlKey(jsonEv.location)
    if (jLink.startsWith('http') && jLink.length >= 14 && tempBlob.includes(jLink)) {
        return true
    }
    return false
}

function timedRangesOverlap(
    aStart: moment.Moment,
    aEnd: moment.Moment,
    bStart: moment.Moment,
    bEnd: moment.Moment
): boolean {
    return aStart.isBefore(bEnd) && bStart.isBefore(aEnd)
}

type TimeGridEventBase = CalendarTableEvent & {
    dayIndex: number
    hourFloat: number
    durationMinutes: number
}

type TimeGridEventLaidOut = TimeGridEventBase & {
    overlapCol: number
    overlapSpan: number
}

/**
 * Side-by-side lanes for overlapping events in the week/day/4-day time grid (same
 * absolute top/height would otherwise stack and hide each other). Per-day column
 * packing: greedy lane assignment, then span = max(col+1) within each event's
 * overlap cluster so widths stay consistent with Google Calendar–style layouts.
 */
function assignTimeGridOverlapLayout(events: TimeGridEventBase[]): TimeGridEventLaidOut[] {
    type LastPlaced = { start: moment.Moment; end: moment.Moment }
    const byDay = new Map<number, TimeGridEventBase[]>()
    for (const ev of events) {
        const list = byDay.get(ev.dayIndex) ?? []
        list.push(ev)
        byDay.set(ev.dayIndex, list)
    }
    const idToCol = new Map<string, number>()
    const idToSpan = new Map<string, number>()

    for (const [, dayEvents] of byDay) {
        const sorted = [...dayEvents].sort((a, b) => {
            const t = a.startLocal.valueOf() - b.startLocal.valueOf()
            if (t !== 0) return t
            const u = a.endLocal.valueOf() - b.endLocal.valueOf()
            if (u !== 0) return u
            return a.id.localeCompare(b.id)
        })
        const columnLast: LastPlaced[] = []
        for (const ev of sorted) {
            let placed = false
            for (let i = 0; i < columnLast.length; i++) {
                const last = columnLast[i]!
                if (
                    !timedRangesOverlap(
                        last.start,
                        last.end,
                        ev.startLocal,
                        ev.endLocal
                    )
                ) {
                    idToCol.set(ev.id, i)
                    columnLast[i] = {
                        start: ev.startLocal.clone(),
                        end: ev.endLocal.clone(),
                    }
                    placed = true
                    break
                }
            }
            if (!placed) {
                const i = columnLast.length
                idToCol.set(ev.id, i)
                columnLast.push({
                    start: ev.startLocal.clone(),
                    end: ev.endLocal.clone(),
                })
            }
        }
        for (const ev of dayEvents) {
            const overlapping = dayEvents.filter((o) =>
                timedRangesOverlap(
                    ev.startLocal,
                    ev.endLocal,
                    o.startLocal,
                    o.endLocal
                )
            )
            let span = 1
            for (const o of overlapping) {
                span = Math.max(span, (idToCol.get(o.id) ?? 0) + 1)
            }
            idToSpan.set(ev.id, span)
        }
    }

    return events.map((ev) => ({
        ...ev,
        overlapCol: idToCol.get(ev.id) ?? 0,
        overlapSpan: Math.max(1, idToSpan.get(ev.id) ?? 1),
    }))
}

/** Hide schedule-import row when the same slot already exists from saved Google JSON. */
function shouldHideRedundantCalendarImportTemp(
    temp: CalendarTableEvent,
    jsonEvents: CalendarTableEvent[]
): boolean {
    if (temp.source !== 'temporary') return false
    const alignMs = 5 * 60 * 1000
    return jsonEvents.some(
        (j) =>
            j.source === 'json' &&
            j.profileName === temp.profileName &&
            Math.abs(j.startLocal.valueOf() - temp.startLocal.valueOf()) <= alignMs &&
            timedRangesOverlap(j.startLocal, j.endLocal, temp.startLocal, temp.endLocal) &&
            calendarImportTempMatchesJsonEvent(j, temp)
    )
}

/** Google-style month/year: timed vs all-day (no explicit flag in our model). */
const isLikelyAllDayEvent = (ev: CalendarTableEvent): boolean => {
    const s = ev.startLocal
    const e = ev.endLocal
    if (s.hour() !== 0 || s.minute() !== 0 || s.second() !== 0) return false
    if (e.isSame(s)) return false
    if (e.hour() === 0 && e.minute() === 0 && e.second() === 0 && e.isAfter(s)) {
        return true
    }
    if (s.isSame(e, 'day') && e.hour() === 23 && e.minute() >= 59) return true
    if (e.diff(s, 'hours') >= 23.5) return true
    return false
}

const formatTimeShortLower = (m: moment.Moment): string =>
    m.format('h:mma').replace('AM', 'am').replace('PM', 'pm')

const eventOverlapsRange = (
    ev: CalendarTableEvent,
    rangeStart: moment.Moment,
    rangeEnd: moment.Moment
): boolean =>
    ev.startLocal.isSameOrBefore(rangeEnd) && ev.endLocal.isSameOrAfter(rangeStart)

const dayKeysForEventPlacement = (ev: CalendarTableEvent): string[] => {
    const allDay = isLikelyAllDayEvent(ev)
    const start = ev.startLocal.clone().startOf('day')
    if (!allDay) {
        return [start.format('YYYY-MM-DD')]
    }
    let end = ev.endLocal.clone()
    if (
        end.hour() === 0 &&
        end.minute() === 0 &&
        end.second() === 0 &&
        end.isAfter(ev.startLocal)
    ) {
        end = end.clone().subtract(1, 'millisecond')
    }
    const endDay = end.clone().startOf('day')
    const keys: string[] = []
    const d = start.clone()
    while (d.isSameOrBefore(endDay, 'day')) {
        keys.push(d.format('YYYY-MM-DD'))
        d.add(1, 'day')
    }
    return keys
}

const buildEventsByDayKey = (
    events: CalendarTableEvent[],
    rangeStart: moment.Moment,
    rangeEnd: moment.Moment
): Map<string, CalendarTableEvent[]> => {
    const map = new Map<string, CalendarTableEvent[]>()
    for (const ev of events) {
        if (!eventOverlapsRange(ev, rangeStart, rangeEnd)) continue
        for (const key of dayKeysForEventPlacement(ev)) {
            const day = moment(key, 'YYYY-MM-DD', true)
            if (!day.isValid()) continue
            if (day.isBefore(rangeStart, 'day') || day.isAfter(rangeEnd, 'day')) continue
            const list = map.get(key) ?? []
            list.push(ev)
            map.set(key, list)
        }
    }
    for (const [k, list] of map) {
        list.sort((a, b) => {
            const ad = isLikelyAllDayEvent(a) ? 0 : 1
            const bd = isLikelyAllDayEvent(b) ? 0 : 1
            if (ad !== bd) return ad - bd
            return a.startLocal.valueOf() - b.startLocal.valueOf()
        })
        map.set(k, list)
    }
    return map
}

const MONTH_WEEK_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const YEAR_WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const MONTH_CELL_MAX_EVENTS = 4

const HEADER_HEIGHT_PX = 52
const ROW_HEIGHT_PX = 52
const TIME_GUTTER_PX = 74

/** Current-time indicator on day / week / 4-day grids (Google Calendar red). */
const TIME_GRID_NOW_LINE_COLOR = '#ea4335'

/** Distinct hues for calendar events — indexed by profile id order (stable per profile). */
const EVENT_COLORS = [
    '#4f46e5',
    '#2563eb',
    '#0891b2',
    '#059669',
    '#16a34a',
    '#ca8a04',
    '#ea580c',
    '#dc2626',
    '#db2777',
    '#9333ea',
    '#7c3aed',
    '#0d9488',
    '#4d7c0f',
    '#b45309',
    '#be123c',
    '#7e22ce',
    '#0369a1',
    '#15803d',
    '#a16207',
    '#c2410c',
]

const formatHourLabel = (hour24: number): string => {
    if (hour24 === 0) return '12 AM'
    if (hour24 === 12) return '12 PM'
    return hour24 > 12 ? `${hour24 - 12} PM` : `${hour24} AM`
}

const pickEventColor = (profileName: string): string => {
    const key = profileName.trim().toLowerCase()
    if (key === '') return EVENT_COLORS[0]
    let hash = 0
    for (let i = 0; i < key.length; i += 1) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0
    }
    return EVENT_COLORS[hash % EVENT_COLORS.length]
}

function buildStableProfileColorMap(profileIds: number[]): Map<number, string> {
    const sorted = [...new Set(profileIds)].sort((a, b) => a - b)
    const m = new Map<number, string>()
    sorted.forEach((id, i) => {
        m.set(id, EVENT_COLORS[i % EVENT_COLORS.length])
    })
    return m
}

/**
 * Class bundles for the Google Calendar view (day / week / month / year / schedule / 4-day grid).
 * Follows the same `useThemeMode` + `documentElement` `.dark-theme` approach as the rest of the app.
 */
function googleCalendarChrome(isDark: boolean) {
    if (isDark) {
        return {
            rangeLabel: 'text-slate-400',
            toolbar: 'border-b border-slate-800/50',
            monthShell:
                'overflow-hidden rounded-md border border-slate-600 bg-[#131314] text-slate-200',
            monthWeekHeadRow: 'grid grid-cols-7 border-b border-slate-600',
            monthGrid:
                'grid grid-cols-7 border-l border-slate-600 [grid-auto-rows:minmax(108px,auto)]',
            monthCell:
                'flex min-h-[108px] flex-col border-b border-r border-slate-600 p-1 [&:nth-child(7n)]:border-r-0',
            monthDateBtnBase:
                'flex min-h-[28px] min-w-[28px] max-w-full shrink-0 items-center justify-center rounded px-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80',
            monthDateBtnHover: 'hover:bg-slate-700/70',
            monthDateIn: 'text-slate-300',
            monthDateMuted: 'text-slate-600',
            monthEventTimed:
                'min-w-0 truncate text-[11px] leading-tight text-slate-100',
            monthMore: 'pl-2.5 text-[10px] text-slate-500',
            yearGridWrap:
                'grid grid-cols-2 gap-4 px-3 pb-4 pt-2 sm:grid-cols-3 lg:grid-cols-4',
            yearCard:
                'min-w-0 rounded-md border border-slate-600 bg-[#131314] p-2 text-slate-200',
            yearTitle: 'mb-1 text-sm font-medium text-white',
            yearLettersRow:
                'mb-1 grid grid-cols-7 text-center text-[10px] text-slate-500',
            yearDaysGrid: 'grid grid-cols-7 gap-y-0.5 text-center text-[11px]',
            yearDayBtnBase:
                'mx-auto flex h-6 min-w-[26px] max-w-full items-center justify-center rounded px-0.5 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80',
            yearDayBtnHover: 'hover:bg-slate-700/70',
            yearDayIn: 'text-slate-100',
            yearDayMuted: 'text-slate-600',
            timeScroll: 'overflow-x-auto pb-3 pt-2',
            timeGridWrap:
                'relative mx-3 min-w-[980px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-slate-200',
            timeCorner:
                'border-b border-r border-slate-700 bg-slate-900 px-2 py-3 text-xs text-slate-400',
            timeColHead:
                'border-b border-r border-slate-700 bg-slate-900 px-2 py-2 text-center',
            timeColHeadSub: 'text-xs text-slate-400',
            timeColHeadMain: 'text-sm font-semibold text-slate-100',
            timeGutter:
                'border-b border-r border-slate-800 px-2 py-1 text-[11px] text-slate-500',
            timeSlotCell: 'border-b border-r border-slate-800',
            weekHeadCell:
                'py-2 text-center text-[11px] font-medium tracking-wide text-slate-500',
            sidebarAside:
                'flex w-full shrink-0 flex-col border-b border-slate-700 bg-[#1c1c1c] md:w-[272px] md:border-b-0 md:border-r',
            sidebarSectionTitle:
                'text-[11px] font-semibold uppercase tracking-wide text-slate-400',
        }
    }
    return {
        rangeLabel: 'text-slate-600',
        toolbar: 'border-b border-slate-200',
        monthShell:
            'overflow-hidden rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm',
        monthWeekHeadRow: 'grid grid-cols-7 border-b border-slate-200',
        monthGrid:
            'grid grid-cols-7 border-l border-slate-200 [grid-auto-rows:minmax(108px,auto)]',
        monthCell:
            'flex min-h-[108px] flex-col border-b border-r border-slate-200 p-1 [&:nth-child(7n)]:border-r-0',
        monthDateBtnBase:
            'flex min-h-[28px] min-w-[28px] max-w-full shrink-0 items-center justify-center rounded px-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
        monthDateBtnHover: 'hover:bg-slate-200/90',
        monthDateIn: 'text-slate-800',
        monthDateMuted: 'text-slate-400',
        monthEventTimed:
            'min-w-0 truncate text-[11px] leading-tight text-slate-700',
        monthMore: 'pl-2.5 text-[10px] text-slate-500',
        yearGridWrap:
            'grid grid-cols-2 gap-4 px-3 pb-4 pt-2 sm:grid-cols-3 lg:grid-cols-4',
        yearCard:
            'min-w-0 rounded-md border border-slate-200 bg-white p-2 text-slate-800 shadow-sm',
        yearTitle: 'mb-1 text-sm font-medium text-slate-900',
        yearLettersRow:
            'mb-1 grid grid-cols-7 text-center text-[10px] text-slate-500',
        yearDaysGrid: 'grid grid-cols-7 gap-y-0.5 text-center text-[11px]',
        yearDayBtnBase:
            'mx-auto flex h-6 min-w-[26px] max-w-full items-center justify-center rounded px-0.5 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
        yearDayBtnHover: 'hover:bg-slate-200/90',
        yearDayIn: 'text-slate-900',
        yearDayMuted: 'text-slate-400',
        timeScroll: 'overflow-x-auto pb-3 pt-2',
        timeGridWrap:
            'relative mx-3 min-w-[980px] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-800',
        timeCorner:
            'border-b border-r border-slate-200 bg-slate-50 px-2 py-3 text-xs text-slate-500',
        timeColHead:
            'border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center',
        timeColHeadSub: 'text-xs text-slate-500',
        timeColHeadMain: 'text-sm font-semibold text-slate-900',
        timeGutter:
            'border-b border-r border-slate-200 px-2 py-1 text-[11px] text-slate-500',
        timeSlotCell: 'border-b border-r border-slate-100',
        weekHeadCell:
            'py-2 text-center text-[11px] font-medium tracking-wide text-slate-500',
        sidebarAside:
            'flex w-full shrink-0 flex-col border-b border-slate-200 bg-[#f6f8fc] md:w-[272px] md:border-b-0 md:border-r',
        sidebarSectionTitle:
            'text-[11px] font-semibold uppercase tracking-wide text-slate-500',
    }
}

const parseCalendarMoment = (value: string): moment.Moment | null => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const candidates = [
        moment.parseZone(trimmed, moment.ISO_8601, true),
        moment.parseZone(trimmed, 'YYYYMMDDTHHmmss[Z]', true),
        moment.parseZone(trimmed, 'YYYYMMDDTHHmmss', true),
        moment.parseZone(trimmed, 'YYYYMMDD', true),
        moment.parseZone(trimmed),
    ]
    const found = candidates.find((m) => m.isValid())
    return found ?? null
}

/** Same instant shown in `tz` (reliable for Etc/UTC vs `.clone().tz()` quirks). */
function toWallClockInTz(m: moment.Moment, tz: string): moment.Moment {
    return moment.tz(m.valueOf(), tz)
}

/** ISO / Z → absolute instant; else wall time in `storedTz`. */
function parseMeetingInstant(
    meetingTime: string,
    storedTz: string
): moment.Moment | null {
    const t = meetingTime.trim()
    if (t === '') return null
    const tz = storedTz?.trim() || 'America/Los_Angeles'
    const zoned = moment.parseZone(t)
    if (zoned.isValid()) return zoned
    const strictIso = moment.tz(t, moment.ISO_8601, true, tz)
    if (strictIso.isValid()) return strictIso
    const loose = moment.tz(t, tz)
    return loose.isValid() ? loose : null
}

type CalendarJsonRawRow = {
    profileId: number
    profileName: string
    ev: ProfileCalendarEvent
    idx: number
}

const Calendar = (): JSX.Element => {
    const { message } = App.useApp()
    const { isDark } = useThemeMode()
    const { options: profileUserOptions, isKnownIndex } = useProfileUsers()
    const [profiles, setProfiles] = useState<TProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<ViewMode>('table')
    const [calendarMode, setCalendarMode] = useState<CalendarDisplayMode>('week')
    const [anchorDate, setAnchorDate] = useState<moment.Moment>(() =>
        moment.tz(new Date(), DEFAULT_CALENDAR_DISPLAY_TZ)
    )
    const [calendarDisplayTimezone, setCalendarDisplayTimezone] = useState(
        DEFAULT_CALENDAR_DISPLAY_TZ
    )
    const [includedProfileIds, setIncludedProfileIds] = useState<number[]>([])
    const [googleCalProfileUserSlot, setGoogleCalProfileUserSlot] =
        useState<GoogleCalProfileUserSlot>('all')
    const [searchKeyword, setSearchKeyword] = useState('')
    const [selectedEvent, setSelectedEvent] = useState<CalendarTableEvent | null>(
        null
    )
    const [bulkCalendarSyncing, setBulkCalendarSyncing] = useState(false)
    const [fetchProgress, setFetchProgress] =
        useState<FetchCalendarProgressSnapshot>(CLOSED_FETCH_PROGRESS)
    const [clearCalendarBusy, setClearCalendarBusy] = useState(false)
    /** Bumped after Clear Calendar so Schedule Table reloads if that tab is visible. */
    const [scheduleImportsReloadSignal, setScheduleImportsReloadSignal] =
        useState(0)
    const [calendarHistories, setCalendarHistories] = useState<THistory[]>([])
    const [calendarJsonRawEvents, setCalendarJsonRawEvents] = useState<
        CalendarJsonRawRow[]
    >([])
    const [calendarLoading, setCalendarLoading] = useState(false)
    const calendarLoadGenRef = useRef(0)
    /** Advances once per minute so “today” and the time-grid now line stay current. */
    const [calendarClockMs, setCalendarClockMs] = useState(() => Date.now())

    useEffect(() => {
        const bump = () => setCalendarClockMs(Date.now())
        bump()
        let intervalId: number | undefined
        const msToNextMinute = 60000 - (Date.now() % 60000)
        const timeoutId = window.setTimeout(() => {
            bump()
            intervalId = window.setInterval(bump, 60_000)
        }, msToNextMinute)
        return () => {
            window.clearTimeout(timeoutId)
            if (intervalId !== undefined) window.clearInterval(intervalId)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await listProfiles()
                if (!cancelled) {
                    setProfiles(Array.isArray(data) ? data : [])
                }
            } catch {
                if (!cancelled) setProfiles([])
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const rowsWithCalendarUrl = useMemo(
        () => profiles.filter(hasCalendarUrl),
        [profiles]
    )

    const loadCalendarTable = useCallback(async () => {
        const gen = ++calendarLoadGenRef.current
        setCalendarLoading(true)
        try {
            const [historyResult, jsonRawRows] = await Promise.all([
                listHistory({
                    schedule: true,
                    calendarImport: true,
                    current: 1,
                    pageSize: 500,
                }),
                (async (): Promise<CalendarJsonRawRow[]> => {
                    const targets = rowsWithCalendarUrl
                        .filter((p) => p.id != null)
                        .map((p) => ({ id: p.id as number, name: p.name }))
                    const reads = await Promise.allSettled(
                        targets.map(async (target) => {
                            const out = await getCalendarEventsForProfile(target.id)
                            const events = Array.isArray(out.events) ? out.events : []
                            return events.map((ev, idx) => ({
                                ev,
                                idx,
                                profileId: target.id,
                                profileName: target.name,
                            }))
                        })
                    )
                    const merged: CalendarJsonRawRow[] = []
                    reads.forEach((result) => {
                        if (result.status !== 'fulfilled') return
                        result.value.forEach(
                            ({ ev, idx, profileId, profileName }) => {
                                merged.push({
                                    profileId,
                                    profileName,
                                    ev,
                                    idx,
                                })
                            }
                        )
                    })
                    return merged
                })(),
            ])
            if (gen !== calendarLoadGenRef.current) return
            const { rows } = historyResult
            setCalendarHistories(Array.isArray(rows) ? rows : [])
            setCalendarJsonRawEvents(jsonRawRows)
        } catch {
            if (gen !== calendarLoadGenRef.current) return
            setCalendarHistories([])
            setCalendarJsonRawEvents([])
            message.error('Could not load calendar table')
        } finally {
            if (gen === calendarLoadGenRef.current) setCalendarLoading(false)
        }
    }, [message, rowsWithCalendarUrl])

    useEffect(() => {
        void loadCalendarTable()
    }, [loadCalendarTable])

    const profileJsonEvents = useMemo((): CalendarTableEvent[] => {
        const merged: CalendarTableEvent[] = []
        const seenJsonUidSlot = new Set<string>()
        const tz = calendarDisplayTimezone
        for (const { profileId, profileName, ev, idx } of calendarJsonRawEvents) {
            const rawUid = typeof ev.uid === 'string' ? ev.uid.trim() : ''
            if (rawUid !== '') {
                const dedupeKey = `${profileId}\0${rawUid}\0${String(ev.dtstart ?? '')}\0${String(ev.dtend ?? '')}`
                if (seenJsonUidSlot.has(dedupeKey)) continue
                seenJsonUidSlot.add(dedupeKey)
            }
            const start = parseCalendarMoment(ev.dtstart || '')
            if (!start?.isValid()) continue
            const ms = start.valueOf()
            if (Number.isNaN(ms)) continue
            const startLocal = toWallClockInTz(moment.utc(ms), tz)
            const endParsed = parseCalendarMoment(ev.dtend || '')
            let endLocal: moment.Moment
            if (endParsed?.isValid()) {
                const em = endParsed.valueOf()
                endLocal = Number.isNaN(em)
                    ? startLocal.clone().add(DEFAULT_EVENT_DURATION_MIN, 'minute')
                    : toWallClockInTz(moment.utc(em), tz)
            } else {
                endLocal = startLocal.clone().add(DEFAULT_EVENT_DURATION_MIN, 'minute')
            }
            const uidKey =
                typeof ev.uid === 'string' && ev.uid.trim() !== ''
                    ? ev.uid.trim().replace(/[^a-zA-Z0-9@._-]+/g, '_')
                    : `i${idx}`
            merged.push({
                id: `json-${profileId}-${uidKey}-${idx}`,
                source: 'json',
                profileName,
                company: ev.summary?.trim() || 'Calendar Event',
                position: ev.status?.trim() || 'Scheduled',
                description: htmlToPlainTextForDisplay(ev.description),
                location: ev.location?.trim() || '',
                timezone: tz,
                rawStart: ev.dtstart || '',
                rawEnd: ev.dtend || '',
                startLocal,
                endLocal,
            })
        }
        return merged
    }, [calendarDisplayTimezone, calendarJsonRawEvents])

    const fetchCalendarForProfile = useCallback(
        async (
            record: TProfile,
            options?: { refreshProfileRow?: boolean }
        ): Promise<
            | {
                  ok: true
                  eventCount?: number
                  relativePath?: string
                  scheduleRowsWritten?: number
                  scheduleImportError?: string
              }
            | { ok: false; error: string }
        > => {
            if (record.id == null) {
                return { ok: false, error: 'Could not fetch calendar data' }
            }
            const refreshProfileRow = options?.refreshProfileRow !== false
            try {
                const out = await fetchGoogleCalendarForProfile(record.id)
                if (out.ok) {
                    if (refreshProfileRow) {
                        try {
                            const fresh = await getProfile(record.id)
                            setProfiles((prev) =>
                                prev.map((p) =>
                                    p.id === record.id ? { ...p, ...fresh } : p
                                )
                            )
                        } catch {
                            /* list row still valid */
                        }
                    }
                    return {
                        ok: true,
                        eventCount: out.eventCount,
                        relativePath: out.relativePath,
                        scheduleRowsWritten: out.scheduleRowsWritten,
                        scheduleImportError: out.scheduleImportError,
                    }
                }
                return {
                    ok: false,
                    error: out.error || 'Could not fetch calendar data',
                }
            } catch (e: unknown) {
                if (axios.isAxiosError(e)) {
                    const d = e.response?.data as { error?: string } | undefined
                    return {
                        ok: false,
                        error:
                            d?.error ||
                            e.message ||
                            'Could not fetch calendar data',
                    }
                }
                return { ok: false, error: 'Could not fetch calendar data' }
            }
        },
        []
    )

    const handleFetchAllCalendarJson = useCallback(async () => {
        const targets = rowsWithCalendarUrl
        if (targets.length === 0) {
            message.info('No profiles with a calendar URL.')
            return
        }

        const initialProfiles = targets
            .filter((p) => p.id != null)
            .map((p) => ({
                id: p.id as number,
                name: p.name?.trim() || 'Profile',
                status: 'pending' as const,
            }))

        setFetchProgress({
            open: true,
            phase: 'fetching',
            profiles: initialProfiles,
            totals: {
                success: 0,
                failed: 0,
                warnings: 0,
                events: 0,
                scheduleRows: 0,
            },
        })
        setBulkCalendarSyncing(true)

        const totals = {
            success: 0,
            failed: 0,
            warnings: 0,
            events: 0,
            scheduleRows: 0,
        }

        try {
            for (const record of targets) {
                if (record.id == null) continue

                setFetchProgress((prev) => ({
                    ...prev,
                    profiles: prev.profiles.map((row) =>
                        row.id === record.id
                            ? { ...row, status: 'active', detail: undefined }
                            : row
                    ),
                }))

                const fr = await fetchCalendarForProfile(record, {
                    refreshProfileRow: false,
                })

                if (fr.ok) {
                    totals.success += 1
                    if (typeof fr.eventCount === 'number') {
                        totals.events += fr.eventCount
                    }
                    if (typeof fr.scheduleRowsWritten === 'number') {
                        totals.scheduleRows += fr.scheduleRowsWritten
                    }

                    const evPart =
                        typeof fr.eventCount === 'number' && fr.eventCount > 0
                            ? `${fr.eventCount} events`
                            : 'Saved'
                    const schedPart =
                        typeof fr.scheduleRowsWritten === 'number' &&
                        fr.scheduleRowsWritten > 0
                            ? ` · ${fr.scheduleRowsWritten} schedule rows`
                            : ''

                    if (fr.scheduleImportError) {
                        totals.warnings += 1
                        setFetchProgress((prev) => ({
                            ...prev,
                            totals: { ...totals },
                            profiles: prev.profiles.map((row) =>
                                row.id === record.id
                                    ? {
                                          ...row,
                                          status: 'warning',
                                          detail: fr.scheduleImportError,
                                      }
                                    : row
                            ),
                        }))
                    } else {
                        setFetchProgress((prev) => ({
                            ...prev,
                            totals: { ...totals },
                            profiles: prev.profiles.map((row) =>
                                row.id === record.id
                                    ? {
                                          ...row,
                                          status: 'success',
                                          detail: `${evPart}${schedPart}`,
                                      }
                                    : row
                            ),
                        }))
                    }
                } else {
                    totals.failed += 1
                    setFetchProgress((prev) => ({
                        ...prev,
                        totals: { ...totals },
                        profiles: prev.profiles.map((row) =>
                            row.id === record.id
                                ? {
                                      ...row,
                                      status: 'error',
                                      detail:
                                          fr.error ?? 'Could not fetch calendar data',
                                  }
                                : row
                        ),
                    }))
                }
            }

            setFetchProgress((prev) => ({
                ...prev,
                phase: 'refreshing',
                totals: { ...totals },
            }))

            try {
                const data = await listProfiles()
                setProfiles(Array.isArray(data) ? data : [])
            } catch {
                /* keep existing profile rows */
            }

            setScheduleImportsReloadSignal((s) => s + 1)
            await loadCalendarTable()

            setFetchProgress((prev) => ({
                ...prev,
                phase: 'complete',
                totals: { ...totals },
            }))
        } catch {
            message.error('Calendar fetch failed unexpectedly.')
            setFetchProgress(CLOSED_FETCH_PROGRESS)
        } finally {
            setBulkCalendarSyncing(false)
        }
    }, [fetchCalendarForProfile, loadCalendarTable, message, rowsWithCalendarUrl])

    const closeFetchProgressModal = useCallback(() => {
        setFetchProgress(CLOSED_FETCH_PROGRESS)
    }, [])

    const handleClearCalendar = useCallback(() => {
        const targets = rowsWithCalendarUrl
        if (targets.length === 0) {
            message.info('No profiles with a calendar URL.')
            return
        }
        Modal.confirm({
            title: 'Clear calendar data?',
            content: `Remove saved calendar JSON files and calendar-import schedule rows for ${targets.length} profile(s) that have a calendar URL. This cannot be undone.`,
            okText: 'Clear',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                setClearCalendarBusy(true)
                try {
                    let filesRemoved = 0
                    let historiesRemoved = 0
                    let errorCount = 0
                    for (const record of targets) {
                        if (record.id == null) continue
                        try {
                            const out = await clearCalendarForProfile(record.id)
                            if (out.ok) {
                                if (out.fileRemoved) filesRemoved += 1
                                if (typeof out.removedHistories === 'number') {
                                    historiesRemoved += out.removedHistories
                                }
                            } else {
                                errorCount += 1
                                message.error(
                                    `${record.name ?? 'Profile'}: ${out.error ?? 'Clear failed'}`
                                )
                            }
                        } catch (e: unknown) {
                            errorCount += 1
                            const errMsg =
                                axios.isAxiosError(e)
                                    ? (e.response?.data as { error?: string } | undefined)
                                          ?.error ||
                                      e.message ||
                                      'Clear failed'
                                    : 'Clear failed'
                            message.error(
                                `${record.name ?? 'Profile'}: ${errMsg}`
                            )
                        }
                    }
                    if (errorCount === 0) {
                        message.success(
                            `Cleared calendar data (${filesRemoved} JSON file(s) removed, ${historiesRemoved} schedule row(s) removed).`
                        )
                    } else if (errorCount < targets.length) {
                        message.warning(
                            `Some profiles could not be cleared (${errorCount} error(s)).`
                        )
                    } else if (targets.length > 0) {
                        message.error('Could not clear calendar data.')
                    }
                    setScheduleImportsReloadSignal((s) => s + 1)
                    void loadCalendarTable()
                } finally {
                    setClearCalendarBusy(false)
                }
            },
        })
    }, [loadCalendarTable, message, rowsWithCalendarUrl])

    const weekStart = useMemo(() => {
        const a = anchorDate.clone().tz(calendarDisplayTimezone)
        if (calendarMode === 'day') return a.clone().startOf('day')
        if (calendarMode === '4days') return a.clone().startOf('day')
        return a.clone().startOf('week')
    }, [anchorDate, calendarDisplayTimezone, calendarMode])
    const dayCount = useMemo(() => {
        if (calendarMode === 'day') return 1
        if (calendarMode === '4days') return 4
        return 7
    }, [calendarMode])
    const weekDays = useMemo(
        () =>
            Array.from({ length: dayCount }, (_, i) => {
                const d = weekStart.clone().add(i, 'day')
                return {
                    key: d.format('YYYY-MM-DD'),
                    shortLabel: d.format('ddd'),
                    dateLabel: d.format('MMM D'),
                }
            }),
        [dayCount, weekStart]
    )
    const hourSlots = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

    const temporaryEvents = useMemo<CalendarTableEvent[]>(() => {
        return calendarHistories
            .filter((h): h is THistory & { id: number } => h.id != null)
            .map((h) => {
                const latest = getLatestStatusStage(h)
                const map = parseScheduleMeetingsFromApi(h.scheduleMeetingsByStatus)
                const entry = latest ? map[latest] : undefined
                if (!entry?.meetingTime) return null
                const timezone = entry.timezone || 'America/Los_Angeles'
                const start = parseMeetingInstant(entry.meetingTime, timezone)
                if (!start?.isValid()) return null
                const startLocal = toWallClockInTz(
                    start,
                    calendarDisplayTimezone
                )
                if (!startLocal.isValid()) return null
                return {
                    id: `tmp-${h.id}`,
                    source: 'temporary',
                    profileName: h.profile?.name ?? 'User',
                    company: h.company ?? 'Company',
                    position: h.position ?? 'Interview',
                    description: htmlToPlainTextForDisplay(h.requirements),
                    location: entry.meetingLink ?? '',
                    timezone,
                    rawStart: entry.meetingTime,
                    rawEnd: '',
                    startLocal,
                    endLocal: startLocal.clone().add(DEFAULT_EVENT_DURATION_MIN, 'minute'),
                }
            })
            .filter((event): event is CalendarTableEvent => event != null)
    }, [calendarDisplayTimezone, calendarHistories])

    const calendarImportTempsDeduped = useMemo(
        () =>
            temporaryEvents.filter(
                (t) => !shouldHideRedundantCalendarImportTemp(t, profileJsonEvents)
            ),
        [temporaryEvents, profileJsonEvents]
    )

    /** Fall back to “all” when the selected profile user is deleted. */
    useEffect(() => {
        if (googleCalProfileUserSlot === 'all') return
        if (profileUserOptions.length === 0) return
        if (!isKnownIndex(googleCalProfileUserSlot)) {
            setGoogleCalProfileUserSlot('all')
        }
    }, [googleCalProfileUserSlot, profileUserOptions, isKnownIndex])

    const filteredProfilesForGoogleCal = useMemo(() => {
        if (googleCalProfileUserSlot === 'all') return rowsWithCalendarUrl
        return rowsWithCalendarUrl.filter(
            (p) => p.profileUserIndex === googleCalProfileUserSlot
        )
    }, [googleCalProfileUserSlot, rowsWithCalendarUrl])

    const filteredProfileIdsKey = useMemo(
        () =>
            filteredProfilesForGoogleCal
                .map((p) => p.id)
                .filter((id): id is number => id != null)
                .sort((a, b) => a - b)
                .join(','),
        [filteredProfilesForGoogleCal]
    )

    useEffect(() => {
        const ids = filteredProfilesForGoogleCal
            .map((p) => p.id)
            .filter((id): id is number => id != null)
        setIncludedProfileIds(ids)
    }, [filteredProfileIdsKey, filteredProfilesForGoogleCal])

    const profileIdByName = useMemo(() => {
        const m = new Map<string, number>()
        for (const p of profiles) {
            const n = p.name != null ? String(p.name).trim() : ''
            if (p.id != null && n !== '' && !m.has(n)) {
                m.set(n, p.id)
            }
        }
        return m
    }, [profiles])

    const profileColorById = useMemo(
        () =>
            buildStableProfileColorMap(
                rowsWithCalendarUrl
                    .map((p) => p.id)
                    .filter((id): id is number => id != null)
            ),
        [rowsWithCalendarUrl]
    )

    const eventProfileColor = useCallback(
        (e: CalendarTableEvent) => {
            const id = profileIdByName.get(e.profileName.trim())
            if (id != null) {
                const c = profileColorById.get(id)
                if (c) return c
            }
            return pickEventColor(e.profileName)
        },
        [profileColorById, profileIdByName]
    )

    const profileSlotByName = useMemo(() => {
        const m = new Map<string, number | null>()
        for (const p of profiles) {
            m.set(p.name, normalizeProfileUserIndex(p.profileUserIndex))
        }
        return m
    }, [profiles])

    /** Slot + search only (shared by main list + sidebar counts; checkboxes applied later). */
    const eventsFilteredBySlotAndSearch = useMemo(() => {
        const merged = [...profileJsonEvents, ...calendarImportTempsDeduped]
        const keyword = searchKeyword.trim().toLowerCase()
        return merged
            .filter((e) => {
                if (googleCalProfileUserSlot === 'all') return true
                const slot = profileSlotByName.get(e.profileName) ?? null
                return slot === googleCalProfileUserSlot
            })
            .filter((e) => {
                if (keyword === '') return true
                return (
                    e.profileName.toLowerCase().includes(keyword) ||
                    e.company.toLowerCase().includes(keyword) ||
                    e.position.toLowerCase().includes(keyword) ||
                    e.description.toLowerCase().includes(keyword)
                )
            })
    }, [
        calendarImportTempsDeduped,
        googleCalProfileUserSlot,
        profileJsonEvents,
        profileSlotByName,
        searchKeyword,
    ])

    /**
     * Same filters as toolbar selects + search: profile-user slot, search text, current
     * calendar view range (day/week/4-day/month/year), and display timezone via event times.
     * Excludes “show profiles” checkboxes so each row still shows a match count.
     */
    const eventsMatchingSidebarFilters = useMemo(() => {
        const list = eventsFilteredBySlotAndSearch
        const tz = calendarDisplayTimezone
        if (calendarMode === 'schedule') return list
        if (
            calendarMode === 'day' ||
            calendarMode === 'week' ||
            calendarMode === '4days'
        ) {
            const rangeStart = weekStart.clone().startOf('day')
            const rangeEnd = weekStart
                .clone()
                .add(Math.max(dayCount - 1, 0), 'day')
                .endOf('day')
            return list.filter((e) =>
                eventOverlapsRange(e, rangeStart, rangeEnd)
            )
        }
        if (calendarMode === 'month') {
            const anchorMonth = anchorDate.clone().tz(tz).startOf('month')
            const gridStart = anchorMonth
                .clone()
                .subtract(anchorMonth.day(), 'days')
                .startOf('day')
            const rangeEnd = gridStart.clone().add(41, 'days').endOf('day')
            return list.filter((e) =>
                eventOverlapsRange(e, gridStart, rangeEnd)
            )
        }
        if (calendarMode === 'year') {
            const y = anchorDate.clone().tz(tz).year()
            const rangeStart = moment
                .tz(`${y}-01-01`, 'YYYY-MM-DD', tz)
                .startOf('day')
            const rangeEnd = moment
                .tz(`${y}-12-31`, 'YYYY-MM-DD', tz)
                .endOf('day')
            return list.filter((e) =>
                eventOverlapsRange(e, rangeStart, rangeEnd)
            )
        }
        return list
    }, [
        anchorDate,
        calendarDisplayTimezone,
        calendarMode,
        dayCount,
        eventsFilteredBySlotAndSearch,
        weekStart,
    ])

    const sidebarScheduleCountByProfileId = useMemo(() => {
        const map = new Map<number, number>()
        for (const e of eventsMatchingSidebarFilters) {
            const pid = profileIdByName.get(e.profileName.trim())
            if (pid != null) {
                map.set(pid, (map.get(pid) ?? 0) + 1)
            }
        }
        return map
    }, [eventsMatchingSidebarFilters, profileIdByName])

    const includedProfileIdSet = useMemo(
        () => new Set(includedProfileIds),
        [includedProfileIds]
    )

    const allEvents = useMemo(() => {
        const allowedIds = includedProfileIdSet
        return eventsFilteredBySlotAndSearch
            .filter((e) => {
                const pid = profileIdByName.get(e.profileName.trim())
                if (pid == null) return false
                return allowedIds.has(pid)
            })
            .sort((a, b) => a.startLocal.valueOf() - b.startLocal.valueOf())
    }, [
        eventsFilteredBySlotAndSearch,
        includedProfileIdSet,
        profileIdByName,
    ])

    const eventsInGrid = useMemo(() => {
        const base = allEvents
            .map((event) => {
                const dayIndex = event.startLocal.diff(weekStart, 'day')
                if (dayIndex < 0 || dayIndex > dayCount - 1) return null
                const hourFloat =
                    event.startLocal.hour() + event.startLocal.minute() / 60
                const durationMinutes = Math.max(
                    30,
                    event.endLocal.diff(event.startLocal, 'minute')
                )
                return {
                    ...event,
                    dayIndex,
                    hourFloat,
                    durationMinutes,
                }
            })
            .filter(
                (
                    event
                ): event is TimeGridEventBase => event != null
            )
        return assignTimeGridOverlapLayout(base)
    }, [allEvents, dayCount, weekStart])

    const rangeLabel = useMemo(() => {
        const a = anchorDate.clone().tz(calendarDisplayTimezone)
        if (calendarMode === 'month') return a.format('MMMM YYYY')
        if (calendarMode === 'year') return a.format('YYYY')
        if (calendarMode === 'schedule') return a.format('MMM YYYY')
        if (dayCount === 1) return weekStart.format('MMM D, YYYY')
        return `${weekStart.format('MMM D')} - ${weekStart
            .clone()
            .add(dayCount - 1, 'day')
            .format('MMM D, YYYY')}`
    }, [anchorDate, calendarDisplayTimezone, calendarMode, dayCount, weekStart])

    const handleStepDate = useCallback(
        (direction: -1 | 1) => {
            if (calendarMode === 'day') {
                setAnchorDate((prev) => prev.clone().add(direction, 'day'))
                return
            }
            if (calendarMode === '4days') {
                setAnchorDate((prev) => prev.clone().add(direction * 4, 'day'))
                return
            }
            if (calendarMode === 'week') {
                setAnchorDate((prev) => prev.clone().add(direction, 'week'))
                return
            }
            if (calendarMode === 'month' || calendarMode === 'schedule') {
                setAnchorDate((prev) => prev.clone().add(direction, 'month'))
                return
            }
            if (calendarMode === 'year') {
                setAnchorDate((prev) => prev.clone().add(direction, 'year'))
                return
            }
        },
        [calendarMode]
    )

    const handlePickDateShowDayView = useCallback((d: moment.Moment) => {
        setAnchorDate(d.clone().tz(calendarDisplayTimezone).startOf('day'))
        setCalendarMode('day')
    }, [calendarDisplayTimezone])

    const nowInDisplayTz = useMemo(
        () => moment.tz(calendarClockMs, calendarDisplayTimezone),
        [calendarClockMs, calendarDisplayTimezone]
    )

    /** Red “current time” line on day / week / 4-day views only when today is visible. */
    const timeGridNowIndicator = useMemo(() => {
        if (
            calendarMode === 'schedule' ||
            calendarMode === 'month' ||
            calendarMode === 'year'
        ) {
            return null
        }
        const tz = calendarDisplayTimezone
        const now = nowInDisplayTz.clone().tz(tz)
        const gridStart = weekStart.clone().tz(tz).startOf('day')
        const todayStart = now.clone().startOf('day')
        const dayIndex = todayStart.diff(gridStart, 'days')
        if (dayIndex < 0 || dayIndex >= dayCount) return null
        const hourFloat = Math.min(
            Math.max(
                now.hour() + now.minute() / 60 + now.second() / 3600,
                0
            ),
            24
        )
        const gridBodyBottom = HEADER_HEIGHT_PX + ROW_HEIGHT_PX * 24
        const topPx = HEADER_HEIGHT_PX + hourFloat * ROW_HEIGHT_PX
        if (topPx > gridBodyBottom) return null
        return { dayIndex, topPx }
    }, [
        calendarMode,
        calendarDisplayTimezone,
        dayCount,
        nowInDisplayTz,
        weekStart,
    ])

    const monthGridModel = useMemo(() => {
        const anchorMonth = anchorDate
            .clone()
            .tz(calendarDisplayTimezone)
            .startOf('month')
        const gridStart = anchorMonth
            .clone()
            .subtract(anchorMonth.day(), 'days')
            .startOf('day')
        const rangeEnd = gridStart.clone().add(41, 'days').endOf('day')
        const eventsByDay = buildEventsByDayKey(allEvents, gridStart, rangeEnd)
        const cells = Array.from({ length: 42 }, (_, i) => {
            const d = gridStart.clone().add(i, 'days')
            const key = d.format('YYYY-MM-DD')
            return {
                d,
                key,
                inAnchorMonth: d.isSame(anchorMonth, 'month'),
                list: eventsByDay.get(key) ?? [],
            }
        })
        return { cells }
    }, [allEvents, anchorDate, calendarDisplayTimezone])

    const yearMiniCalendars = useMemo(() => {
        const y = anchorDate.clone().tz(calendarDisplayTimezone).year()
        return Array.from({ length: 12 }, (_, monthIdx) => {
            const m = moment.tz(
                `${y}-${String(monthIdx + 1).padStart(2, '0')}-01`,
                'YYYY-MM-DD',
                calendarDisplayTimezone
            )
            const first = m.clone().startOf('month')
            const gridStart = first
                .clone()
                .subtract(first.day(), 'days')
                .startOf('day')
            const cells = Array.from({ length: 42 }, (_, i) => {
                const d = gridStart.clone().add(i, 'days')
                return {
                    key: d.format('YYYY-MM-DD'),
                    d,
                    inMonth: d.isSame(m, 'month'),
                    isToday: d.isSame(nowInDisplayTz, 'day'),
                }
            })
            return { title: m.format('MMMM'), cells }
        })
    }, [anchorDate, calendarDisplayTimezone, nowInDisplayTz])

    const gCal = useMemo(() => googleCalendarChrome(isDark), [isDark])

    return (
        <PageShell
            title="Calendar"
        >
            <div className="mb-3 flex flex-wrap gap-2">
                <Button
                    type={viewMode === 'table' ? 'primary' : 'default'}
                    onClick={() => setViewMode('table')}
                >
                    Google Calendar
                </Button>
                <Button
                    type={viewMode === 'scheduleTable' ? 'primary' : 'default'}
                    onClick={() => setViewMode('scheduleTable')}
                >
                    Schedule Table
                </Button>
                <Tooltip title="Downloads calendar JSON for every profile with a calendar URL (in parallel), refreshes the Google Calendar view, and rebuilds Schedule Table rows for that profile using AI-assisted extraction (company, position, status, meeting time).">
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={bulkCalendarSyncing}
                        disabled={
                            loading ||
                            bulkCalendarSyncing ||
                            clearCalendarBusy ||
                            rowsWithCalendarUrl.length === 0
                        }
                        onClick={() => void handleFetchAllCalendarJson()}
                    >
                        Fetch Calendar Data
                    </Button>
                </Tooltip>
                <Tooltip title="Deletes saved calendar JSON on disk and removes schedule rows imported from the calendar (for every profile with a calendar URL).">
                    <Button
                        danger
                        loading={clearCalendarBusy}
                        disabled={
                            loading ||
                            bulkCalendarSyncing ||
                            clearCalendarBusy ||
                            rowsWithCalendarUrl.length === 0
                        }
                        onClick={handleClearCalendar}
                    >
                        Clear Calendar
                    </Button>
                </Tooltip>
            </div>

            {viewMode === 'table' ? (
                <div className="panel-elevated min-w-0 overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-col md:flex-row md:min-h-[min(70vh,780px)]">
                        <aside
                            className={`${gCal.sidebarAside} max-h-[min(360px,45vh)] overflow-y-auto md:max-h-none md:self-stretch`}
                            aria-label="Calendar search and profiles"
                        >
                            <div className="flex flex-col gap-5 p-3 md:py-4">
                                <div className="min-w-0">
                                    <div className={`mb-2 ${gCal.sidebarSectionTitle}`}>
                                        Search
                                    </div>
                                    <Input
                                        allowClear
                                        placeholder="Search events"
                                        value={searchKeyword}
                                        onChange={(e) =>
                                            setSearchKeyword(e.target.value)
                                        }
                                        className="w-full calendar-search-input"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <div className={`mb-2 ${gCal.sidebarSectionTitle}`}>
                                        Show profiles
                                    </div>
                                    {filteredProfilesForGoogleCal.length === 0 ? (
                                        <p className="m-0 text-xs leading-snug opacity-70">
                                            No profiles with a calendar URL for this
                                            filter.
                                        </p>
                                    ) : (
                                        <Checkbox.Group
                                            className="flex !max-w-full flex-col gap-2 [&_.ant-checkbox-wrapper]:!mr-0 [&_.ant-checkbox-wrapper]:!max-w-full [&_.ant-checkbox-wrapper]:items-start [&_.ant-checkbox-wrapper_span:last-child]:!whitespace-normal"
                                            value={includedProfileIds}
                                            options={filteredProfilesForGoogleCal.map(
                                                (p) => {
                                                    const scheduleCount =
                                                        p.id != null
                                                            ? (sidebarScheduleCountByProfileId.get(
                                                                  p.id
                                                              ) ?? 0)
                                                            : 0
                                                    return {
                                                        label: (
                                                            <span className="inline-flex min-w-0 w-full max-w-full items-center gap-2">
                                                                <span
                                                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                                                    style={{
                                                                        backgroundColor:
                                                                            p.id !=
                                                                            null
                                                                                ? profileColorById.get(
                                                                                      p.id
                                                                                  ) ??
                                                                                  pickEventColor(
                                                                                      p.name ??
                                                                                          ''
                                                                                  )
                                                                                : pickEventColor(
                                                                                      p.name ??
                                                                                          ''
                                                                                  ),
                                                                    }}
                                                                    aria-hidden
                                                                />
                                                                <span className="min-w-0 flex-1 items-baseline gap-1.5 inline-flex flex-wrap">
                                                                    <span className="min-w-0 break-words">
                                                                        {p.name}
                                                                    </span>
                                                                    <span
                                                                        className="shrink-0 tabular-nums text-sm opacity-70"
                                                                        title={`${scheduleCount} matching schedule(s) for current search, profile-user filter, and calendar range`}
                                                                    >
                                                                        {`(${scheduleCount})`}
                                                                    </span>
                                                                </span>
                                                            </span>
                                                        ),
                                                        value: p.id as number,
                                                    }
                                                }
                                            )}
                                            onChange={(vals) =>
                                                setIncludedProfileIds(vals as number[])
                                            }
                                            aria-label="Show events from these profiles on the calendar and schedule table"
                                        />
                                    )}
                                </div>
                            </div>
                        </aside>
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                            <div
                                className={`flex flex-wrap items-center gap-2 px-3 py-3 ${gCal.toolbar}`}
                            >
                                <Button
                                    onClick={() =>
                                        setAnchorDate(
                                            moment.tz(
                                                new Date(),
                                                calendarDisplayTimezone
                                            )
                                        )
                                    }
                                >
                                    Today
                                </Button>
                                <Button
                                    icon={<LeftOutlined />}
                                    onClick={() => handleStepDate(-1)}
                                />
                                <Button
                                    icon={<RightOutlined />}
                                    onClick={() => handleStepDate(1)}
                                />
                                <Select<CalendarDisplayMode>
                                    value={calendarMode}
                                    onChange={(v) => setCalendarMode(v)}
                                    style={{ width: 140 }}
                                    options={[
                                        { label: 'Day', value: 'day' },
                                        { label: 'Week', value: 'week' },
                                        { label: 'Month', value: 'month' },
                                        { label: 'Year', value: 'year' },
                                        { label: 'Schedule', value: 'schedule' },
                                        { label: '4 days', value: '4days' },
                                    ]}
                                />
                                <Select<GoogleCalProfileUserSlot>
                                    value={googleCalProfileUserSlot}
                                    style={{ minWidth: 200 }}
                                    onChange={(v) => {
                                        setGoogleCalProfileUserSlot(v)
                                    }}
                                    options={[
                                        {
                                            label: 'All profile users',
                                            value: 'all',
                                        },
                                        ...profileUserOptions,
                                    ]}
                                    aria-label="Filter events by profile user"
                                />
                                <Select<string>
                                    showSearch
                                    optionFilterProp="label"
                                    popupMatchSelectWidth={false}
                                    value={calendarDisplayTimezone}
                                    onChange={(z) => setCalendarDisplayTimezone(z)}
                                    style={{ minWidth: 240 }}
                                    options={CALENDAR_TIMEZONE_SELECT_OPTIONS}
                                    aria-label="Calendar display timezone"
                                />
                                <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    loading={calendarLoading}
                                    onClick={() => void loadCalendarTable()}
                                >
                                    Refresh
                                </Button>
                            </div>
                            <div className={`px-3 pt-2 text-sm ${gCal.rangeLabel}`}>
                                {rangeLabel}
                            </div>

                            {calendarMode === 'schedule' ? (
                        <div className="app-table-responsive px-3 pb-3 pt-2">
                            <Table<CalendarTableEvent>
                                rowKey={(r) => r.id}
                                dataSource={allEvents}
                                loading={calendarLoading}
                                className="app-data-table min-w-[min(640px,max(100%,18rem))]"
                                pagination={{
                                    pageSize: 20,
                                    showSizeChanger: true,
                                    responsive: true,
                                    position: ['bottomCenter'],
                                    className: TABLE_PAGINATION_COMFORT_CLASSNAME,
                                }}
                                onRow={(record) => ({
                                    onClick: () => setSelectedEvent(record),
                                })}
                                columns={[
                                    {
                                        title: 'Profile',
                                        dataIndex: 'profileName',
                                        key: 'profileName',
                                        render: (_: unknown, record) => (
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <span
                                                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            eventProfileColor(record),
                                                    }}
                                                    aria-hidden
                                                />
                                                <span className="truncate">
                                                    {record.profileName}
                                                </span>
                                            </span>
                                        ),
                                    },
                                    { title: 'Title', dataIndex: 'company', key: 'company' },
                                    {
                                        title: 'When',
                                        key: 'when',
                                        render: (_: unknown, record) =>
                                            record.startLocal.format('YYYY-MM-DD HH:mm'),
                                    },
                                ]}
                                locale={{
                                    emptyText:
                                        'No events for this range, search, or profile selection.',
                                }}
                            />
                        </div>
                    ) : calendarMode === 'month' ? (
                        <div
                            className={`px-3 pb-4 pt-2 ${
                                calendarLoading ? 'pointer-events-none opacity-50' : ''
                            }`}
                        >
                            <div className={gCal.monthShell}>
                                <div className={gCal.monthWeekHeadRow}>
                                    {MONTH_WEEK_HEADERS.map((h) => (
                                        <div key={h} className={gCal.weekHeadCell}>
                                            {h}
                                        </div>
                                    ))}
                                </div>
                                <div className={gCal.monthGrid}>
                                    {monthGridModel.cells.map(
                                        ({ d, key, inAnchorMonth, list }) => {
                                            const isToday = d.isSame(
                                                nowInDisplayTz,
                                                'day'
                                            )
                                            const dateLabel =
                                                !inAnchorMonth && d.date() === 1
                                                    ? d.format('MMM D')
                                                    : String(d.date())
                                            const shown: CalendarTableEvent[] = []
                                            for (const ev of list) {
                                                if (shown.length >= MONTH_CELL_MAX_EVENTS) {
                                                    break
                                                }
                                                shown.push(ev)
                                            }
                                            const more = list.length - shown.length
                                            return (
                                                <div key={key} className={gCal.monthCell}>
                                                    <div className="mb-1 flex min-h-[28px] justify-center">
                                                        <button
                                                            type="button"
                                                            title={`Day view · ${d.format('MMM D, YYYY')}`}
                                                            onClick={() =>
                                                                handlePickDateShowDayView(d)
                                                            }
                                                            className={[
                                                                gCal.monthDateBtnBase,
                                                                gCal.monthDateBtnHover,
                                                                isToday
                                                                    ? 'h-7 w-7 rounded-full bg-[#1a73e8] font-medium text-white hover:brightness-110'
                                                                    : inAnchorMonth
                                                                      ? gCal.monthDateIn
                                                                      : gCal.monthDateMuted,
                                                            ].join(' ')}
                                                        >
                                                            {isToday ? d.date() : dateLabel}
                                                        </button>
                                                    </div>
                                                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                                                        {shown.map((ev) => {
                                                            const allDay = isLikelyAllDayEvent(ev)
                                                            if (allDay) {
                                                                return (
                                                                    <button
                                                                        key={`${key}-${ev.id}-ad`}
                                                                        type="button"
                                                                        title={`${ev.profileName} - ${ev.company}`}
                                                                        className="w-full max-w-full truncate rounded-sm px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-white hover:brightness-110"
                                                                        style={{
                                                                            backgroundColor:
                                                                                eventProfileColor(
                                                                                    ev
                                                                                ),
                                                                        }}
                                                                        onClick={() =>
                                                                            setSelectedEvent(ev)
                                                                        }
                                                                    >
                                                                        {ev.profileName} - {ev.company}
                                                                    </button>
                                                                )
                                                            }
                                                            return (
                                                                <button
                                                                    key={`${key}-${ev.id}`}
                                                                    type="button"
                                                                    title={`${ev.profileName} - ${ev.company}`}
                                                                    className="flex max-w-full min-w-0 items-start gap-1 text-left hover:opacity-90"
                                                                    onClick={() =>
                                                                        setSelectedEvent(ev)
                                                                    }
                                                                >
                                                                    <span
                                                                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                                                                        style={{
                                                                            backgroundColor:
                                                                                eventProfileColor(
                                                                                    ev
                                                                                ),
                                                                        }}
                                                                        aria-hidden
                                                                    />
                                                                    <span
                                                                        className={
                                                                            gCal.monthEventTimed
                                                                        }
                                                                    >
                                                                        {formatTimeShortLower(
                                                                            ev.startLocal
                                                                        )}{' '}
                                                                        {ev.profileName} - {ev.company}
                                                                    </span>
                                                                </button>
                                                            )
                                                        })}
                                                        {more > 0 ? (
                                                            <span className={gCal.monthMore}>
                                                                +{more} more
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            )
                                        }
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : calendarMode === 'year' ? (
                        <div
                            className={`${gCal.yearGridWrap} ${
                                calendarLoading ? 'pointer-events-none opacity-50' : ''
                            }`}
                        >
                            {yearMiniCalendars.map((block) => (
                                <div key={block.title} className={gCal.yearCard}>
                                    <div className={gCal.yearTitle}>{block.title}</div>
                                    <div className={gCal.yearLettersRow}>
                                        {YEAR_WEEK_LETTERS.map((L, i) => (
                                            <div key={`${block.title}-h-${i}`}>{L}</div>
                                        ))}
                                    </div>
                                    <div className={gCal.yearDaysGrid}>
                                        {block.cells.map((cell) => {
                                            const isToday = cell.isToday
                                            return (
                                                <div
                                                    key={cell.key}
                                                    className="flex h-6 items-center justify-center"
                                                >
                                                    <button
                                                        type="button"
                                                        title={`Day view · ${cell.d.format('MMM D, YYYY')}`}
                                                        onClick={() =>
                                                            handlePickDateShowDayView(cell.d)
                                                        }
                                                        className={[
                                                            gCal.yearDayBtnBase,
                                                            gCal.yearDayBtnHover,
                                                            isToday
                                                                ? 'h-5 min-w-[22px] rounded-full bg-[#1a73e8] text-[10px] font-medium text-white hover:bg-[#1a73e8] hover:brightness-110'
                                                                : cell.inMonth
                                                                  ? gCal.yearDayIn
                                                                  : gCal.yearDayMuted,
                                                        ].join(' ')}
                                                    >
                                                        {cell.d.date()}
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={gCal.timeScroll}>
                            <div
                                className={gCal.timeGridWrap}
                                style={{
                                    height:
                                        HEADER_HEIGHT_PX +
                                        ROW_HEIGHT_PX * hourSlots.length,
                                }}
                            >
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(${dayCount}, minmax(120px, 1fr))`,
                                        gridTemplateRows: `${HEADER_HEIGHT_PX}px repeat(${hourSlots.length}, ${ROW_HEIGHT_PX}px)`,
                                    }}
                                >
                                    <div className={gCal.timeCorner}>
                                        {moment
                                            .tz(new Date(), calendarDisplayTimezone)
                                            .format('z')}
                                    </div>
                                    {weekDays.map((day) => (
                                        <div
                                            key={day.key}
                                            className={gCal.timeColHead}
                                        >
                                            <div className={gCal.timeColHeadSub}>
                                                {day.shortLabel}
                                            </div>
                                            <div className={gCal.timeColHeadMain}>
                                                {day.dateLabel}
                                            </div>
                                        </div>
                                    ))}

                                    {hourSlots.map((hour) => (
                                        <div
                                            key={`hour-${hour}`}
                                            className="contents"
                                        >
                                            <div className={gCal.timeGutter}>
                                                {formatHourLabel(hour)}
                                            </div>
                                            {weekDays.map((day) => (
                                                <div
                                                    key={`${day.key}-${hour}`}
                                                    className={gCal.timeSlotCell}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {!calendarLoading &&
                                    eventsInGrid.map((event) => {
                                        const top =
                                            HEADER_HEIGHT_PX +
                                            event.hourFloat * ROW_HEIGHT_PX +
                                            4
                                        const eventHeight = Math.max(
                                            30,
                                            Math.min(
                                                (event.durationMinutes / 60) *
                                                    ROW_HEIGHT_PX -
                                                    8,
                                                ROW_HEIGHT_PX * 2
                                            )
                                        )
                                        const colFrac = event.overlapSpan
                                        const lane = event.overlapCol
                                        return (
                                            <button
                                                key={`event-${event.id}`}
                                                type="button"
                                                className="absolute overflow-hidden rounded px-2 py-1 text-left text-[11px] text-white shadow"
                                                style={{
                                                    top,
                                                    height: eventHeight,
                                                    left: `calc(${TIME_GUTTER_PX}px + (${event.dayIndex} * ((100% - ${TIME_GUTTER_PX}px) / ${dayCount})) + 5px + ((((100% - ${TIME_GUTTER_PX}px) / ${dayCount})) - 10px) * (${lane} / ${colFrac}))`,
                                                    width: `calc(((((100% - ${TIME_GUTTER_PX}px) / ${dayCount})) - 10px) / ${colFrac})`,
                                                    backgroundColor:
                                                        eventProfileColor(event),
                                                }}
                                                title={`${event.profileName} - ${event.company} · ${event.startLocal.format('YYYY-MM-DD HH:mm')}`}
                                                onClick={() => setSelectedEvent(event)}
                                            >
                                                <div className="truncate font-semibold leading-snug">
                                                    {event.profileName} - {event.company}
                                                </div>
                                            </button>
                                        )
                                    })}
                                {timeGridNowIndicator != null && (
                                    <div
                                        className="pointer-events-none absolute z-[15]"
                                        style={{
                                            top: timeGridNowIndicator.topPx,
                                            left: `calc(${TIME_GUTTER_PX}px + (${timeGridNowIndicator.dayIndex} * ((100% - ${TIME_GUTTER_PX}px) / ${dayCount})) + 5px)`,
                                            width: `calc(((100% - ${TIME_GUTTER_PX}px) / ${dayCount}) - 10px)`,
                                        }}
                                        aria-hidden
                                    >
                                        <div
                                            className="relative h-0.5 w-full rounded-full"
                                            style={{
                                                backgroundColor:
                                                    TIME_GRID_NOW_LINE_COLOR,
                                            }}
                                        >
                                            <span
                                                className="absolute left-0 top-1/2 box-border h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                                                style={{
                                                    borderColor:
                                                        TIME_GRID_NOW_LINE_COLOR,
                                                    backgroundColor: isDark
                                                        ? '#131314'
                                                        : '#ffffff',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                        </div>
                    </div>
                </div>
            ) : (
                <ScheduleImportsPanel
                    reloadToken={scheduleImportsReloadSignal}
                />
            )}
            <Modal
                title="Schedule Data"
                open={selectedEvent != null}
                onCancel={() => setSelectedEvent(null)}
                footer={null}
            >
                {selectedEvent != null && (
                    <div className="space-y-2 text-sm">
                        <div><strong>Profile:</strong> {selectedEvent.profileName}</div>
                        <div><strong>Title:</strong> {selectedEvent.company}</div>
                        <div><strong>Status/Position:</strong> {selectedEvent.position}</div>
                        <div>
                            <strong>Start:</strong>{' '}
                            {selectedEvent.startLocal.format('YYYY-MM-DD HH:mm')}
                        </div>
                        <div>
                            <strong>End:</strong>{' '}
                            {selectedEvent.endLocal.format('YYYY-MM-DD HH:mm')}
                        </div>
                        <div>
                            <strong>Shown in:</strong> {calendarDisplayTimezone}
                        </div>
                        <div>
                            <strong>Timezone (stored):</strong>{' '}
                            {selectedEvent.timezone}
                        </div>
                        <div><strong>Location:</strong> {selectedEvent.location || '—'}</div>
                        <div>
                            <strong>Description:</strong>
                            <div className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words">
                                {selectedEvent.description || '—'}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
            <FetchCalendarProgressModal
                snapshot={fetchProgress}
                onClose={closeFetchProgressModal}
            />
        </PageShell>
    )
}

export default Calendar
