import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { isAppUserRole, USER_ROLES } from '@/types/constants'

/** Only `MANAGER` may access nested routes (e.g. Schedule, Calendar). */
const ManagerRoute = () => {
    const { user } = useAuth()
    if (isAppUserRole(user?.role)) {
        return <Navigate to="/history" replace />
    }
    if (user?.role !== USER_ROLES.MANAGER) {
        return <Navigate to="/profile" replace />
    }
    return <Outlet />
}

export default ManagerRoute
