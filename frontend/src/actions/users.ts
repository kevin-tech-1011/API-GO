import axios from 'axios'
import { TUser } from '../types'

export const getUserList = async () => {
    try {
        const { data } = await axios.get('/api/user')
        return (data?.users as TUser[]) || []
    } catch {
        throw new Error('Unable to get user list')
    }
}

export const updateUser = async (user: TUser) => {
    try {
        const { data } = await axios.post('/api/user', { user })
        return data
    } catch {
        throw new Error('Unable to update the user')
    }
}

export const deleteUser = async (id: number) => {
    try {
        await axios.delete(`/api/user/${id}`)
    } catch {
        throw new Error('Unable to delete this user')
    }
}

export const changePassword = async (id: number, password: string) => {
    try {
        await axios.post(`/api/user/${id}/change-password`, { password })
    } catch {
        throw new Error('Unable to change the password')
    }
}