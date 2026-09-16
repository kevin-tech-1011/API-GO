/**
 * `TProfile.profileUserIndex` references `TProfileUser.id`: a non-negative integer
 * assigned by the backend. Anything else (blank, `null`, junk in a URL param) is unset.
 */
export function normalizeProfileUserIndex(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
}
