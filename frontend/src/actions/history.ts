import axios, { AxiosResponse } from 'axios'
import type { THistory } from '../types'

interface IListHistoryParams {
    cname?: string
    pname?: string
    position?: string
    profileUserIndex?: number
    current?: number
    pageSize?: number
    /** When true, only rows with at least one Status checkbox selected (non-empty statusStages). */
    schedule?: boolean
    /** Manager: only calendar-import rows (Calendar → Schedule Table). */
    calendarImport?: boolean
}

export type THistoryProfileStat = {
    profileId: number
    profileName: string
    bidCount: number
}

export const listHistoryStatsByProfile = async (pname?: string) => {
    const params = new URLSearchParams()
    if (pname != null && pname.trim() !== '') params.set('pname', pname.trim())
    const res = await axios.get<{ stats: THistoryProfileStat[] }>(
        `/api/history/stats/by-profile?${params.toString()}`
    )
    return res.data
}

export const listHistory = async ({
    cname,
    pname,
    position,
    profileUserIndex,
    current,
    pageSize,
    schedule,
    calendarImport,
}: IListHistoryParams) => {
    const params = new URLSearchParams()
    const c = cname != null ? String(cname).trim() : ''
    const p = pname != null ? String(pname).trim() : ''
    const pos = position != null ? String(position).trim() : ''
    const pui =
        profileUserIndex != null && Number.isFinite(Number(profileUserIndex))
            ? String(Number(profileUserIndex))
            : ''
    if (c !== '') params.set('cname', c)
    if (p !== '') params.set('pname', p)
    if (pos !== '') params.set('position', pos)
    if (pui !== '') params.set('profileUserIndex', pui)
    if (current != null) params.set('current', String(current))
    if (pageSize != null) params.set('pageSize', String(pageSize))
    if (schedule) params.set('schedule', '1')
    if (calendarImport) params.set('calendarImport', '1')
    const q = params.toString()
    const res = await axios.get<{ count: number; rows: THistory[] }>(
        `/api/history${q ? `?${q}` : ''}`
    )
    return res.data
}

export const getHistory = async (id: number) => {
    const res: AxiosResponse<THistory> = await axios.get(`/api/history/${id}`)
    return res.data
}

export const createHistory = async (history: THistory) => {
    const res = await axios.post(`/api/history`, { data: history })
    return res
}

export const updateHistory = async (
    history: Partial<THistory> & { id: number }
): Promise<THistory> => {
    const res = await axios.put<THistory>(`/api/history`, { data: history })
    return res.data
}

export const deleteHistory = async (id: number) => {
    await axios.delete(`/api/history/${id}`)
    return 'success'
}