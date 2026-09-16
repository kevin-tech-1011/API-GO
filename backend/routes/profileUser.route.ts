import { Router } from 'express'
import { auth, requireManager } from '../middlewares/auth.middleware'
import { sequelize } from '../db'
import Profile from '../db/profile'
import ProfileUser from '../db/profileUser'
import { normalizeProfileUserIndex } from '../utils/profileUserIndex'

const router = Router()

const MAX_NAME_LENGTH = 100

type ProfileUserDto = { id: number; name: string }

function cleanName(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

async function listProfileUsers(): Promise<ProfileUserDto[]> {
    const rows = await ProfileUser.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']],
    })
    return rows.map((row) => ({
        id: Number(row.getDataValue('id')),
        name: String(row.getDataValue('name')),
    }))
}

/** Names are unique case-insensitively; `exceptId` skips the row being renamed. */
function isNameTaken(
    all: ProfileUserDto[],
    name: string,
    exceptId?: number
): boolean {
    const needle = name.toLowerCase()
    return all.some(
        (u) => u.id !== exceptId && u.name.toLowerCase() === needle
    )
}

/** Any signed-in user: these labels drive the Profiles, History, Calendar and Statistics filters. */
router.get('/', auth, async (_req, res) => {
    try {
        res.send(await listProfileUsers())
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to retrieve the profile user list')
    }
})

router.post('/', auth, requireManager, async (req, res) => {
    const name = cleanName(req.body?.name)
    if (name === '') {
        return res.status(400).send('Profile user name is required')
    }
    try {
        const all = await listProfileUsers()
        if (isNameTaken(all, name)) {
            return res
                .status(409)
                .send('A profile user with that name already exists')
        }
        /**
         * `id` is the value stored on `profiles.profileUserIndex`. Deleting the highest
         * id frees it for the next create; a client holding a stale filter then sees the
         * new profile user under it, exactly as a rename would. Safe in the database:
         * DELETE unassigns the profiles first, so no row is left dangling.
         */
        const nextId =
            all.length === 0 ? 0 : Math.max(...all.map((u) => u.id)) + 1
        const created = await ProfileUser.create({ id: nextId, name })
        res.send({
            id: Number(created.getDataValue('id')),
            name: String(created.getDataValue('name')),
        })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to create the profile user')
    }
})

router.put('/:id', auth, requireManager, async (req, res) => {
    const id = normalizeProfileUserIndex(req.params.id)
    if (id === null) {
        return res.status(400).send('Invalid profile user id')
    }
    const name = cleanName(req.body?.name)
    if (name === '') {
        return res.status(400).send('Profile user name is required')
    }
    try {
        const all = await listProfileUsers()
        if (!all.some((u) => u.id === id)) {
            return res.status(404).send('Profile user not found')
        }
        if (isNameTaken(all, name, id)) {
            return res
                .status(409)
                .send('A profile user with that name already exists')
        }
        await ProfileUser.update({ name }, { where: { id } })
        res.send({ id, name })
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to update the profile user')
    }
})

/** Unassigns every profile that pointed at this profile user, then removes it. */
router.delete('/:id', auth, requireManager, async (req, res) => {
    const id = normalizeProfileUserIndex(req.params.id)
    if (id === null) {
        return res.status(400).send('Invalid profile user id')
    }
    try {
        const existing = await ProfileUser.findByPk(id)
        if (!existing) {
            return res.status(404).send('Profile user not found')
        }
        const transaction = await sequelize.transaction()
        try {
            await Profile.update(
                { profileUserIndex: null },
                { where: { profileUserIndex: id }, transaction }
            )
            await ProfileUser.destroy({ where: { id }, transaction })
            await transaction.commit()
        } catch (error) {
            await transaction.rollback()
            throw error
        }
        res.send('success')
    } catch (error) {
        console.log(error)
        res.status(500).send('Unable to delete the profile user')
    }
})

export default router
