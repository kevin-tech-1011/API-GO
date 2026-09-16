import axios from 'axios'
import { useAuth } from '../AuthContext'
import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import Header from '../Header'
import { getUserList } from '@/actions/users'
import { useDispatch } from 'react-redux'
import { setUserList } from '@/redux/userSlice'
import { isAdminAccessRole } from '@/types/constants'
import { ProfileUsersProvider } from '../ProfileUsersContext'

interface ISplashProvider {
    children: any
}

const SplashProvider = ({ children }: ISplashProvider) => {
    const [loading, setLoading] = useState(true)
    const dispatch = useDispatch()
    const auth = useAuth()

    const loadUser = async () => {
        const token = localStorage.getItem('token')
        if (token) {
            try {
                const { data } = await axios.post(`/api/auth/me`, null, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
                if (data) {
                    axios.defaults.headers.common['Authorization'] =
                        `Bearer ${token}`
                    auth.setUser({
                        id: data.id,
                        email: data.email,
                        active: data.active,
                        note: data.note,
                        role: data.role,
                        path: Boolean(data.path),
                    })
                }
            } catch {
                localStorage.removeItem('token')
            }
        }
        setLoading(false)
    }

    useEffect(() => {
        loadUser()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!auth.user || !isAdminAccessRole(auth.user.role)) {
            return
        }

        ;(async () => {
            const users = await getUserList()
            dispatch(setUserList(users))
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.user])

    if (loading) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-transparent px-4">
                <div className="rounded-2xl border border-white/60 bg-white/70 px-10 py-12 shadow-card backdrop-blur-md">
                    <Spin size="large" />
                </div>
            </div>
        )
    }

    const hasChrome = Boolean(auth.user)

    return (
        <ProfileUsersProvider>
            {hasChrome && <Header />}
            <main
                className={
                    hasChrome
                        ? 'main-app-chrome'
                        : 'min-h-dvh w-full max-w-[100vw] overflow-x-hidden pb-[env(safe-area-inset-bottom,0px)] supports-[overflow:clip]:overflow-x-clip'
                }
            >
                {children}
            </main>
        </ProfileUsersProvider>
    )
}

export default SplashProvider
