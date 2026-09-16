import { Router } from 'express'
import { auth } from '../middlewares/auth.middleware'
import { USER_ROLES } from '../types/constants'
import Profile from '../db/profile'
import History from '../db/history'
import { Op, QueryTypes } from 'sequelize'
import { sequelize } from '../db'
import {
    getPeriodBoundsPacific,
    orderUtcIsoInclusive,
    parseEndDateQueryPacific,
    parseStartDateQueryPacific,
    parseUtcIsoBound,
    STATISTICS_TIMEZONE,
} from '../utils/statisticsPacific'
import {
    buildOrderedBucketKeys,
    formatBucketLabel,
    humanizeBucket,
    profileDataKey,
    rowToBucketKey,
    type TimeSeriesBucket,
} from '../utils/statisticsTimeSeries'
import {
    aggregateHistoryCountsByProfileId,
    buildProfilesByName,
    fetchUnlinkedHistoryTimeRows,
    NOT_CALENDAR_IMPORT_SQL,
    parseResumeNameField,
    pickProfileIdForName,
} from '../utils/historyStatsAttribution'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'

const router = Router()

/**
 * SQLite persists `createdAt` as strings like `2026-04-22 12:00:00.000 +00:00`.
 * Comparing those to ISO bounds with `T` (`2026-04-22T07:00:00.000Z`) uses ASCII order,
 * so same-calendar-day rows incorrectly fail `createdAt >= start` (space < `T`).
 * `datetime()` parses both sides for real ordering.
 */
function sqlHistoryCreatedAtGte(): string {
    return sequelize.getDialect() === 'sqlite'
        ? 'datetime(createdAt) >= datetime(?)'
        : 'createdAt >= ?'
}

function sqlHistoryCreatedAtLte(): string {
    return sequelize.getDialect() === 'sqlite'
        ? 'datetime(createdAt) <= datetime(?)'
        : 'createdAt <= ?'
}

function isManagerRole(user: { role?: string }): boolean {
    return (
        String(user?.role ?? '')
            .trim()
            .toUpperCase() === USER_ROLES.MANAGER
    )
}

/** `assignedProfileUserOnly=1` → limit profiles to those with any profile user assigned. */
function parseAssignedProfileUserOnly(
    raw: string | string[] | undefined
): boolean {
    if (raw === undefined) return false
    const s = String(Array.isArray(raw) ? raw[0] : raw)
        .trim()
        .toLowerCase()
    return s === '1' || s === 'true' || s === 'yes'
}

/**
 * If a specific profile user is in the query, filter to it; else if
 * `assignedOnly`, keep only profiles that have a profile user assigned.
 */
function applyProfileUserIndexFilters(
    filters: Record<string, unknown>[],
    profileUserIndexRaw: string | string[] | undefined,
    assignedOnly: boolean
): void {
    if (
        profileUserIndexRaw !== undefined &&
        profileUserIndexRaw !== null &&
        String(profileUserIndexRaw).trim() !== ''
    ) {
        const n = normalizeProfileUserIndex(String(profileUserIndexRaw).trim())
        if (n !== null) {
            filters.push({ profileUserIndex: n })
        }
        return
    }
    if (assignedOnly) {
        filters.push({ profileUserIndex: { [Op.not]: null } })
    }
}

/**
 * Bid counts over time by profile (manager). Buckets: hour, day, or month in LA (client sends `bucket`).
 */
