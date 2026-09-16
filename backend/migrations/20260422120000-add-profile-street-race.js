'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('profiles', 'street', {
            type: Sequelize.STRING,
            allowNull: true,
        })
        await queryInterface.addColumn('profiles', 'race', {
            type: Sequelize.STRING,
            allowNull: true,
        })
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('profiles', 'street')
        await queryInterface.removeColumn('profiles', 'race')
    },
}
