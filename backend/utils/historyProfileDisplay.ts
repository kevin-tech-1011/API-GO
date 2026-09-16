import { Op } from 'sequelize'
import Profile from '../db/profile'
import { USER_ROLES } from '../types/constants'

/**
 * When `profileId` is null (legacy rows) or the join did not return a name,
 * resolve the display name from the `profiles` table by matching the resume
 * JSON `name` (and scoping to visible profiles for non-managers).
 */
function parseResumeName(resume: unknown): string | null {
    if (typeof resume !== 'string' || !resume.trim()) return null
    try {
        const o = JSON.parse(resume) as { name?: unknown }
        if (typeof o.name === 'string' && o.name.trim()) return o.name.trim()
    } catch {
        // ignore
    }
    return null
}

/** Align with history.route profile include: only MANAGER bypasses the `show` filter. */
function isManagerUser(role: string | undefined): boolean {
    return (
        String(role ?? '')
            .toUpperCase()
            .trim() === String(USER_ROLES.MANAGER).toUpperCase()
    )
}

/**
 * Picks a profile among same-named rows: prefer the profile owned by the
 * history's user, then a visible one, then the first (for managers) / resume
 * name fallback.
 */
function pickDisplayProfile(
    resumeName: string,
    historyUserId: number,
    userRole: string | undefined,
    matches: Awaited<ReturnType<typeof Profile.findAll>>
): { name: string; id?: number } {
    if (matches.length === 0) {
        return { name: resumeName }
    }

    const isHidden = (p: (typeof matches)[0]) => {
        const s = p.getDataValue('show') as boolean | null | number | undefined
        return s === false || s === 0
    }
    const canBypassHidden = isManagerUser(userRole)
    const byHistoryUser = matches.find(
        (p) => p.getDataValue('userId') === historyUserId
    )
    if (byHistoryUser && (canBypassHidden || !isHidden(byHistoryUser))) {
        return {
            name: byHistoryUser.getDataValue('name') as string,
            id: byHistoryUser.getDataValue('id') as number,
        }
    }
    if (!canBypassHidden) {
        const visible = matches.find((p) => !isHidden(p))
        if (visible) {
            return {
                name: visible.getDataValue('name') as string,
                id: visible.getDataValue('id') as number,
            }
        }
        return { name: '—' }
    }
    const p = matches[0] as (typeof matches)[0]
    return { name: p.getDataValue('name') as string, id: p.getDataValue('id') as number }
}

/**
 * Returns plain history objects with `profile.name` set for list/detail APIs.
 */
export async function toPlainHistoryRows(
    rows: { toJSON: () => Record<string, unknown> }[],
    user: { id: number; role?: string }
): Promise<Record<string, unknown>[]> {
    if (!rows.length) return []
    const userRole = user.role
    const needs: {
        id: number
        resumeName: string
        historyUserId: number
    }[] = []

    for (const row of rows) {
        const o = row.toJSON() as {
            id?: number
            userId?: number
            resume?: unknown
            profile?: { name?: string } | null
        }
        const fromJoin = o.profile?.name
        if (typeof fromJoin === 'string' && fromJoin.trim() !== '') continue
        const n = parseResumeName(o.resume)
        if (n != null && o.id != null) {
            needs.push({ id: o.id, resumeName: n, historyUserId: o.userId ?? 0 })
        }
    }

    if (!needs.length) {
        return rows
            .map((r) => r.toJSON() as Record<string, unknown>)
            .map((plain) => sanitizeHistoryProfileForRequester(plain, userRole))
    }

    const uniqueNames = [...new Set(needs.map((x) => x.resumeName))]
    const allMatches = await Profile.findAll({
        where: { name: { [Op.in]: uniqueNames } },
        attributes: ['id', 'name', 'userId', 'show'],
    })
    const byName = (name: string) =>
        allMatches.filter((p) => p.getDataValue('name') === name)

    const byHistoryId = new Map<number, { name: string; id?: number }>()
    for (const item of needs) {
        if (byHistoryId.has(item.id)) continue
        const m = byName(item.resumeName)
        byHistoryId.set(
            item.id,
            pickDisplayProfile(item.resumeName, item.historyUserId, userRole, m)
        )
    }

    return rows
        .map((row) => {
            const o = row.toJSON() as Record<string, unknown> & {
                id?: number
                profile?: { name?: string; id?: number } | null
            }
            const extra = o.id != null ? byHistoryId.get(o.id) : undefined
            if (!extra) return o
            const existing = o.profile
            if (
                existing &&
                typeof existing.name === 'string' &&
                existing.name.trim() !== ''
            ) {
                return o
            }
            return {
                ...o,
                profile: {
                    ...existing,
                    name: extra.name,
                    id: extra.id ?? (existing as { id?: number } | null)?.id,
                },
            }
        })
        .map((plain) => sanitizeHistoryProfileForRequester(plain, userRole))
}

/** Strip `show` from JSON; non-managers never see hidden profile names/slots in the payload. */
function sanitizeHistoryProfileForRequester(
    plain: Record<string, unknown>,
    role: string | undefined
): Record<string, unknown> {
    const profile = plain.profile as
        | { show?: unknown; name?: string; profileUserIndex?: unknown }
        | null
        | undefined
    if (profile == null || typeof profile !== 'object') return plain
    const { show, ...rest } = profile as Record<string, unknown>
    if (isManagerUser(role)) {
        return { ...plain, profile: rest }
    }
    if (show === false || show === 0) {
        return {
            ...plain,
            profile: { name: '—', profileUserIndex: null },
        }
    }
    return { ...plain, profile: rest }
}
