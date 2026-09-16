import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react'
import { TUser } from '@/types'
import axios, { AxiosResponse } from 'axios'
import { useNavigate } from 'react-router-dom'

interface IAuthContext {
    user: TUser | null
    setUser: any
    login: (
        email: string,
        password: string,
        authUrl?: string
    ) => Promise<unknown>
    /** Clears token and user without navigating (e.g. login routes). */
    clearSession: () => void
    logout: () => void
}

const AuthContext = createContext<IAuthContext>({
    user: null,
    setUser: () => {},
    login: async () => {
        throw new Error('useAuth must be used within AuthProvider')
    },
    clearSession: () => {},
    logout: () => {},
})

export const AuthProvider = ({ children }: { children: any }) => {
    const [user, setUser] = useState<TUser | null>(null)
    const navigate = useNavigate()

    const login = useCallback(
        async (
            email: string,
            password: string,
            authUrl: string = '/api/auth'
        ) => {
            const resp: AxiosResponse = await axios.post(authUrl, {
                email,
                password,
            })
            const { token, data } = resp.data
            if (data) {
                localStorage.setItem('token', token)
                axios.defaults.headers.common['Authorization'] =
                    `Bearer ${token}`
                setUser({
                    id: data.id,
                    email: data.email,
                    active: data.active,
                    note: data.note,
                    role: data.role,
                    path: Boolean(data.path),
                })
            }
            return resp.data
        },
        []
    )

    const clearSession = useCallback(() => {
        setUser(null)
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
    }, [])

    const logout = useCallback(() => {
        clearSession()
        navigate('/')
    }, [clearSession, navigate])

    const value = useMemo(
        () => ({
            user,
            setUser,
            login,
            clearSession,
            logout,
        }),
        [user, login, clearSession, logout]
    )

    return (
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    return useContext(AuthContext)
}
