import passport from 'passport'
import { ADMIN_ACCESS_ROLES, USER_ROLES } from '../types/constants'

export const auth = passport.authenticate('jwt', { session: false })

export const requireAdmin = (req, res, next) => {
    const user = req.user
    if (ADMIN_ACCESS_ROLES.includes(user.role)) {
        return next()
    }
    res.status(500).send("You don't have permission to this request")
}

export const requireManager = (req, res, next) => {
    const user = req.user
    if (user?.role === USER_ROLES.MANAGER) {
        return next()
    }
    res.status(403).send("You don't have permission to this request")
}

export const requireUser = (req, res, next) => {
    const user = req.user
    if (
        user.role === USER_ROLES.ADMIN ||
        user.role === USER_ROLES.MANAGER ||
        user.role === USER_ROLES.USER
    ) {
        return next()
    }
    res.status(500).send("You don't have permission to this request")
}

export const requireBidder = (req, res, next) => {
    const user = req.user
    if (
        user.role === USER_ROLES.ADMIN ||
        user.role === USER_ROLES.MANAGER ||
        user.role === USER_ROLES.USER ||
        user.role === USER_ROLES.BIDDER
    ) {
        return next()
    }
    res.status(500).send("You don't have permission to this request")
}

export const requireGuest = (req, res, next) => {
    const user = req.user
    if (
        user.role === USER_ROLES.ADMIN ||
        user.role === USER_ROLES.MANAGER ||
        user.role === USER_ROLES.USER ||
        user.role === USER_ROLES.GUEST
    ) {
        return next()
    }
    res.status(500).send("You don't have permission to this request")
}
