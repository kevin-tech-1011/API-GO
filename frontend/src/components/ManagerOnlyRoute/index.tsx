import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { USER_ROLES } from '@/types/constants'

const ManagerOnlyRoute = () => {
    const { user } = useAuth()
    if (!user) {
        return <Navigate to="/auth/login" replace />
    }
    if (user.role !== USER_ROLES.MANAGER) {
        return <Navigate to="/" replace />
    }
    return <Outlet />
}

export default ManagerOnlyRoute
