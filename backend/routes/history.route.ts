import {Router } from 'express'
import { auth, requireAdmin, requireUser } from '../middlewares/auth.middleware'

import History from '../db/history'
import Profile from '../db/profile'
import User from '../db/user'
import { sequelize } from '../db'
import {
    ADMIN_ACCESS_ROLES,
    CALENDAR_IMPORT_REQUIREMENTS_TAG,
    HISTORY_INTERVIEW_STATUS_OPTIONS,
    USER_ROLES,
} from '../types/constants'
import { Op } from 'sequelize'
import { toPlainHistoryRows } from '../utils/historyProfileDisplay'
import { aggregateHistoryCountsByProfileId } from '../utils/historyStatsAttribution'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'
import { orderUtcIsoInclusive, parseUtcIsoBound } from '../utils/statisticsPacific'

function isManagerRole(user: any): boolean {
    return (
        String(user?.role ?? '')
            .toUpperCase()
            .trim() === String(USER_ROLES.MANAGER).toUpperCase()
    )
}

/** `profiles.show === false` in Profile / History UI — only MANAGER may access that history. */
function isProfileShowHidden(
    profile: { getDataValue?: (k: string) => unknown; show?: unknown } | null | undefined
): boolean {
    if (profile == null) return false
    const s =
        typeof profile.getDataValue === 'function'
            ? profile.getDataValue('show')
            : (profile as { show?: unknown }).show
    return s === false || s === 0
}

function shouldOmitHistoryForRequester(
    user: any,
    profile: { getDataValue?: (k: string) => unknown; show?: unknown } | null | undefined
): boolean {
    if (isManagerRole(user)) return false
    return isProfileShowHidden(profile)
}

const ALLOWED_STATUS_LABELS = new Set<string>(HISTORY_INTERVIEW_STATUS_OPTIONS)

function normalizeStatusStages(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    const out: string[] = []
    for (const x of raw) {
        if (typeof x === 'string' && ALLOWED_STATUS_LABELS.has(x) && !out.includes(x)) {
            out.push(x)
        }
    }
    return out
}

type ScheduleMeetingEntry = {
    timezone: string
    meetingTime: string
    meetingLink: string
}

function normalizeScheduleMeetings(raw: unknown): Record<string, ScheduleMeetingEntry> {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, ScheduleMeetingEntry> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!ALLOWED_STATUS_LABELS.has(k)) continue
        if (v == null || typeof v !== 'object' || Array.isArray(v)) continue
        const o = v as Record<string, unknown>
        const timezone =
            typeof o.timezone === 'string' && o.timezone.trim()
                ? o.timezone.trim()
                : 'America/New_York'
        const meetingTime =
            typeof o.meetingTime === 'string' ? o.meetingTime.trim() : ''
        const meetingLink =
            typeof o.meetingLink === 'string' ? o.meetingLink.trim() : ''
        out[k] = { timezone, meetingTime, meetingLink }
    }
    return out
}

function parsePositiveUserId(raw: unknown): number | null {
    if (raw == null) return null
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
}

const router = Router()

/** Escape LIKE special characters (%, _, \) so search is predictable */
function escapeLike(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
}

/** SQLite/Postgres: `profiles` rows with Show on (for raw `IN (SELECT …)` subqueries). */
function sqlSubqueryProfileVisibleByShow(dialect: string): string {
    if (dialect === 'sqlite') {
        return '(`show` = 1 OR `show` IS NULL)'
    }
    return '("show" = true OR "show" IS NULL)'
}

/**
 * SQLite: match histories for a profile-user slot via linked `profileId` or, when
 * unlinked, `resume` JSON `name` matching a profile in that slot (same as stats).
 */
function sqlHistoryMatchesProfileUserIndexSqlite(
    historyCol: (field: string) => string,
    isMgr: boolean
): string {
    const subVis = isMgr ? '' : ' AND (`show` = 1 OR `show` IS NULL)'
    const subVisHp = isMgr ? '' : ' AND (hp.`show` = 1 OR hp.`show` IS NULL)'
    const resumeName = `json_extract(${historyCol('resume')}, '$.name')`
    return `(
  ${historyCol('profileId')} IN (SELECT id FROM profiles WHERE profileUserIndex = :pPui${subVis})
  OR
  (
    ${historyCol('profileId')} IS NULL
    AND ${resumeName} IS NOT NULL
    AND length(trim(${resumeName})) > 0
    AND EXISTS (
      SELECT 1 FROM profiles hp
      WHERE hp.profileUserIndex = :pPui
      AND lower(trim(hp.name)) = lower(trim(${resumeName}))
      ${subVisHp}
    )
  )
)`
}

