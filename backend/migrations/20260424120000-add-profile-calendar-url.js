'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('profiles', 'calendarUrl', {
            type: Sequelize.TEXT,
            allowNull: true,
        })
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('profiles', 'calendarUrl')
    },
}
