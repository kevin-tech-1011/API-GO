import { Router } from 'express'
import { auth, requireUser } from '../middlewares/auth.middleware'
import { USER_ROLES } from '../types/constants'

import Profile from '../db/profile'
import ProfileUser from '../db/profileUser'
import User from '../db/user'
import History from '../db/history'
import { sequelize } from '../db'
import { Op } from 'sequelize'
import { NOT_CALENDAR_IMPORT_SQL } from '../utils/historyStatsAttribution'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'

const router = Router()

/**
 * Resolves `payload.profileUserIndex` against the `profileUsers` table in place.
 * Blank clears the slot; an unknown slot is dropped so the stored value survives.
 */
async function resolveProfileUserIndex(
    payload: Record<string, unknown>
): Promise<void> {
    if (!('profileUserIndex' in payload)) return
    const raw = payload.profileUserIndex
    if (raw === null || raw === undefined || raw === '') {
        payload.profileUserIndex = null
        return
    }
    const next = normalizeProfileUserIndex(raw)
    if (next === null || (await ProfileUser.findByPk(next)) === null) {
        delete payload.profileUserIndex
        return
    }
    payload.profileUserIndex = next
}

function isManagerRole(user: any): boolean {
    return user?.role === USER_ROLES.MANAGER
}

function getProfileAccessFilters(user: any): Record<string, unknown>[] {
    const filters: Record<string, unknown>[] = []
    switch (user?.role) {
        case USER_ROLES.USER:
            filters.push({ userId: user.id })
            break
        case USER_ROLES.GUEST:
            filters.push({ guestId: user.id })
            break
        case USER_ROLES.BIDDER:
            filters.push({ bidderId: user.id })
            break
    }
    if (!isManagerRole(user)) {
        filters.push({
            [Op.or]: [{ show: true }, { show: { [Op.is]: null } }],
        })
    }
    return filters
}

router.get('/', auth, async (req: any, res) => {
    try {
        const filters: Record<string, unknown>[] = []

        switch (req.user.role) {
            case USER_ROLES.USER:
                filters.push({ userId: req.user.id })
                break
            case USER_ROLES.GUEST:
                filters.push({ guestId: req.user.id })
                break
            case USER_ROLES.BIDDER:
                filters.push({ bidderId: req.user.id })
                break
        }

        if (!isManagerRole(req.user)) {
            filters.push({
                [Op.or]: [{ show: true }, { show: { [Op.is]: null } }],
            })
        }

        const whereClause =
            filters.length > 0 ? { [Op.and]: filters } : {}

        const profiles = await Profile.findAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['email'],
                },
            ],
            order: [
                ['id', 'ASC'],
            ],
        })
        res.send(profiles)
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve the profile list')
    }
})

router.get('/:id', auth, async (req: any, res) => {
    const { id } = req.params
    try {
        const profile = await Profile.findByPk(id)
        if (!profile) {
            return res.status(404).send('Profile not found')
        }
        const hidden =
            profile.getDataValue('show') === false ||
            profile.getDataValue('show') === 0
        if (!isManagerRole(req.user) && hidden) {
            return res.status(404).send('Profile not found')
        }
        res.send(profile)
    } catch {
        res.status(500).send('Unable to retrieve the requested profile')
    }
})

router.post('/getprofileinfo', async (req: any, res) => {
    const { profileId } = req.body

    const parsedProfileId = Number(profileId)

    if (!Number.isInteger(parsedProfileId) || parsedProfileId <= 0) {
        return res.status(400).json({ message: 'Valid profileId is required' })
    }

    try {
        const profile = await Profile.findByPk(parsedProfileId, {
            attributes: ['templateId', 'backgroundId', 'userId'],
        })

        if (!profile) {
            return res.status(404).send('Profile not found')
        }

        return res.send({
            templateId: profile.getDataValue('templateId'),
            backgroundId: profile.getDataValue('backgroundId'),
            userId: profile.getDataValue('userId'),
        })
    } catch (error) {
        console.log(error)
        return res.status(500).send('Unable to retrieve profile data')
    }
})

router.post('/', auth, requireUser, async (req: any, res) => {
    const { data } = req.body
    try {
        const createPayload = { ...data }
        if (!isManagerRole(req.user)) {
            delete createPayload.calendarUrl
        }
        await resolveProfileUserIndex(createPayload)
        const profile = await Profile.create({
            ...createPayload,
            userId: req.user.id,
        })
        res.send(profile)
    } catch {
        res.status(500).send('An error occured while generating profile')
    }
})

