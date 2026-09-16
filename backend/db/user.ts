import { DataTypes } from 'sequelize'
import { sequelize } from './index'
import bcrypt from 'bcryptjs'

const User = sequelize.define(
    'user',
    {
        email: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        role: {
            type: DataTypes.ENUM(
                'ADMIN',
                'MANAGER',
                'USER',
                'BIDDER',
                'GUEST'
            ),
            defaultValue: 'USER',
            allowNull: false,
        },
        note: {
            type: DataTypes.TEXT,
            defaultValue: '',
            allowNull: true,
        },
        path: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    },
    {
        hooks: {
            beforeCreate: async (user: any) => {
                const salt = await bcrypt.genSalt(10)
                user.password = await bcrypt.hash(user.password, salt)
            },
        },
    }
)

export default User
