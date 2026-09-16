import { Router } from 'express'
import { Op } from 'sequelize'

import History from '../db/history'
import Profile from '../db/profile'

const router = Router()

function escapeLike(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
}

/**
 * POST /api/check/:profileName/:companyName
 * Body unused. Returns JSON true if a history exists for that profile name + company (substring LIKE), else false.
 */
router.post('/:profileName/:companyName', async (req, res) => {
    const profileName = String(req.params.profileName ?? '').trim()
    const companyName = String(req.params.companyName ?? '').trim()

    if (!profileName || !companyName) {
        return res.json(false)
    }

    try {
        const found = await History.findOne({
            attributes: ['id'],
            where: {
                company: { [Op.like]: `%${escapeLike(companyName)}%` },
            },
            include: [
                {
                    model: Profile,
                    as: 'profile',
                    required: true,
                    attributes: [],
                    where: {
                        name: { [Op.like]: `%${escapeLike(profileName)}%` },
                    },
                },
            ],
        })
        res.json(found != null)
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to check')
    }
})

export default router