router.get('/time-series', auth, async (req: any, res) => {
    try {
        const {
            startAt,
            endAt,
            timeZone: timeZoneRaw,
            profileUserIndex: profileUserIndexRaw,
            assignedProfileUserOnly: assignedProfileUserOnlyRaw,
            bucket: bucketRaw,
        } = req.query
        const user = req.user
        if (!isManagerRole(user)) {
            return res.status(403).send('Only MANAGER can access statistics')
        }

        if (
            typeof timeZoneRaw === 'string' &&
            timeZoneRaw.trim() !== '' &&
            timeZoneRaw.trim() !== STATISTICS_TIMEZONE
        ) {
            return res
                .status(400)
                .send(
                    `Unsupported timeZone; statistics use ${STATISTICS_TIMEZONE} (PST/PDT)`
                )
        }

        if (
            typeof startAt !== 'string' ||
            startAt.trim() === '' ||
            typeof endAt !== 'string' ||
            endAt.trim() === ''
        ) {
            return res
                .status(400)
                .send('startAt and endAt are required for time-series')
        }

        const sa = parseUtcIsoBound(String(startAt))
        const ea = parseUtcIsoBound(String(endAt))
        if (!sa || !ea) {
            return res
                .status(400)
                .send('Invalid startAt or endAt (use UTC ISO-8601)')
        }
        const { startIso, endIso } = orderUtcIsoInclusive(sa, ea)

        const bucketStr = String(bucketRaw ?? 'day').toLowerCase()
        const bucket: TimeSeriesBucket =
            bucketStr === 'hour' || bucketStr === 'day' || bucketStr === 'month'
                ? bucketStr
                : 'day'

        const filters: Record<string, unknown>[] = []
        switch (user.role) {
            case USER_ROLES.USER:
                filters.push({ userId: user.id })
                break
            case USER_ROLES.GUEST:
                filters.push({ guestId: user.id })
                break
            case USER_ROLES.BIDDER:
                filters.push({ bidderId: user.id })
                break
        }

        applyProfileUserIndexFilters(
            filters,
            profileUserIndexRaw,
            parseAssignedProfileUserOnly(assignedProfileUserOnlyRaw)
        )

        const profileWhere =
            filters.length > 0 ? { [Op.and]: filters } : {}

        const profiles = await Profile.findAll({
            where: profileWhere,
            attributes: ['id', 'name', 'profileUserIndex', 'userId'],
            order: [['name', 'ASC']],
        })

        const ids = profiles.map((p) => p.getDataValue('id') as number)
        if (ids.length === 0) {
            return res.json({
                bucket,
                granularity: humanizeBucket(bucket),
                profiles: [],
                points: [],
            })
        }

        const tableSql = History.tableName ?? 'histories'
        const placeholders = ids.map(() => '?').join(',')
        const whereSql = `profileId IN (${placeholders}) AND ${sqlHistoryCreatedAtGte()} AND ${sqlHistoryCreatedAtLte()} AND ${NOT_CALENDAR_IMPORT_SQL}`
        const replacements: Array<number | string> = [
            ...ids,
            startIso,
            endIso,
        ]

        const historyRows = await sequelize.query<{
            profileId: number
            createdAt: string | Date
        }>(
            `SELECT profileId, createdAt FROM ${tableSql} WHERE ${whereSql}`,
            { replacements, type: QueryTypes.SELECT }
        )

        const keys = buildOrderedBucketKeys(startIso, endIso, bucket)
        const counts = new Map<string, Map<number, number>>()
        for (const k of keys) {
            const inner = new Map<number, number>()
            for (const id of ids) inner.set(id, 0)
            counts.set(k, inner)
        }

        for (const row of historyRows) {
            const k = rowToBucketKey(row.createdAt, bucket)
            const inner = counts.get(k)
            if (!inner) continue
            const pid = Number(row.profileId)
            if (!ids.includes(pid)) continue
            inner.set(pid, (inner.get(pid) ?? 0) + 1)
        }

        const byNameIndex = buildProfilesByName(profiles)
        const unlinkedTime = await fetchUnlinkedHistoryTimeRows(
            tableSql,
            startIso,
            endIso
        )
        for (const u of unlinkedTime) {
            const n = parseResumeNameField(u.resume)
            if (!n) continue
            const pid = pickProfileIdForName(
                n,
                Number.isFinite(u.historyUserId) ? u.historyUserId : 0,
                byNameIndex
            )
            if (pid == null || !ids.includes(pid)) continue
            const k = rowToBucketKey(u.createdAt, bucket)
            const inner = counts.get(k)
            if (!inner) continue
            inner.set(pid, (inner.get(pid) ?? 0) + 1)
        }

        const profileList = profiles.map((p) => ({
            profileId: p.getDataValue('id') as number,
            profileName: String(p.getDataValue('name') ?? ''),
            profileUserIndex: normalizeProfileUserIndex(
                p.getDataValue('profileUserIndex')
            ),
        }))

        const points = keys.map((key) => {
            const inner = counts.get(key)!
            const row: Record<string, string | number> = {
                bucketKey: key,
                label: formatBucketLabel(key, bucket),
            }
            for (const { profileId } of profileList) {
                row[profileDataKey(profileId)] = inner.get(profileId) ?? 0
            }
            return row
        })

        res.json({
            bucket,
            granularity: humanizeBucket(bucket),
            profiles: profileList,
            points,
        })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve time-series statistics')
    }
})

