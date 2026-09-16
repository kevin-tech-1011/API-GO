import type {
    TBidTimeSeriesProfile,
    TBidTimeSeriesResponse,
} from '@/actions/statistics'
import type { TProfileUserOption } from '@/components/ProfileUsersContext'
import { normalizeProfileUserIndex } from '@/utils/profileUserIndex'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/** Matches backend `profileDataKey` for chart `dataKey`s. */
export function statsProfileDataKey(profileId: number): string {
    return `p${profileId}`
}

/**
 * Synthetic profile ids for user-aggregated series. `USER_AGG_BASE_ID + profileUserIndex`
 * must not collide with real DB ids nor with the unassigned series, so unassigned sits
 * below the base rather than at a fixed offset above it (profile user ids are unbounded).
 */
const USER_AGG_BASE_ID = 900_000
const USER_AGG_UNASSIGNED_ID = 899_999

/**
 * One stacked/grouped series per profile user, plus “Unassigned” when any profile in
 * `raw` has no profile user. Buckets and labels match `raw`.
 */
export function aggregateBidTimeSeriesByProfileUser(
    raw: TBidTimeSeriesResponse,
    profileUserOptions: TProfileUserOption[]
): TBidTimeSeriesResponse {
    const hasUnassignedSlot = raw.profiles.some(
        (p) => normalizeProfileUserIndex(p.profileUserIndex) === null
    )

    const aggProfiles: TBidTimeSeriesProfile[] = profileUserOptions.map((o) => ({
        profileId: USER_AGG_BASE_ID + o.value,
        profileName: o.label,
        profileUserIndex: o.value,
    }))

    if (hasUnassignedSlot) {
        aggProfiles.push({
            profileId: USER_AGG_UNASSIGNED_ID,
            profileName: 'Unassigned',
            profileUserIndex: null,
        })
    }

    const points = raw.points.map((pt) => {
        const row: TBidTimeSeriesResponse['points'][number] = {
            bucketKey: String(pt.bucketKey),
            label: String(pt.label),
        }
        for (const o of profileUserOptions) {
            let sum = 0
            for (const p of raw.profiles) {
                if (p.profileUserIndex === o.value) {
                    sum += Number(pt[statsProfileDataKey(p.profileId)] ?? 0)
                }
            }
            row[statsProfileDataKey(USER_AGG_BASE_ID + o.value)] = sum
        }
        if (hasUnassignedSlot) {
            let sum = 0
            for (const p of raw.profiles) {
                if (normalizeProfileUserIndex(p.profileUserIndex) === null) {
                    sum += Number(pt[statsProfileDataKey(p.profileId)] ?? 0)
                }
            }
            row[statsProfileDataKey(USER_AGG_UNASSIGNED_ID)] = sum
        }
        return row
    })

    return {
        bucket: raw.bucket,
        granularity: raw.granularity,
        profiles: aggProfiles,
        points,
    }
}

/**
 * Keep only the profile whose name matches (case-insensitive, trimmed).
 * Used when Statistics “By name” chart is filtered to one profile.
 */
export function filterBidTimeSeriesByProfileName(
    raw: TBidTimeSeriesResponse,
    profileName: string
): TBidTimeSeriesResponse | null {
    const needle = profileName.trim().toLowerCase()
    if (needle === '') return raw
    const match = raw.profiles.find(
        (p) => p.profileName.trim().toLowerCase() === needle
    )
    if (!match) {
        return {
            bucket: raw.bucket,
            granularity: raw.granularity,
            profiles: [],
            points: raw.points.map((pt) => ({
                bucketKey: String(pt.bucketKey),
                label: String(pt.label),
            })),
        }
    }
    const key = statsProfileDataKey(match.profileId)
    const points = raw.points.map((pt) => ({
        bucketKey: String(pt.bucketKey),
        label: String(pt.label),
        [key]: Number(pt[key] ?? 0),
    }))
    return {
        bucket: raw.bucket,
        granularity: raw.granularity,
        profiles: [match],
        points,
    }
}

/** Legacy default bucket; prefer {@link chartBucketForStatisticsRange}. */
export function chartBucketForStatistics(): 'day' {
    return 'day'
}

/**
 * Bucket granularity from UTC ISO range (matches backend `buildOrderedBucketKeys` caps).
 */
export function chartBucketForStatisticsRange(
    startAtUtc: string,
    endAtUtc: string
): 'hour' | 'day' | 'month' {
    const start = dayjs.utc(startAtUtc)
    const end = dayjs.utc(endAtUtc)
    if (!start.isValid() || !end.isValid()) return 'day'
    const hours = end.diff(start, 'hour', true)
    const days = end.diff(start, 'day', true)
    if (hours <= 36) return 'hour'
    if (days <= 62) return 'day'
    return 'month'
}