/**
 * Non-managers: hide history when it links to a hidden profile, or is unlinked but resume
 * `name` matches a hidden profile’s `name` (same display name, e.g. “Adam Liu”).
 * Outer table alias is `history` (Sequelize default for `define('history', …)`).
 */
function sqlNonManagerHistoryHiddenProfileFilter(dialect: string): string {
    if (dialect === 'sqlite') {
        return `NOT EXISTS (
  SELECT 1 FROM \`profiles\` AS hp
  WHERE COALESCE(hp.\`show\`, 1) = 0
  AND (
    hp.\`id\` = \`history\`.\`profileId\`
    OR (
      \`history\`.\`profileId\` IS NULL
      AND json_extract(\`history\`.\`resume\`, '$.name') IS NOT NULL
      AND length(trim(json_extract(\`history\`.\`resume\`, '$.name'))) > 0
      AND lower(trim(hp.\`name\`)) = lower(trim(json_extract(\`history\`.\`resume\`, '$.name')))
    )
  )
)`
    }
    return `NOT EXISTS (
  SELECT 1 FROM "profiles" AS hp
  WHERE (hp."show" IS FALSE OR hp."show" = 0)
  AND hp."id" = "history"."profileId"
)`
}

function andMergeWhere(
    where: Record<string, unknown>,
    extra: ReturnType<typeof sequelize.literal> | Record<string, unknown>
) {
    const w0 = { ...where }
    Object.keys(where).forEach((k) => delete (where as Record<string, unknown>)[k])
    ;(where as any)[Op.and] = [w0, extra]
}

const CAL_TAG_LEN = CALENDAR_IMPORT_REQUIREMENTS_TAG.length

