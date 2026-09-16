import axios, { AxiosResponse } from 'axios'
import { STATISTICS_TIMEZONE } from '../utils/statisticsDateRange'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'

export type TBidTimeSeriesProfile = {
    profileId: number
    profileName: string
    /** `TProfileUser.id`; null/undefined when unset (chart may group as “Unassigned”). */
    profileUserIndex?: number | null
}

export type TBidTimeSeriesPoint = Record<string, string | number> & {
    bucketKey: string
    label: string
}

export type TBidTimeSeriesResponse = {
    bucket: 'hour' | 'day' | 'month'
    granularity: string
    profiles: TBidTimeSeriesProfile[]
    points: TBidTimeSeriesPoint[]
}

export type TProfileHistoryStat = {
    profileId: number
    profileName: string
    /** `TProfileUser.id`; null/undefined if unset. */
    profileUserIndex?: number | null
    historyCount: number
}

export type TProfileHistoryStatParams = {
    startAt: string
    endAt: string
    /** When set, restrict to profiles with this `profileUserIndex`. */
    profileUserIndex?: number
    /**
     * When true and `profileUserIndex` is not set, only profiles that have a profile
     * user assigned. Omit or false to include unassigned profiles.
     */
    assignedProfileUserOnly?: boolean
}

export type TBidTimeSeriesParams = TProfileHistoryStatParams & {
    bucket: 'hour' | 'day' | 'month'
}

export async function getBidTimeSeries(
    params: TBidTimeSeriesParams
): Promise<TBidTimeSeriesResponse> {
    const query = new URLSearchParams()
    query.set('timeZone', STATISTICS_TIMEZONE)
    query.set('startAt', params.startAt)
    query.set('endAt', params.endAt)
    query.set('bucket', params.bucket)
    const profileUserIndex = normalizeProfileUserIndex(params.profileUserIndex)
    if (profileUserIndex !== null) {
        query.set('profileUserIndex', String(profileUserIndex))
    }
    if (params.assignedProfileUserOnly) {
        query.set('assignedProfileUserOnly', '1')
    }
    const res: AxiosResponse<TBidTimeSeriesResponse> = await axios.get(
        `/api/statistics/time-series?${query.toString()}`
    )
    return res.data
}

export async function getProfileHistoryStats(
    params: TProfileHistoryStatParams
): Promise<TProfileHistoryStat[]> {
    const query = new URLSearchParams()
    query.set('timeZone', STATISTICS_TIMEZONE)
    query.set('startAt', params.startAt)
    query.set('endAt', params.endAt)
    const profileUserIndex = normalizeProfileUserIndex(params.profileUserIndex)
    if (profileUserIndex !== null) {
        query.set('profileUserIndex', String(profileUserIndex))
    }
    if (params.assignedProfileUserOnly) {
        query.set('assignedProfileUserOnly', '1')
    }
    const res: AxiosResponse<TProfileHistoryStat[]> = await axios.get(
        `/api/statistics?${query.toString()}`
    )
    return res.data
}
