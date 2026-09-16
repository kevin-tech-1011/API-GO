/**
 * `profiles.profileUserIndex` references `profileUsers.id`, which is a non-negative
 * integer assigned by the app (slot 0 = the original “Lemon”). Anything else is unset.
 */
export function normalizeProfileUserIndex(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
}
