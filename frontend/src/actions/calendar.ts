import axios, { type AxiosResponse } from 'axios'

export type FetchGoogleCalendarResponse = {
    ok: boolean
    relativePath?: string
    filePath?: string
    eventCount?: number
    /** Rows written to `histories` for Calendar → Schedule Table (iCal fetch only). */
    scheduleRowsWritten?: number
    scheduleImportError?: string
    error?: string
}

export const fetchGoogleCalendarForProfile = async (
    profileId: number
): Promise<FetchGoogleCalendarResponse> => {
    const res: AxiosResponse<FetchGoogleCalendarResponse> = await axios.post(
        `/api/calendar/fetch/${profileId}`
    )
    return res.data
}

export type ClearCalendarResponse = {
    ok: boolean
    relativePath?: string
    fileRemoved?: boolean
    removedHistories?: number
    error?: string
}

export const clearCalendarForProfile = async (
    profileId: number
): Promise<ClearCalendarResponse> => {
    const res = await axios.post<ClearCalendarResponse>(
        `/api/calendar/clear/${profileId}`
    )
    return res.data
}

export type ClearAllCalendarResponse = {
    ok: boolean
    removedFiles?: number
    removedHistories?: number
    error?: string
}

export const clearAllCalendarData = async (): Promise<ClearAllCalendarResponse> => {
    const res = await axios.post<ClearAllCalendarResponse>(
        '/api/calendar/clear-all'
    )
    return res.data
}

export type ProfileCalendarEvent = {
    uid: string
    summary: string
    description: string
    location: string
    dtstart: string
    dtend: string
    status: string
    organizer: string
}

export type ProfileCalendarEventsResponse = {
    ok: boolean
    profile?: {
        id: number
        name: string
    }
    eventCount?: number
    events?: ProfileCalendarEvent[]
    meta?: Record<string, unknown> | null
    error?: string
}

export const getCalendarEventsForProfile = async (
    profileId: number
): Promise<ProfileCalendarEventsResponse> => {
    const res = await axios.get<ProfileCalendarEventsResponse>(
        `/api/calendar/events/${profileId}`
    )
    return res.data
}
