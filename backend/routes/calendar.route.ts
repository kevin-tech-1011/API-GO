import { Router } from 'express'
import axios from 'axios'
import fs from 'fs/promises'
import { Op } from 'sequelize'
import { auth } from '../middlewares/auth.middleware'
import {
    CALENDAR_IMPORT_REQUIREMENTS_TAG,
    HISTORY_INTERVIEW_STATUS_OPTIONS,
    USER_ROLES,
} from '../types/constants'
import History from '../db/history'
import Profile from '../db/profile'
import { sequelize } from '../db'
import {
    extractCalendarScheduleRows,
    type CalendarEventBrief,
} from '../services/openai.service'
import {
    calendarJsonPath,
    isAllowedGoogleCalendarUrl,
    normalizeCalendarUrl,
    parseIcsToEventSummaries,
    sanitizeProfileDirName,
} from '../utils/googleCalendarFetch'

const router = Router()

const IMPORT_STATUS_SET = new Set<string>(HISTORY_INTERVIEW_STATUS_OPTIONS)

function normalizeImportedInterviewStatus(raw: string | undefined): string {
    const t = String(raw ?? '').trim()
    return IMPORT_STATUS_SET.has(t) ? t : 'Intro Interview'
}

function icsEventsToBriefs(
    events: Array<{
        uid?: string
        summary?: string
        dtstart?: string
        dtend?: string
        description?: string
        location?: string
    }>
): CalendarEventBrief[] {
    return events.map((e) => {
        const desc = [e.description, e.location]
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter((x) => x !== '')
            .join('\n\n')
        return {
            uid: typeof e.uid === 'string' ? e.uid : undefined,
            summary: typeof e.summary === 'string' ? e.summary : undefined,
            dtstart: typeof e.dtstart === 'string' ? e.dtstart : undefined,
            dtend: typeof e.dtend === 'string' ? e.dtend : undefined,
            description: desc || undefined,
        }
    })
}

function calendarImportRequirements(uid: string | undefined, idx: number): string {
    const base = CALENDAR_IMPORT_REQUIREMENTS_TAG
    const id =
        uid != null && String(uid).trim() !== ''
            ? String(uid).trim().replace(/\s+/g, ' ')
            : `event-${idx}`
    const suffix = id.length > 220 ? id.slice(0, 220) : id
    const out = `${base} ${suffix}`
    return out.length > 500 ? out.slice(0, 500) : out
}

/**
 * Replace `[calendar-import]` history rows for this profile with rows derived from
 * the same events passed to OpenAI extraction (Schedule Table on Calendar page).
 */
async function replaceCalendarImportHistories(opts: {
    profileId: number
    profileUserId: number | null
    actingUserId: number
    parsedIcsEvents: Array<{
        uid?: string
        summary?: string
        dtstart?: string
        dtend?: string
        description?: string
        location?: string
    }>
}): Promise<{ written: number } | { error: string }> {
    try {
        const briefs = icsEventsToBriefs(opts.parsedIcsEvents)
        const extracted = await extractCalendarScheduleRows(briefs)
        const n = Math.min(extracted.length, opts.parsedIcsEvents.length)
        const ownerUserId =
            opts.profileUserId != null &&
            Number.isFinite(opts.profileUserId) &&
            opts.profileUserId > 0
                ? opts.profileUserId
                : opts.actingUserId

        const t = await sequelize.transaction()
        try {
            await History.destroy({
                where: {
                    profileId: opts.profileId,
                    requirements: { [Op.startsWith]: CALENDAR_IMPORT_REQUIREMENTS_TAG },
                },
                transaction: t,
            })

            if (n === 0) {
                await t.commit()
                return { written: 0 }
            }

            const rows: Record<string, unknown>[] = []
            for (let i = 0; i < n; i += 1) {
                const row = extracted[i]!
                const ev = opts.parsedIcsEvents[i]!
                const status = normalizeImportedInterviewStatus(row.status)
                const company = (row.company || 'Unknown').trim().slice(0, 200) || 'Unknown'
                const position = (row.position || 'Interview').trim().slice(0, 200) || 'Interview'
                const loc = (row.location || '').trim()
                const link =
                    /^https?:\/\//i.test(loc) && loc.length > 0
                        ? loc.slice(0, 2000)
                        : 'calendar-import'
                const meetingLink = loc.slice(0, 2000)
                const meetingTime =
                    row.meetingTimeIso && String(row.meetingTimeIso).trim() !== ''
                        ? String(row.meetingTimeIso).trim()
                        : new Date().toISOString()

                rows.push({
                    company,
                    position,
                    link,
                    requirements: calendarImportRequirements(
                        typeof ev.uid === 'string' ? ev.uid : undefined,
                        i
                    ),
                    resume: '{}',
                    userId: ownerUserId,
                    profileId: opts.profileId,
                    templateId: 1,
                    backgroundId: 0,
                    statusStages: [status],
                    scheduleMeetingsByStatus: {
                        [status]: {
                            timezone: 'America/Los_Angeles',
                            meetingTime,
                            meetingLink,
                        },
                    },
                })
            }

            await History.bulkCreate(rows, { transaction: t })
            await t.commit()
            return { written: rows.length }
        } catch (inner) {
            await t.rollback()
            throw inner
        }
    } catch (err: any) {
        console.error('[calendar/fetch] schedule import sync failed', err)
        return {
            error: err?.message || 'Failed to sync calendar rows to schedule table.',
        }
    }
}

