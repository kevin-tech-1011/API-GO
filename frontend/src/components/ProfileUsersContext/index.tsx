import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'

import { listProfileUsers } from '@/actions/profileUsers'
import { useAuth } from '@/components/AuthContext'
import type { TProfileUser } from '@/types'

export type TProfileUserOption = { value: number; label: string }

interface IProfileUsersContext {
    profileUsers: TProfileUser[]
    /** Ready to spread into an Ant Design `Select`'s `options`. */
    options: TProfileUserOption[]
    loading: boolean
    /** Refetch after the list is added to, renamed, or deleted. */
    refresh: () => Promise<void>
    /** Display name for a `profileUserIndex`; `''` when unset or unknown. */
    labelOf: (index: number | null | undefined) => string
    /** True when `index` matches a profile user that still exists. */
    isKnownIndex: (index: number | null | undefined) => boolean
}

const ProfileUsersContext = createContext<IProfileUsersContext>({
    profileUsers: [],
    options: [],
    loading: false,
    refresh: async () => {},
    labelOf: () => '',
    isKnownIndex: () => false,
})

/**
 * Single source of truth for the manager-editable profile user list, shared by the
 * Profiles, History, Calendar, Schedule Table and Statistics filters. Loads once the
 * session is hydrated (the request needs the JWT header set by `Layout`).
 */
export const ProfileUsersProvider = ({ children }: { children: any }) => {
    const { user } = useAuth()
    const userId = user?.id ?? null
    const [profileUsers, setProfileUsers] = useState<TProfileUser[]>([])
    const [loading, setLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (userId == null) {
            setProfileUsers([])
            return
        }
        setLoading(true)
        try {
            setProfileUsers(await listProfileUsers())
        } catch {
            setProfileUsers([])
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const options = useMemo(
        () => profileUsers.map((u) => ({ value: u.id, label: u.name })),
        [profileUsers]
    )

    const labelById = useMemo(() => {
        const map = new Map<number, string>()
        for (const u of profileUsers) map.set(u.id, u.name)
        return map
    }, [profileUsers])

    const labelOf = useCallback(
        (index: number | null | undefined) =>
            index == null ? '' : (labelById.get(index) ?? ''),
        [labelById]
    )

    const isKnownIndex = useCallback(
        (index: number | null | undefined) =>
            index != null && labelById.has(index),
        [labelById]
    )

    const value = useMemo(
        () => ({
            profileUsers,
            options,
            loading,
            refresh,
            labelOf,
            isKnownIndex,
        }),
        [profileUsers, options, loading, refresh, labelOf, isKnownIndex]
    )

    return (
        <ProfileUsersContext.Provider value={value}>
            {children}
        </ProfileUsersContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProfileUsers = () => useContext(ProfileUsersContext)
