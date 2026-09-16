import { DataTypes } from 'sequelize'
import { sequelize } from './index'
import User from './user'

const Profile = sequelize.define('profile', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    location: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    street: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    race: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    experience: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    education: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    linkedin: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    showLinkedin: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
    },
    tech: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    bidderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    guestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    templateId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    backgroundId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    /** When false, only MANAGER may see this profile and its history (list, detail, relevant writes). */
    show: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    /**
     * Assigned “profile user” slot: 0 = Lemon; null = unset.
     */
    profileUserIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    calendarUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
})

Profile.belongsTo(User, {
    as: 'user',
    foreignKey: 'userId',
})

export default Profile
