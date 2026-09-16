import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { isAppUserRole } from '@/types/constants'

/** Blocks `USER` role from nested routes (Profiles, Users, etc.). */
const NonAppUserRoute = () => {
    const { user } = useAuth()
    if (isAppUserRole(user?.role)) {
        return <Navigate to="/history" replace />
    }
    return <Outlet />
}

export default NonAppUserRoute
