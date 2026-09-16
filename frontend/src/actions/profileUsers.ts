import axios, { AxiosResponse } from 'axios'
import type { TProfileUser } from '../types'

/** Backend sends plain-text errors (e.g. duplicate name); surface them verbatim. */
export function profileUserErrorMessage(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
        const body = err.response?.data
        if (typeof body === 'string' && body.trim() !== '') return body.trim()
        if (err.response?.status === 403) {
            return 'Only a manager can change the profile user list'
        }
    }
    return fallback
}

export const listProfileUsers = async (): Promise<TProfileUser[]> => {
    const res: AxiosResponse<TProfileUser[]> =
        await axios.get('/api/profile-user')
    return Array.isArray(res.data) ? res.data : []
}

export const createProfileUser = async (
    name: string
): Promise<TProfileUser> => {
    const res: AxiosResponse<TProfileUser> = await axios.post(
        '/api/profile-user',
        { name }
    )
    return res.data
}

export const updateProfileUser = async (
    id: number,
    name: string
): Promise<TProfileUser> => {
    const res: AxiosResponse<TProfileUser> = await axios.put(
        `/api/profile-user/${id}`,
        { name }
    )
    return res.data
}

export const deleteProfileUser = async (id: number): Promise<void> => {
    await axios.delete(`/api/profile-user/${id}`)
}