function isManager(user: { role?: string }): boolean {
    return user?.role === USER_ROLES.MANAGER
}

/**
 * MANAGER only: GET Google Calendar feed from profile `calendarUrl`, parse to JSON,
 * write `calendar/<profile name>/calendar-data.json` (replace if exists).
 */
router.post('/fetch/:profileId', auth, async (req: any, res) => {
    if (!isManager(req.user)) {
        return res.status(403).json({ error: 'Only managers can fetch calendar data.' })
    }

    const profileId = Number(req.params.profileId)
    if (!Number.isFinite(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'Invalid profile id.' })
    }

    try {
        const profile = await Profile.findByPk(profileId)
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' })
        }

        const rawUrl = profile.getDataValue('calendarUrl') as string | null | undefined
        const calendarUrl = rawUrl != null ? String(rawUrl).trim() : ''
        if (!calendarUrl) {
            return res.status(400).json({ error: 'Profile has no calendar URL.' })
        }

        const normalized = normalizeCalendarUrl(calendarUrl)
        if (!isAllowedGoogleCalendarUrl(normalized)) {
            return res.status(400).json({
                error:
                    'Calendar URL must be an https link on calendar.google.com (Google Calendar iCal / secret address).',
            })
        }

        const response = await axios.get<string>(normalized, {
            responseType: 'text',
            timeout: 45_000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
            headers: {
                Accept: 'text/calendar, application/json;q=0.9, */*;q=0.8',
                'User-Agent': 'ResumeAI-CalendarSync/1.0',
            },
            validateStatus: (s) => s >= 200 && s < 400,
        })

        const body = typeof response.data === 'string' ? response.data : String(response.data)
        const contentType = String(response.headers['content-type'] || '').toLowerCase()

        const profileName = String(profile.getDataValue('name') || '').trim()
        const dirName = sanitizeProfileDirName(profileName, profileId)
        const { dir, filePath } = calendarJsonPath(dirName)

        let payload: Record<string, unknown>

        if (
            body.includes('BEGIN:VCALENDAR') ||
            contentType.includes('text/calendar') ||
            normalized.toLowerCase().includes('/ical/')
        ) {
            const parsed = parseIcsToEventSummaries(body)
            payload = {
                meta: {
                    profileId,
                    profileName,
                    sourceUrl: normalized,
                    fetchedAt: new Date().toISOString(),
                    format: 'ical',
                    status: response.status,
                    eventCount: parsed.events.length,
                },
                events: parsed.events,
            }
        } else {
            let parsedJson: unknown = null
            try {
                parsedJson = JSON.parse(body)
            } catch {
                parsedJson = null
            }
            payload = {
                meta: {
                    profileId,
                    profileName,
                    sourceUrl: normalized,
                    fetchedAt: new Date().toISOString(),
                    format: parsedJson != null ? 'json' : 'text',
                    status: response.status,
                },
                data: parsedJson != null ? parsedJson : { text: body.slice(0, 500_000) },
            }
        }

        await fs.mkdir(dir, { recursive: true })
        try {
            await fs.unlink(filePath)
        } catch (e: any) {
            if (e?.code !== 'ENOENT') throw e
        }
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')

        let scheduleRowsWritten: number | undefined
        let scheduleImportError: string | undefined
        const eventsForSync = Array.isArray(payload.events)
            ? (payload.events as Array<{
                  uid?: string
                  summary?: string
                  dtstart?: string
                  dtend?: string
                  description?: string
                  location?: string
              }>)
            : null
        if (eventsForSync != null) {
            const actingId = Number((req.user as { id?: unknown })?.id)
            const actingUserId =
                Number.isFinite(actingId) && actingId > 0 ? actingId : null
            const rawPu = profile.getDataValue('userId')
            const pu = Number(rawPu)
            const profileUserId =
                Number.isFinite(pu) && pu > 0 ? pu : null
            if (actingUserId == null) {
                scheduleImportError =
                    'Missing authenticated user id; schedule table was not updated.'
            } else {
                const sync = await replaceCalendarImportHistories({
                    profileId,
                    profileUserId,
                    actingUserId,
                    parsedIcsEvents: eventsForSync,
                })
                if ('written' in sync) {
                    scheduleRowsWritten = sync.written
                } else {
                    scheduleImportError = sync.error
                }
            }
        }

        return res.json({
            ok: true,
            relativePath: `calendar/${dirName}/calendar-data.json`,
            filePath,
            eventCount:
                typeof payload.meta === 'object' &&
                payload.meta !== null &&
                'eventCount' in payload.meta
                    ? (payload.meta as { eventCount?: number }).eventCount
                    : undefined,
            scheduleRowsWritten,
            scheduleImportError,
        })
    } catch (err: any) {
        const msg =
            err?.response?.status === 404
                ? 'Google returned 404 for this calendar URL.'
                : err?.code === 'ECONNABORTED'
                  ? 'Request timed out while fetching the calendar.'
                  : err?.message || 'Failed to fetch or save calendar data.'
        console.error('[calendar/fetch]', err)
        return res.status(502).json({ error: msg })
    }
})