/** `requirements` starts with calendar-import tag (cross-dialect, avoids PG LIKE bracket rules). */
function requirementsStartsWithCalendarImportSql(
    historyCol: (field: string) => string
): ReturnType<typeof sequelize.literal> {
    const r = `TRIM(COALESCE(${historyCol('requirements')}, ''))`
    const esc = CALENDAR_IMPORT_REQUIREMENTS_TAG.replace(/'/g, "''")
    return sequelize.literal(
        `(SUBSTR(${r}, 1, ${CAL_TAG_LEN}) = '${esc}')`
    )
}

function requirementsNotCalendarImportSql(
    historyCol: (field: string) => string
): ReturnType<typeof sequelize.literal> {
    const r = `TRIM(COALESCE(${historyCol('requirements')}, ''))`
    const esc = CALENDAR_IMPORT_REQUIREMENTS_TAG.replace(/'/g, "''")
    return sequelize.literal(
        `(SUBSTR(${r}, 1, ${CAL_TAG_LEN}) != '${esc}' OR LENGTH(${r}) < ${CAL_TAG_LEN})`
    )
}

router.get('/', auth, async (req: any, res) => {
    const user = req.user
    const {
        q,
        cname,
        pname,
        position,
        profileUserIndex,
        current,
        pageSize,
        schedule,
        calendarImport,
    } = req.query

    try {
        const whereClause: Record<string, unknown> = {}

        // USER: read-only History page — list all rows (not only rows they created).
        if (
            !ADMIN_ACCESS_ROLES.includes(user.role) &&
            user.role !== USER_ROLES.USER
        ) {
            whereClause.userId = user.id
        }

        const clean = (v: unknown): string => {
            if (typeof v !== 'string') return ''
            const t = v.trim()
            if (t === '' || t === 'undefined' || t === 'null') return ''
            return t
        }
        const queryTrimmed = clean(q)
        const cnameTrimmed = clean(cname)
        const pnameTrimmed = clean(pname)
        const positionTrimmed = clean(position)
        const profileUserIndexTrimmed = clean(profileUserIndex)
        const dialect = sequelize.getDialect()
        const isMgr = isManagerRole(user)
        const parsedProfileUserIndex = normalizeProfileUserIndex(
            profileUserIndexTrimmed
        )
        const usePnameOnHistoryRow =
            Boolean(pnameTrimmed) && dialect === 'sqlite'
        const pnameRequiresInnerJoin = Boolean(
            pnameTrimmed && !usePnameOnHistoryRow
        )
        const useProfileUserOnHistoryRow =
            parsedProfileUserIndex != null && dialect === 'sqlite'
        const useSqliteRowLevelProfileFilters =
            usePnameOnHistoryRow || useProfileUserOnHistoryRow

        const historyCol = (field: string) =>
            dialect === 'sqlite'
                ? `\`history\`.\`${field}\``
                : `"history"."${field}"`

        let qPattern: string | undefined
        if (queryTrimmed) {
            const escaped = escapeLike(queryTrimmed)
            qPattern = `%${escaped}%`
            const qSubVis = isMgr
                ? ''
                : ` AND ${sqlSubqueryProfileVisibleByShow(dialect)}`
            whereClause[Op.or as any] = [
                sequelize.literal(
                    `${historyCol('company')} LIKE :qPattern ESCAPE '\\'`
                ),
                sequelize.literal(
                    `${historyCol('position')} LIKE :qPattern ESCAPE '\\'`
                ),
                sequelize.literal(
                    `${historyCol('profileId')} IN (SELECT id FROM profiles WHERE name LIKE :qPattern ESCAPE '\\'${qSubVis})`
                ),
            ]
        } else {
            if (cnameTrimmed) {
                whereClause.company = { [Op.like]: `%${escapeLike(cnameTrimmed)}%` }
            }
        }
        if (cnameTrimmed && queryTrimmed) {
            whereClause.company = { [Op.like]: `%${escapeLike(cnameTrimmed)}%` }
        }
        if (positionTrimmed) {
            whereClause.position = { [Op.like]: `%${escapeLike(positionTrimmed)}%` }
        }

        const profileWhereConditions: Record<string, unknown>[] = []
        if (pnameTrimmed && !usePnameOnHistoryRow) {
            profileWhereConditions.push({
                name: { [Op.like]: `%${escapeLike(pnameTrimmed)}%` },
            })
        }
        if (parsedProfileUserIndex != null && dialect !== 'sqlite') {
            profileWhereConditions.push({
                profileUserIndex: parsedProfileUserIndex,
            })
        }
        const includeProfile: Record<string, unknown> = {
            model: Profile,
            as: 'profile',
            attributes: ['name', 'profileUserIndex', 'show'],
        }
        if (profileWhereConditions.length > 0) {
            includeProfile.where = { [Op.and]: profileWhereConditions }
        }
        includeProfile.required = useSqliteRowLevelProfileFilters
            ? false
            : Boolean(pnameRequiresInnerJoin) || parsedProfileUserIndex != null
        if (useSqliteRowLevelProfileFilters) {
            delete (includeProfile as { where?: unknown }).where
        }

        if (usePnameOnHistoryRow) {
            const subVis = isMgr
                ? ''
                : ' AND (`show` = 1 OR `show` IS NULL)'
            const lit = `(
  ${historyCol('profileId')} IN (SELECT id FROM profiles WHERE name LIKE :pPnameA ESCAPE '\\'${subVis})
  OR
  (${historyCol('profileId')} IS NULL AND json_extract(${historyCol('resume')}, '$.name') LIKE :pPnameB ESCAPE '\\')
)`
            andMergeWhere(whereClause, sequelize.literal(lit))
        }

        if (useProfileUserOnHistoryRow) {
            andMergeWhere(
                whereClause,
                sequelize.literal(
                    sqlHistoryMatchesProfileUserIndexSqlite(historyCol, isMgr)
                )
            )
        }

        const scheduleOnly =
            schedule === '1' ||
            schedule === 'true' ||
            String(schedule).toLowerCase() === 'true'

        if (scheduleOnly) {
            const nonEmptyStatus = sequelize.where(
                sequelize.fn(
                    'json_array_length',
                    sequelize.col('statusStages')
                ),
                Op.gt,
                0
            )
            const existing = { ...whereClause }
            Object.keys(whereClause).forEach((k) => delete (whereClause as any)[k])
            ;(whereClause as any)[Op.and] = [existing, nonEmptyStatus]
        }

        const calendarImportTrimmed = clean(calendarImport)
        const calendarImportOnly =
            calendarImportTrimmed === '1' ||
            calendarImportTrimmed.toLowerCase() === 'true'
        if (calendarImportOnly) {
            if (!isMgr) {
                return res
                    .status(403)
                    .send('Only managers can list calendar-import schedules')
            }
            andMergeWhere(
                whereClause,
                requirementsStartsWithCalendarImportSql(historyCol)
            )
        } else {
            andMergeWhere(
                whereClause,
                requirementsNotCalendarImportSql(historyCol)
            )
        }

        if (!isMgr) {
            andMergeWhere(
                whereClause,
                sequelize.literal(
                    sqlNonManagerHistoryHiddenProfileFilter(dialect)
                )
            )
        }

        const page = Math.max(1, (() => {
            const n = current != null && String(current) !== '' ? parseInt(String(current), 10) : 1
            return Number.isFinite(n) && n > 0 ? n : 1
        })())
        const perPage = (() => {
            const n = pageSize != null && String(pageSize) !== '' ? parseInt(String(pageSize), 10) : 15
            return Number.isFinite(n) && n > 0 ? n : 15
        })()

        const findOptions: Record<string, unknown> = {
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['email'],
                },
                includeProfile,
            ],
            order: [
                ['createdAt', 'DESC']
            ],
            subQuery: false,
            offset: (page - 1) * perPage,
            limit: perPage,
            distinct: true,
            col: 'id',
        }
        const rep: Record<string, string> = {}
        if (qPattern != null) {
            rep.qPattern = qPattern
        }
        if (usePnameOnHistoryRow) {
            const pL = `%${escapeLike(pnameTrimmed)}%`
            rep.pPnameA = pL
            rep.pPnameB = pL
        }
        if (useProfileUserOnHistoryRow) {
            rep.pPui = String(parsedProfileUserIndex)
        }
        if (Object.keys(rep).length > 0) {
            findOptions.replacements = rep
        }

        const histories = await History.findAndCountAll(findOptions)
        const rows = await toPlainHistoryRows(
            histories.rows as Parameters<typeof toPlainHistoryRows>[0],
            { id: user.id, role: user.role }
        )
        res.send({ count: histories.count, rows })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve the profile list')
    }
})

