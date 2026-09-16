import { DataTypes, Sequelize } from 'sequelize'

export const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './db.sqlite',
    logging: false,
})

async function ensureUsersPathColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('users')
        if (!columns.path) {
            await queryInterface.addColumn('users', 'path', {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            })
        }
    } catch {
        // `users` not created yet; sync() below will create it with `path`
    }
}

async function ensureProfilesShowColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('profiles')
        if (!columns.show) {
            await queryInterface.addColumn('profiles', 'show', {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            })
        }
    } catch {
        // `profiles` not created yet; sync() below will add `show`
    }
}

async function ensureProfilesProfileUserIndexColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('profiles')
        if (!columns.profileUserIndex) {
            await queryInterface.addColumn('profiles', 'profileUserIndex', {
                type: DataTypes.INTEGER,
                allowNull: true,
            })
        }
    } catch {
        // table may not exist yet
    }
}

async function ensureProfilesStreetRaceColumns() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('profiles')
        if (!columns.street) {
            await queryInterface.addColumn('profiles', 'street', {
                type: DataTypes.STRING,
                allowNull: true,
            })
        }
        if (!columns.race) {
            await queryInterface.addColumn('profiles', 'race', {
                type: DataTypes.STRING,
                allowNull: true,
            })
        }
    } catch {
        // table may not exist yet
    }
}

async function ensureProfilesCalendarUrlColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('profiles')
        if (!columns.calendarUrl) {
            await queryInterface.addColumn('profiles', 'calendarUrl', {
                type: DataTypes.TEXT,
                allowNull: true,
            })
        }
    } catch {
        // table may not exist yet
    }
}

async function ensureHistoryStatusStagesColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('histories')
        if (!columns.statusStages) {
            await queryInterface.addColumn('histories', 'statusStages', {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: [],
            })
        }
    } catch {
        // `histories` not created yet; sync() below will create it with `statusStages`
    }
}

async function ensureHistoryScheduleMeetingsColumn() {
    const queryInterface = sequelize.getQueryInterface()
    try {
        const columns = await queryInterface.describeTable('histories')
        if (!columns.scheduleMeetingsByStatus) {
            await queryInterface.addColumn('histories', 'scheduleMeetingsByStatus', {
                type: DataTypes.JSON,
                allowNull: false,
                defaultValue: {},
            })
        }
    } catch {
        // table may not exist yet
    }
}

export const dbReady = (async () => {
    await ensureUsersPathColumn()
    await ensureProfilesShowColumn()
    await ensureProfilesProfileUserIndexColumn()
    await ensureProfilesStreetRaceColumns()
    await ensureProfilesCalendarUrlColumn()
    await ensureHistoryStatusStagesColumn()
    await ensureHistoryScheduleMeetingsColumn()
    await sequelize.sync()
})()
