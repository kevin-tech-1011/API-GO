import { Router } from 'express'
import Profile from '../db/profile'
import { auth } from '../middlewares/auth.middleware'
import { USER_ROLES } from '../types/constants'

import mockResume from '../config/mock.json'
import {
    generateResumeContent,
    mergeResumeJsonWithProfileContact,
} from '../services/openai.service'
import { type TProfile } from '../types'

import '../config/env'

const router = Router()

function isManagerRole(user: { role?: string } | undefined): boolean {
    return user?.role === USER_ROLES.MANAGER
}

/** In development, mock resume is returned without JWT so local UI still works. */
const authUnlessDevMock = (req: any, res: any, next: any) => {
    if (process.env.MODE === 'development') {
        return next()
    }
    return auth(req, res, next)
}

router.post('/generate-resume', authUnlessDevMock, async (req: any, res: any) => {
    const isDev = process.env.MODE === 'development'

    try {
        const { id, jobDescription, additionalInfo } = req.body
        const profile = await Profile.findByPk(id)
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' })
        }
        const hidden =
            profile.getDataValue('show') === false ||
            profile.getDataValue('show') === 0
        if (!isManagerRole(req.user) && hidden) {
            return res.status(404).json({ error: 'Profile not found' })
        }

        const profilePlain = profile.dataValues as unknown as Record<string, unknown>

        if (isDev) {
            const raw =
                typeof mockResume === 'string'
                    ? mockResume
                    : JSON.stringify(mockResume)
            const content = mergeResumeJsonWithProfileContact(raw, profilePlain)
            return res.json({ content })
        }

        const content = await generateResumeContent(
            profilePlain as unknown as TProfile,
            jobDescription ?? '',
            additionalInfo ?? ''
        )
        if (content == null || content === '') {
            return res.status(502).json({
                error: 'Resume generation did not return content. Try again or check the AI service.',
            })
        }
        res.json({ content })
    } catch (error) {
        console.error('[OpenAI] generate-resume failed', error)
        const message =
            error instanceof Error ? error.message : 'Failed to generate resume content'
        const isConfig = /OPENAI_API_KEY/i.test(message)
        res.status(isConfig ? 503 : 500).json({
            error: isConfig
                ? message
                : 'Failed to generate resume content. Try again or check the AI service.',
        })
    }
})

export default router