/**
 * Per-profile bid counts from `histories` (rows with/without `profileId`, resolved
 * the same way as /api/statistics). Manager only. Optional: `pname`, `startAt` + `endAt` (UTC ISO).
 * Omit date params for all-time.
 */
router.get('/stats/by-profile', auth, async (req: any, res) => {
    if (
        String(req.user?.role ?? '').trim().toUpperCase() !==
        USER_ROLES.MANAGER
    ) {
        return res.status(403).send('Only MANAGER can access this resource')
    }
    const { pname, startAt, endAt } = req.query
    try {
        const nameTrim =
            typeof pname === 'string' && pname.trim() !== ''
                ? String(pname).trim()
                : ''
        const filters: Record<string, unknown>[] = []
        if (nameTrim) {
            const escaped = escapeLike(nameTrim)
            filters.push({ name: { [Op.like]: `%${escaped}%` } })
        }
        const profileWhere =
            filters.length > 0 ? { [Op.and]: filters } : {}

        const profiles = await Profile.findAll({
            where: profileWhere,
            attributes: ['id', 'name', 'userId', 'profileUserIndex'],
            order: [['name', 'ASC']],
        })

        let startIso: string | null = null
        let endIso: string | null = null
        if (
            typeof startAt === 'string' &&
            startAt.trim() !== '' &&
            typeof endAt === 'string' &&
            endAt.trim() !== ''
        ) {
            const sa = parseUtcIsoBound(String(startAt))
            const ea = parseUtcIsoBound(String(endAt))
            if (sa && ea) {
                const o = orderUtcIsoInclusive(sa, ea)
                startIso = o.startIso
                endIso = o.endIso
            }
        }

        const countMap = await aggregateHistoryCountsByProfileId(
            profiles,
            startIso,
            endIso
        )

        const stats = profiles.map((p) => {
            const id = p.getDataValue('id') as number
            return {
                profileId: id,
                profileName: String(p.getDataValue('name') ?? ''),
                bidCount: countMap.get(id) ?? 0,
            }
        })
        stats.sort(
            (a, b) =>
                b.bidCount - a.bidCount || a.profileName.localeCompare(b.profileName)
        )
        res.json({ stats })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve bid counts')
    }
})

router.get('/:id', auth, async (req: any, res) => {
    const { id } = req.params
    try {
        const history = await History.findByPk(id, {
            include: [{ model: Profile, as: 'profile' }],
        })
        if (!history) {
            return res.status(404).send('History not found')
        }
        const profile = (history as any).profile
        if (shouldOmitHistoryForRequester(req.user, profile)) {
            return res.status(404).send('History not found')
        }
        const [plain] = await toPlainHistoryRows(
            [history] as Parameters<typeof toPlainHistoryRows>[0],
            { id: req.user.id, role: req.user.role }
        )
        res.send(plain)
    } catch {
        res.status(500).send('Unable to retrieve the requested history')
    }
})

