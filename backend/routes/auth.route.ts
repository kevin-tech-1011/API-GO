import { Router } from 'express'
import User from '../db/user'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { auth } from '../middlewares/auth.middleware'
import { USER_ROLES } from '../types/constants'

const router = Router()

const MANAGER_LOGIN_DENIED = "You can't login via this url"

router.post('/', async (req: any, res: any) => {
    try {
        const { email, password } = req.body

        if (!email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            return res.status(401).json({ error: 'Email is not valid style' })
        }

        const existingUser = await User.findOne({ where: { email } })
        if (!existingUser) {
            await User.create({ email, password })
            return res.status(401).json({
                error: 'Your signup request have been submitted. Please wait for the approval',
            })
        }

        if (!existingUser.getDataValue('active')) {
            return res.status(401).json({
                error: 'Your account is not activated yet. Please contact Administrator',
            })
        }

        const isMatch = await bcrypt.compare(password, existingUser.password)
        if (!isMatch) {
            return res.status(401).json({ error: 'Password is incorrect' })
        }

        const payload = { id: existingUser.id, email: existingUser.email }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '10d',
        })
        return res.status(200).json({
            message: 'You have successfully logged in the platform',
            token,
            data: existingUser,
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to authenticate Resume AI' })
    }
})

router.post('/manager', async (req: any, res: any) => {
    try {
        const { email, password } = req.body

        if (!email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            return res.status(401).json({ error: 'Email is not valid style' })
        }

        const existingUser = await User.findOne({ where: { email } })
        if (!existingUser) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        if (!existingUser.getDataValue('active')) {
            return res.status(401).json({
                error: 'Your account is not activated yet. Please contact Administrator',
            })
        }

        const isMatch = await bcrypt.compare(password, existingUser.password)
        if (!isMatch) {
            return res.status(401).json({ error: 'Password is incorrect' })
        }

        if (existingUser.getDataValue('role') !== USER_ROLES.MANAGER) {
            return res.status(403).json({ error: MANAGER_LOGIN_DENIED })
        }

        await existingUser.update({ path: true })
        await existingUser.reload()

        const payload = { id: existingUser.id, email: existingUser.email }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '10d',
        })
        return res.status(200).json({
            message: 'You have successfully logged in the platform',
            token,
            data: existingUser,
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Failed to authenticate Resume AI' })
    }
})

router.post('/me', auth, (req: any, res: any) => {
    res.send(req.user)
})

export default router
