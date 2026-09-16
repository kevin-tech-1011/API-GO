import { DataTypes } from 'sequelize'
import { sequelize } from './index'
import Profile from './profile'

/**
 * Manager-editable list behind the Profiles page “Profile user” column.
 *
 * `id` doubles as `profiles.profileUserIndex`, so it is assigned explicitly rather than
 * auto-incremented: slot 0 predates this table and must keep meaning “Lemon”.
 */
const ProfileUser = sequelize.define(
    'profileUser',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: false,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
    },
    { tableName: 'profileUsers' }
)

/** The only slot that existed before the list became editable. */
const LEGACY_SLOT_0_NAME = 'Lemon'

function nextFreeName(base: string, takenLower: Set<string>): string {
    let candidate = base
    let n = 2
    while (takenLower.has(candidate.toLowerCase())) {
        candidate = `${base} (${n})`
        n += 1
    }
    takenLower.add(candidate.toLowerCase())
    return candidate
}

/**
 * Backfills rows for slots that profiles already point at, so no profile is left
 * referencing a `profileUserIndex` with no matching row. Must run after `sequelize.sync()`.
 *
 * A slot deleted by a manager is not resurrected: slot 0 is only recreated when the
 * table is empty (fresh database, or first boot after this table was introduced).
 */
export async function seedProfileUsers(): Promise<void> {
    const existing = await ProfileUser.findAll({ attributes: ['id', 'name'] })
    const knownIds = new Set(existing.map((r) => Number(r.getDataValue('id'))))
    const takenNames = new Set(
        existing.map((r) => String(r.getDataValue('name')).toLowerCase())
    )

    const profileRows = (await Profile.findAll({
        attributes: ['profileUserIndex'],
        raw: true,
    })) as unknown as { profileUserIndex: number | null }[]

    const referenced = new Set<number>()
    for (const row of profileRows) {
        if (row.profileUserIndex == null) continue
        const n = Number(row.profileUserIndex)
        if (Number.isInteger(n) && n >= 0) referenced.add(n)
    }
    if (existing.length === 0) referenced.add(0)

    const missing = [...referenced]
        .filter((id) => !knownIds.has(id))
        .sort((a, b) => a - b)
    if (missing.length === 0) return

    await ProfileUser.bulkCreate(
        missing.map((id) => ({
            id,
            name: nextFreeName(
                id === 0 ? LEGACY_SLOT_0_NAME : `Profile user ${id}`,
                takenNames
            ),
        }))
    )
}

export default ProfileUser
