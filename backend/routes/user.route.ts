import { Router } from 'express'
import { auth, requireAdmin } from '../middlewares/auth.middleware'
import User from '../db/user'
import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import { ASSIGNABLE_USER_ROLES, USER_ROLES } from '../types/constants'

const router = Router()

function hasPathFlag(user: any): boolean {
    if (!user) return false
    return Boolean(user.getDataValue?.('path') ?? user.path)
}

router.get('/', auth, async (req: any, res: any) => {
    const where = hasPathFlag(req.user)
        ? {}
        : { path: { [Op.ne]: true } }
    const users = await User.findAll({ where })
    res.send({ users })
})

// User Update
router.post('/', auth, requireAdmin, async (req: any, res: any) => {
    const { user } = req.body
    try {
        const target = await User.findByPk(user.id)
        if (!target) {
            return res.status(404).json({ error: 'User not found' })
        }
        if (!hasPathFlag(req.user) && hasPathFlag(target)) {
            return res.status(403).json({
                error: 'You cannot modify users with manager path access',
            })
        }
        const incomingRole = user.role
        const previousRole = target.getDataValue('role')
        if (
            incomingRole !== undefined &&
            incomingRole !== null &&
            !ASSIGNABLE_USER_ROLES.includes(incomingRole)
        ) {
            return res.status(400).json({ error: 'Invalid role' })
        }
        if (
            incomingRole === USER_ROLES.MANAGER &&
            req.user.role !== USER_ROLES.MANAGER &&
            previousRole !== USER_ROLES.MANAGER
        ) {
            return res.status(403).json({
                error: 'Only managers can assign the MANAGER role',
            })
        }

        const nextRole =
            user.role !== undefined && user.role !== null
                ? user.role
                : previousRole
        const nextPath = nextRole === USER_ROLES.MANAGER

        await User.update(
            {
                email: user.email ?? target.getDataValue('email'),
                active: user.active ?? target.getDataValue('active'),
                role: nextRole,
                note: user.note ?? target.getDataValue('note'),
                path: nextPath,
            },
            { where: { id: user.id } }
        )
        const data = await User.findByPk(user.id)
        res.status(200).send(data)
    } catch {
        res.status(500).send({
            error: 'Error occured while updating user',
        })
    }
})

router.post('/:id/change-password', auth, requireAdmin, async (req: any, res: any) => {
    const { id } = req.params
    const { password } = req.body

    try {
        const user = await User.findByPk(id)
        if (!user) {
            return res.status(404).send('User not found')
        }
        if (!hasPathFlag(req.user) && hasPathFlag(user)) {
            return res.status(403).json({
                error: 'You cannot modify users with manager path access',
            })
        }
        const salt = await bcrypt.genSalt(10)
        user.password = await bcrypt.hash(password, salt)
        
        await user.save()
        res.status(200).send('Password changed successfully')
    } catch (error) {
        console.error(error)
        res.status(500).send('Unable to change the password')
    }
})

router.delete('/:id', auth, requireAdmin, async (req: any, res: any) => {
    const { id } = req.params
    const curUser = req.user.id
    if (+id === curUser) {
        return res.status(500).send("You can't delete your account yourself")
    }
    try {
        const target = await User.findByPk(id)
        if (!target) {
            return res.status(404).send('User not found')
        }
        if (!hasPathFlag(req.user) && hasPathFlag(target)) {
            return res.status(403).json({
                error: 'You cannot delete users with manager path access',
            })
        }
        await User.destroy({ where: { id: +id } })
        res.status(200).send('Success')
    } catch (error) {
        console.error(error)
        res.status(500).send('Unable to delete the user')
    }
})

export default router
