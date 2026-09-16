import { Op, QueryTypes } from 'sequelize'
import { sequelize } from '../db'
import History from '../db/history'
import { CALENDAR_IMPORT_REQUIREMENTS_TAG } from '../types/constants'

const CAL_TAG_ESC = CALENDAR_IMPORT_REQUIREMENTS_TAG.replace(/'/g, "''")
const CAL_TAG_LEN = CALENDAR_IMPORT_REQUIREMENTS_TAG.length
/** Exclude calendar OpenAI imports from bid/stat counts (same as History list). */
export const NOT_CALENDAR_IMPORT_SQL = `(SUBSTR(TRIM(COALESCE(requirements,'')),1,${CAL_TAG_LEN}) != '${CAL_TAG_ESC}' OR LENGTH(TRIM(COALESCE(requirements,''))) < ${CAL_TAG_LEN})`

export type TProfileIdNameUser = {
    id: number
    name: string
    userId: number | null
}

/**
 * Build map: normalized profile name (trimmed) -> profiles with that name.
 */
export function buildProfilesByName(
    profiles: { getDataValue(k: string): unknown }[]
): Map<string, TProfileIdNameUser[]> {
    const m = new Map<string, TProfileIdNameUser[]>()
    for (const p of profiles) {
        const name = String(p.getDataValue('name') ?? '').trim()
        if (name === '') continue
        const id = Number(p.getDataValue('id'))
        const u = p.getDataValue('userId')
        const userId = u == null || u === '' ? null : Number(u)
        if (!Number.isFinite(id)) continue
        const row: TProfileIdNameUser = { id, name, userId }
        if (!m.has(name)) m.set(name, [])
        m.get(name)!.push(row)
    }
    return m
}

/**
 * When multiple profiles share a name, prefer the one whose `userId` matches
 * the history row’s `userId`, else the first row (stable list order from DB).
 */
export function pickProfileIdForName(
    resumeName: string,
    historyUserId: number,
    byName: Map<string, TProfileIdNameUser[]>
): number | null {
    const key = String(resumeName).trim()
    if (key === '') return null
    const list = byName.get(key)
    if (!list || list.length === 0) return null
    if (list.length === 1) return list[0]!.id
    const m = list.find(
        (p) => p.userId != null && p.userId === historyUserId
    )
    if (m) return m.id
    return list[0]!.id
}

export function parseResumeNameField(resume: string | null | undefined): string | null {
    if (typeof resume !== 'string' || !resume.trim()) return null
    try {
        const o = JSON.parse(resume) as { name?: unknown }
        if (typeof o.name === 'string' && o.name.trim()) return o.name.trim()
    } catch {
        // ignore
    }
    return null
}

export type UnlinkedGroupRow = {
    historyUserId: number
    resumeName: string
    c: number | string
}

/**
 * Adds counts from `histories` rows with `profileId` NULL, attributed to a profile
 * by JSON `name` in `resume` (and history `userId` for disambiguation).
 */
export function addUnlinkedGroupsToCountMap(
    countMap: Map<number, number>,
    groups: UnlinkedGroupRow[],
    byName: Map<string, TProfileIdNameUser[]>
): void {
    for (const g of groups) {
        const n = String(g.resumeName ?? '').trim()
        if (n === '') continue
        const uid = Number(g.historyUserId)
        const pid = pickProfileIdForName(
            n,
            Number.isFinite(uid) ? uid : 0,
            byName
        )
        if (pid == null) continue
        const add = Math.floor(Number(g.c))
        if (!Number.isFinite(add) || add < 0) continue
        countMap.set(pid, (countMap.get(pid) ?? 0) + add)
    }
}

/**
 * Fetches (userId, resumeName, count) for rows with null profileId in [startIso, endIso].
 * Uses `json_extract` on SQLite; for other dialects, loads rows and aggregates in process.
 */
export async function fetchUnlinkedHistoryNameGroups(
    tableSql: string,
    startIso: string | null,
    endIso: string | null
): Promise<UnlinkedGroupRow[]> {
    const d = sequelize.getDialect()
    if (d === 'sqlite') {
        const parts: string[] = ['profileId IS NULL']
        const rep: (string | number)[] = []
        if (startIso != null) {
            parts.push('datetime(createdAt) >= datetime(?)')
            rep.push(String(startIso))
        }
        if (endIso != null) {
            parts.push('datetime(createdAt) <= datetime(?)')
            rep.push(String(endIso))
        }
        parts.push(NOT_CALENDAR_IMPORT_SQL)
        const nExpr = "json_extract(resume, '$.name')"
        const sql = `
            SELECT
                userId AS historyUserId,
                TRIM(COALESCE(${nExpr}, '')) AS resumeName,
                COUNT(*) AS c
            FROM ${tableSql}
            WHERE ${parts.join(' AND ')}
            GROUP BY userId, ${nExpr}
            HAVING TRIM(COALESCE(${nExpr}, '')) != ''
        `
        return sequelize.query<UnlinkedGroupRow>(sql, {
            replacements: rep,
            type: QueryTypes.SELECT,
        })
    }

    const andParts: any[] = [
        { profileId: { [Op.is]: null } },
        sequelize.literal(NOT_CALENDAR_IMPORT_SQL),
    ]
    if (startIso != null) {
        andParts.push({ createdAt: { [Op.gte]: startIso } })
    }
    if (endIso != null) {
        andParts.push({ createdAt: { [Op.lte]: endIso } })
    }

    const rows = await History.findAll({
        where: { [Op.and]: andParts },
        attributes: ['userId', 'resume'],
        raw: true,
    })

    const acc = new Map<string, number>()
    for (const r of rows as { userId?: number; resume?: string }[]) {
        const n = parseResumeNameField(r.resume)
        if (!n) continue
        const uid = Number(r.userId ?? 0)
        const k = `${uid}\t${n}`
        acc.set(k, (acc.get(k) ?? 0) + 1)
    }
    const out: UnlinkedGroupRow[] = []
    for (const [k, c] of acc) {
        const tab = k.indexOf('\t')
        if (tab < 0) continue
        const u = k.slice(0, tab)
        const name = k.slice(tab + 1)
        out.push({
            historyUserId: Number.parseInt(String(u), 10),
            resumeName: name,
            c,
        })
    }
    return out
}

export type UnlinkedTimeRow = {
    historyUserId: number
    resume: string | null
    createdAt: string | Date
}

/**
 * Unlinked `histories` rows in a date range (for time-series bucketing).
 */
export async function fetchUnlinkedHistoryTimeRows(
    tableSql: string,
    startIso: string,
    endIso: string
): Promise<UnlinkedTimeRow[]> {
    const d = sequelize.getDialect()
    if (d === 'sqlite') {
        const rep: (string | number)[] = []
        const parts: string[] = [
            'profileId IS NULL',
            'datetime(createdAt) >= datetime(?)',
            'datetime(createdAt) <= datetime(?)',
            NOT_CALENDAR_IMPORT_SQL,
        ]
        rep.push(String(startIso), String(endIso))
        const sql = `
            SELECT userId AS historyUserId, resume, createdAt
            FROM ${tableSql}
            WHERE ${parts.join(' AND ')}
        `
        return sequelize.query<UnlinkedTimeRow>(sql, {
            replacements: rep,
            type: QueryTypes.SELECT,
        })
    }
    const rows = await History.findAll({
        where: {
            [Op.and]: [
                { profileId: { [Op.is]: null } },
                { createdAt: { [Op.between]: [startIso, endIso] } },
                sequelize.literal(NOT_CALENDAR_IMPORT_SQL),
            ],
        },
        attributes: ['userId', 'resume', 'createdAt'],
        raw: true,
    })
    return (rows as { userId?: number; resume?: string; createdAt?: Date | string }[]).map(
        (r) => ({
            historyUserId: Number(r.userId ?? 0),
            resume: r.resume ?? null,
            createdAt: r.createdAt as string | Date,
        })
    )
}

/**
 * Bid/history row counts from `histories` per profile: linked via `profileId` plus
 * unlinked rows resolved by `resume` JSON `name` → `profiles.name`.
 */
export async function aggregateHistoryCountsByProfileId(
    profileRows: { getDataValue(k: string): unknown }[],
    startIso: string | null,
    endIso: string | null
): Promise<Map<number, number>> {
    const tableSql = History.tableName || 'histories'
    const ids = profileRows
        .map((p) => Number(p.getDataValue('id')))
        .filter((n) => Number.isFinite(n)) as number[]
    const countMap = new Map<number, number>()
    if (ids.length === 0) {
        return countMap
    }
    const dialect = sequelize.getDialect()
    const gte =
        dialect === 'sqlite'
            ? 'datetime(createdAt) >= datetime(?)'
            : 'createdAt >= ?'
    const lte =
        dialect === 'sqlite'
            ? 'datetime(createdAt) <= datetime(?)'
            : 'createdAt <= ?'
    const ph = ids.map(() => '?').join(',')
    let whereSql = `profileId IN (${ph})`
    const rep: (string | number)[] = [...ids]
    if (startIso != null) {
        whereSql += ` AND ${gte}`
        rep.push(String(startIso))
    }
    if (endIso != null) {
        whereSql += ` AND ${lte}`
        rep.push(String(endIso))
    }
    whereSql += ` AND ${NOT_CALENDAR_IMPORT_SQL}`
    const countRows = await sequelize.query<{
        profileId: number
        historyCount: number | string
    }>(`SELECT profileId, COUNT(*) AS historyCount FROM ${tableSql} WHERE ${whereSql} GROUP BY profileId`, {
        replacements: rep,
        type: QueryTypes.SELECT,
    })
    for (const r of countRows) {
        countMap.set(Number(r.profileId), Number(r.historyCount))
    }
    const byName = buildProfilesByName(profileRows)
    const unlinked = await fetchUnlinkedHistoryNameGroups(
        tableSql,
        startIso,
        endIso
    )
    addUnlinkedGroupsToCountMap(countMap, unlinked, byName)
    return countMap
}