router.post('/', async (req: any, res) => {
    const { data } = req.body
    try {
        const bodyUserId = parsePositiveUserId(data?.userId)
        const tokenUserId = parsePositiveUserId(req.user?.id)
        let resolvedUserId: number | null = null
        if (tokenUserId != null) {
            resolvedUserId = tokenUserId
            if (
                bodyUserId != null &&
                bodyUserId !== tokenUserId &&
                !ADMIN_ACCESS_ROLES.includes(req.user.role)
            ) {
                return res
                    .status(403)
                    .send('Cannot create history for another user')
            }
        } else {
            resolvedUserId = bodyUserId
        }
        if (resolvedUserId == null) {
            return res
                .status(401)
                .send('Authentication or a positive numeric data.userId is required')
        }

        const rawPid = data?.profileId
        const profileId =
            rawPid == null
                ? null
                : Number.isFinite(Number(rawPid)) && Number(rawPid) > 0
                  ? Number(rawPid)
                  : null
        if (profileId != null) {
            const p = await Profile.findByPk(profileId, { attributes: ['show'] })
            if (shouldOmitHistoryForRequester(req.user, p)) {
                return res.status(404).send('History not found')
            }
        }
        const history = await History.create({
            ...data,
            userId: resolvedUserId,
            profileId,
            statusStages: normalizeStatusStages(data?.statusStages),
            scheduleMeetingsByStatus: normalizeScheduleMeetings(
                data?.scheduleMeetingsByStatus
            ),
        })
        const full = await History.findByPk(history.getDataValue('id'), {
            include: [
                { model: User, as: 'user', attributes: ['email'] },
                { model: Profile, as: 'profile', attributes: ['name', 'id', 'show'] },
            ],
        })
        if (!full) {
            return res.status(500).send('History created but could not load')
        }
        const [plain] = await toPlainHistoryRows(
            [full] as Parameters<typeof toPlainHistoryRows>[0],
            {
                id: resolvedUserId,
                role: req.user?.role,
            }
        )
        res.send(plain)
    } catch (error) {
        console.log(error)
        res.status(500).send('An error occured while creating history')
    }
})

router.put('/', auth, requireUser, async (req: any, res) => {
    const { data } = req.body
    try {
        if (data?.id == null) {
            return res.status(400).send('Missing history id')
        }
        const existing = await History.findByPk(data.id, {
            include: [{ model: Profile, as: 'profile', attributes: ['id', 'show'] }],
        })
        if (!existing) {
            return res.status(404).send('History not found')
        }
        const ownerId = (existing as any).getDataValue('userId')
        if (!ADMIN_ACCESS_ROLES.includes(req.user.role) && ownerId !== req.user.id) {
            return res.status(403).send('Forbidden')
        }
        const rawExistingPid = (existing as any).getDataValue('profileId') as
            | number
            | null
            | undefined
        const existingPidNum =
            rawExistingPid != null &&
            Number.isFinite(Number(rawExistingPid)) &&
            Number(rawExistingPid) > 0
                ? Number(rawExistingPid)
                : null
        let nextProfileId: number | null
        if (Object.prototype.hasOwnProperty.call(data, 'profileId')) {
            const rawPid = data.profileId
            nextProfileId =
                rawPid == null
                    ? null
                    : Number.isFinite(Number(rawPid)) && Number(rawPid) > 0
                      ? Number(rawPid)
                      : null
        } else {
            nextProfileId = existingPidNum
        }
        if (nextProfileId != null) {
            const p =
                nextProfileId === existingPidNum
                    ? (existing as any).profile
                    : await Profile.findByPk(nextProfileId, { attributes: ['show'] })
            if (shouldOmitHistoryForRequester(req.user, p)) {
                return res.status(404).send('History not found')
            }
        }
        const payload: Record<string, unknown> = { ...data }
        delete payload.id
        if (Object.prototype.hasOwnProperty.call(data, 'statusStages')) {
            payload.statusStages = normalizeStatusStages(data.statusStages)
        }
        if (Object.prototype.hasOwnProperty.call(data, 'scheduleMeetingsByStatus')) {
            payload.scheduleMeetingsByStatus = normalizeScheduleMeetings(
                data.scheduleMeetingsByStatus
            )
        }
        await History.update(payload, { where: { id: data.id } })
        const updated = await History.findByPk(data.id, {
            include: [
                { model: User, as: 'user', attributes: ['email'] },
                { model: Profile, as: 'profile', attributes: ['name', 'id', 'show'] },
            ],
        })
        if (!updated) {
            return res.status(404).send('History not found')
        }
        const [plain] = await toPlainHistoryRows(
            [updated] as Parameters<typeof toPlainHistoryRows>[0],
            { id: req.user.id, role: req.user.role }
        )
        res.send(plain)
    } catch (error) {
        console.log(error)
        res.status(500).send('An error occured while updating history')
    }
})

router.delete('/:id', auth, requireAdmin, async (req, res) => {
    const { id } = req.params
    try {
        await History.destroy({ where: { id } })
        res.send('success')
    } catch {
        res.status(500).send('Unable to delete the profile')
    }
})

export default router