router.get('/', auth, async (req: any, res) => {
    try {
        const {
            profileName,
            period,
            start,
            end,
            startAt,
            endAt,
            timeZone: timeZoneRaw,
            profileUserIndex: profileUserIndexRaw,
            assignedProfileUserOnly: assignedProfileUserOnlyRaw,
        } = req.query
        const user = req.user
        if (!isManagerRole(user)) {
            return res.status(403).send('Only MANAGER can access statistics')
        }

        if (
            typeof timeZoneRaw === 'string' &&
            timeZoneRaw.trim() !== '' &&
            timeZoneRaw.trim() !== STATISTICS_TIMEZONE
        ) {
            return res
                .status(400)
                .send(
                    `Unsupported timeZone; statistics use ${STATISTICS_TIMEZONE} (PST/PDT)`
                )
        }

        const hasStartAt =
            typeof startAt === 'string' && startAt.trim() !== ''
        const hasEndAt = typeof endAt === 'string' && endAt.trim() !== ''
        if (hasStartAt !== hasEndAt) {
            return res
                .status(400)
                .send('startAt and endAt must both be provided together')
        }
        if (hasStartAt && hasEndAt) {
            const sa = parseUtcIsoBound(String(startAt))
            const ea = parseUtcIsoBound(String(endAt))
            if (!sa || !ea) {
                return res.status(400).send('Invalid startAt or endAt (use UTC ISO-8601)')
            }
        }

        const filters: Record<string, unknown>[] = []

        switch (user.role) {
            case USER_ROLES.USER:
                filters.push({ userId: user.id })
                break
            case USER_ROLES.GUEST:
                filters.push({ guestId: user.id })
                break
            case USER_ROLES.BIDDER:
                filters.push({ bidderId: user.id })
                break
        }

        if (!isManagerRole(user)) {
            filters.push({
                [Op.or]: [{ show: true }, { show: { [Op.is]: null } }],
            })
        }

        if (typeof profileName === 'string' && profileName.trim() !== '') {
            filters.push({
                name: { [Op.like]: `%${profileName.trim()}%` },
            })
        }

        applyProfileUserIndexFilters(
            filters,
            profileUserIndexRaw,
            parseAssignedProfileUserOnly(assignedProfileUserOnlyRaw)
        )

        const profileWhere =
            filters.length > 0 ? { [Op.and]: filters } : {}

        const profiles = await Profile.findAll({
            where: profileWhere,
            attributes: ['id', 'name', 'profileUserIndex', 'userId'],
            order: [['name', 'ASC']],
        })

        const ids = profiles.map((p) => p.getDataValue('id') as number)

        let startIso: string | null = null
        let endIso: string | null = null

        /** UTC ISO range from client (Pacific-derived bounds); parsed with dayjs.utc only. */
        if (
            typeof startAt === 'string' &&
            startAt.trim() !== '' &&
            typeof endAt === 'string' &&
            endAt.trim() !== ''
        ) {
            const sa = parseUtcIsoBound(String(startAt))
            const ea = parseUtcIsoBound(String(endAt))
            if (sa && ea) {
                const ordered = orderUtcIsoInclusive(sa, ea)
                startIso = ordered.startIso
                endIso = ordered.endIso
            }
        }

        if (startIso === null && endIso === null) {
            const periodDays =
                typeof period === 'string' ? Number.parseInt(period, 10) : NaN
            if (Number.isFinite(periodDays) && periodDays > 0) {
                const bounds = getPeriodBoundsPacific(periodDays)
                if (bounds) {
                    startIso = bounds.startIso
                    endIso = bounds.endIso
                }
            }

            if (typeof start === 'string' && start.trim() !== '') {
                const parsed = parseStartDateQueryPacific(start)
                if (parsed) {
                    startIso = parsed
                }
            }

            if (typeof end === 'string' && end.trim() !== '') {
                const parsed = parseEndDateQueryPacific(end)
                if (parsed) {
                    endIso = parsed
                }
            }

            if (startIso != null && endIso != null) {
                const ordered = orderUtcIsoInclusive(startIso, endIso)
                startIso = ordered.startIso
                endIso = ordered.endIso
            }
        }

        const countMap =
            ids.length > 0
                ? await aggregateHistoryCountsByProfileId(
                      profiles,
                      startIso,
                      endIso
                  )
                : new Map<number, number>()

        const rows = profiles.map((p) => {
            const id = p.getDataValue('id') as number
            return {
                profileId: id,
                profileName: p.getDataValue('name') as string,
                profileUserIndex: normalizeProfileUserIndex(
                    p.getDataValue('profileUserIndex')
                ),
                historyCount: countMap.get(id) ?? 0,
            }
        })

        rows.sort(
            (a, b) =>
                b.historyCount - a.historyCount ||
                a.profileName.localeCompare(b.profileName)
        )

        res.send(rows)
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve statistics')
    }
})

export default router