/** Public: no JWT. Matches profiles by name + company; only non-hidden profiles (show). */
router.post('/all-information', async (req: any, res) => {
    try {
        const { profileName, company } = req.body ?? {}
        const filters = getProfileAccessFilters(req.user)

        if (typeof profileName !== 'string' || profileName.trim() === '') {
            return res.status(400).send('profileName is required')
        }
        if (typeof company !== 'string' || company.trim() === '') {
            return res.status(400).send('company is required')
        }
        filters.push({
            name: { [Op.like]: `%${profileName.trim()}%` },
        })

        const profileWhere = filters.length > 0 ? { [Op.and]: filters } : {}
        const profiles = await Profile.findAll({
            where: profileWhere,
            attributes: [
                'id',
                'phone',
                'linkedin',
                'location',
                'street',
                'email',
                'race',
            ],
            order: [['name', 'ASC']],
        })

        if (profiles.length === 0) {
            return res.send([])
        }

        const profileIds = profiles.map((p) => p.getDataValue('id'))
        const histories = await History.findAll({
            where: {
                [Op.and]: [
                    { profileId: { [Op.in]: profileIds } },
                    { company: { [Op.like]: `%${company.trim()}%` } },
                    sequelize.literal(NOT_CALENDAR_IMPORT_SQL),
                ],
            },
            attributes: ['profileId', 'resume', 'createdAt'],
            order: [['createdAt', 'DESC']],
        })

        const historyByProfileId = new Map<number, (string | null)[]>()
        for (const history of histories) {
            const pid = Number(history.getDataValue('profileId'))
            if (!historyByProfileId.has(pid)) {
                historyByProfileId.set(pid, [])
            }
            historyByProfileId
                .get(pid)!
                .push(history.getDataValue('resume') ?? null)
        }

        const result = profiles.map((profile) => {
            const id = Number(profile.getDataValue('id'))
            return {
                phone: profile.getDataValue('phone') ?? null,
                linkedin: profile.getDataValue('linkedin') ?? null,
                location: profile.getDataValue('location') ?? null,
                street: profile.getDataValue('street') ?? null,
                email: profile.getDataValue('email') ?? null,
                race: profile.getDataValue('race') ?? null,
                resume: historyByProfileId.get(id) ?? [],
            }
        })

        res.send(result)
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve profile information')
    }
})

function decodeProfileNameParam(raw: string): string {
    try {
        return decodeURIComponent(raw)
    } catch {
        return raw
    }
}

/** Public: no JWT. Resolves numeric profile id by exact display name; visibility rules match getProfileAccessFilters. */
router.post('/:profileName', async (req: any, res) => {
    const raw = req.params.profileName
    try {
        const name =
            typeof raw === 'string' ? decodeProfileNameParam(raw).trim() : ''
        if (!name) {
            return res.status(400).send('Profile name is required')
        }

        const filters: Record<string, unknown>[] = [
            { name },
            ...getProfileAccessFilters(req.user),
        ]

        const profile = await Profile.findOne({
            where: { [Op.and]: filters },
            attributes: ['id'],
        })

        if (!profile) {
            return res.status(404).send('Profile not found')
        }

        const id = profile.getDataValue('id')
        res.send({ id })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to resolve profile id')
    }
})

router.put('/', auth, requireUser, async (req: any, res) => {
    const { data } = req.body
    try {
        const payload = { ...data }
        if (!isManagerRole(req.user)) {
            delete payload.show
            delete payload.calendarUrl
        }
        await resolveProfileUserIndex(payload)
        if (isManagerRole(req.user) && 'calendarUrl' in payload) {
            const raw = payload.calendarUrl
            if (raw === null || raw === undefined || raw === '') {
                payload.calendarUrl = null
            } else if (typeof raw === 'string') {
                const t = raw.trim()
                payload.calendarUrl = t === '' ? null : t.slice(0, 4096)
            } else {
                delete payload.calendarUrl
            }
        }
        const profile = await Profile.update(payload, {
            where: { id: data.id },
        })
        res.send(profile)
    } catch (error) {
        console.log(error)
        res.status(500).send('An error occured while updating profile')
    }
})

router.delete('/:id', auth, requireUser, async (req, res) => {
    const { id } = req.params
    try {
        await Profile.destroy({ where: { id } })
        res.send('success')
    } catch {
        res.status(500).send('Unable to delete the profile')
    }
})

export default router
