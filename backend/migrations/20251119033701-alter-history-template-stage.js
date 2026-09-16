'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn('Histories', 'template', {
      type: Sequelize.NUMBER,
      defaultValue: 1,
    });
    queryInterface.addColumn('Histories', 'stage', {
      type: Sequelize.ENUM('TODO', 'BID', 'INITIAL', 'HR', 'TECH1', 'TECH2', 'CULTURE', 'FINAL', 'OFFER', 'REJECT'),
      defaultValue: 'TODO',
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    queryInterface.removeColumn('Histories', 'template');
    queryInterface.removeColumn('Histories', 'stage');
  }
};
