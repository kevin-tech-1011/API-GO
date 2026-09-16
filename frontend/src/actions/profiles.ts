import axios, { AxiosError, AxiosResponse } from 'axios'
import { TProfile, TResume } from '../types'

export const listProfiles = async () => {
    const res: AxiosResponse<TProfile[]> = await axios.get(`/api/profile`)
    return res.data
}

export const getProfile = async (id: number) => {
    const res: AxiosResponse<TProfile> = await axios.get(`/api/profile/${id}`)
    return res.data
}

export const createProfile = async (profile: TProfile) => {
    const res = await axios.post(`/api/profile`, { data: profile })
    return res
}

export const updateProfile = async (profile: TProfile) => {
    const res = await axios.put(`/api/profile`, { data: profile })
    return res
}

export const deleteProfile = async (id: number) => {
    await axios.delete(`/api/profile/${id}`)
    return 'success'
}

function resumeGenerationErrorMessage(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const ax = err as AxiosError<{ error?: string; message?: string }>
        const body = ax.response?.data
        const fromBody = body?.error ?? body?.message
        if (typeof fromBody === 'string' && fromBody.trim() !== '') {
            return fromBody
        }
        if (ax.response?.status === 401) {
            return 'Session expired or not signed in. Please log in and try again.'
        }
        if (ax.response?.status === 404) {
            return 'Profile not found or you do not have access.'
        }
    }
    return 'Failed to generate resume'
}

export const onGenerateResume = async (
    id: number,
    jd: string,
    additionalInfo: string
): Promise<TResume> => {
    try {
        const { data }: AxiosResponse<{ content?: string; error?: string }> =
            await axios.post(`/api/openai/generate-resume`, {
                id,
                jobDescription: jd,
                additionalInfo,
            })
        const raw = data?.content
        if (raw == null || raw === '') {
            throw new Error(
                data?.error ||
                    'Resume generation returned no content. Try again later.'
            )
        }
        try {
            return JSON.parse(raw) as TResume
        } catch {
            throw new Error('Invalid resume data from server. Try again.')
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(resumeGenerationErrorMessage(err))
        }
        if (err instanceof Error) {
            throw err
        }
        throw new Error('Failed to generate resume')
    }
}
