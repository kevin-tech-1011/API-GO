/**
 * One-off: set password for a user by email (bcrypt, same as API change-password).
 * Usage from repo root:
 *   npx tsx backend/scripts/update-user-password.ts <email> <newPassword>
 */
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { dbReady } from '../db'
import User from '../db/user'

dotenv.config()

async function main() {
    const email = process.argv[2]
    const newPassword = process.argv[3]
    if (!email?.trim() || !newPassword) {
        console.error('Usage: npx tsx backend/scripts/update-user-password.ts <email> <newPassword>')
        process.exit(1)
    }
    await dbReady
    const user = await User.findOne({ where: { email: email.trim() } })
    if (!user) {
        console.error('User not found:', email)
        process.exit(1)
    }
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(newPassword, salt)
    await user.update({ password: hash })
    console.log('Password updated for', email.trim(), 'id=', user.getDataValue('id'))
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