/**
 * MANAGER: read parsed events from `calendar/<profile name>/calendar-data.json`.
 */
router.get('/events/:profileId', auth, async (req: any, res) => {
    if (!isManager(req.user)) {
        return res.status(403).json({ error: 'Only managers can read calendar events.' })
    }

    const profileId = Number(req.params.profileId)
    if (!Number.isFinite(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'Invalid profile id.' })
    }

    try {
        const profile = await Profile.findByPk(profileId)
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' })
        }

        const profileName = String(profile.getDataValue('name') || '').trim()
        const dirName = sanitizeProfileDirName(profileName, profileId)
        const { filePath } = calendarJsonPath(dirName)

        let rawText = ''
        try {
            rawText = await fs.readFile(filePath, 'utf8')
        } catch (e: any) {
            if (e?.code === 'ENOENT') {
                return res.status(404).json({
                    error: `No saved calendar file at calendar/${dirName}/calendar-data.json. Run Fetch Data first.`,
                })
            }
            throw e
        }

        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(rawText) as Record<string, unknown>
        } catch {
            return res
                .status(400)
                .json({ error: 'calendar-data.json is not valid JSON.' })
        }

        const eventsRaw = Array.isArray(parsed.events)
            ? (parsed.events as unknown[])
            : []
        const events = eventsRaw
            .map((item) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    return null
                }
                const e = item as Record<string, unknown>
                return {
                    uid: typeof e.uid === 'string' ? e.uid : '',
                    summary: typeof e.summary === 'string' ? e.summary : '',
                    description:
                        typeof e.description === 'string' ? e.description : '',
                    location: typeof e.location === 'string' ? e.location : '',
                    dtstart: typeof e.dtstart === 'string' ? e.dtstart : '',
                    dtend: typeof e.dtend === 'string' ? e.dtend : '',
                    status: typeof e.status === 'string' ? e.status : '',
                    organizer:
                        typeof e.organizer === 'string' ? e.organizer : '',
                }
            })
            .filter(
                (
                    e
                ): e is {
                    uid: string
                    summary: string
                    description: string
                    location: string
                    dtstart: string
                    dtend: string
                    status: string
                    organizer: string
                } => e != null
            )

        return res.json({
            ok: true,
            profile: {
                id: profileId,
                name: profileName,
            },
            eventCount: events.length,
            events,
            meta:
                typeof parsed.meta === 'object' && parsed.meta != null
                    ? parsed.meta
                    : null,
        })
    } catch (err: any) {
        console.error('[calendar/events]', err)
        return res.status(502).json({
            error: err?.message || 'Failed to load saved calendar data.',
        })
    }
})

/**
 * MANAGER: delete `calendar/<profile name>/calendar-data.json` (if present) and remove
 * calendar-import `histories` rows for this profile.
 */
router.post('/clear/:profileId', auth, async (req: any, res) => {
    if (!isManager(req.user)) {
        return res.status(403).json({ error: 'Only managers can clear calendar data.' })
    }

    const profileId = Number(req.params.profileId)
    if (!Number.isFinite(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'Invalid profile id.' })
    }

    try {
        const profile = await Profile.findByPk(profileId)
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found.' })
        }

        const profileName = String(profile.getDataValue('name') || '').trim()
        const dirName = sanitizeProfileDirName(profileName, profileId)
        const { filePath } = calendarJsonPath(dirName)

        let fileRemoved = false
        try {
            await fs.unlink(filePath)
            fileRemoved = true
        } catch (e: any) {
            if (e?.code !== 'ENOENT') throw e
        }

        const removedHistories = await History.destroy({
            where: {
                profileId,
                requirements: { [Op.startsWith]: CALENDAR_IMPORT_REQUIREMENTS_TAG },
            },
        })

        return res.json({
            ok: true,
            relativePath: `calendar/${dirName}/calendar-data.json`,
            fileRemoved,
            removedHistories,
        })
    } catch (err: any) {
        console.error('[calendar/clear]', err)
        return res.status(502).json({
            error: err?.message || 'Failed to clear calendar data.',
        })
    }
})

export default router
