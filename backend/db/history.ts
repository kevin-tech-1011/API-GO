import { DataTypes } from 'sequelize'
import { sequelize } from './index'

import Profile from './profile'
import User from './user'

const History = sequelize.define('history', {
    company: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    position: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    link: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    requirements: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    resume: {
        type: DataTypes.STRING,
    },
    templateId: {
        type: DataTypes.NUMBER,
        defaultValue: 1,
    },
    backgroundId: {
        type: DataTypes.NUMBER,
        defaultValue: 0,
    },
    stage: {
        type: DataTypes.ENUM('TODO', 'BID', 'INITIAL', 'HR', 'TECH1', 'TECH2', 'CULTURE', 'FINAL', 'OFFER', 'REJECT'),
        defaultValue: 'TODO',
        allowNull: false,
    },
    /** Completed interview stages (subset of HISTORY_INTERVIEW_STATUS_OPTIONS), stored as JSON array. */
    statusStages: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
    },
    /** Per pipeline status: saved Schedule modal fields (timezone, meetingTime ISO, meetingLink). */
    scheduleMeetingsByStatus: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
    },
})

History.belongsTo(Profile, {
    as: 'profile',
    foreignKey: 'profileId',
})

History.belongsTo(User, {
    as: 'user',
    foreignKey: 'userId',
})

export default History
