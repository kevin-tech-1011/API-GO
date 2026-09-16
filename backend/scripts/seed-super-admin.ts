import User from '../db/user'
import dotenv from 'dotenv'
import { dbReady } from '../db'
import { USER_ROLES } from '../types/constants'

dotenv.config()

const managerDefaults = {
    role: USER_ROLES.MANAGER,
    active: true,
    path: true,
}

async function seed() {
    await dbReady

    try {
        const email = process.env.ADMIN_EMAIL || 'admin@resume.io'
        const password = process.env.ADMIN_PASSWORD || ';lkjasdf'

        const existingUser = await User.findOne({ where: { email } })
        if (!existingUser) {
            await User.create({
                email,
                password,
                ...managerDefaults,
            })
        } else {
            await User.update(managerDefaults, { where: { email } })
        }

        console.log(
            `Seeded manager: ${email} (${!existingUser ? 'created' : 'updated'})`
        )
        process.exit(0)
    } catch (err) {
        console.error('Seed failed', err)
        process.exit(1)
    }
}

seed()
