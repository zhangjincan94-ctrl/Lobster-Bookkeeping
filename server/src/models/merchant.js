const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Merchant = sequelize.define('merchants', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  openid: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: false
  },
  shop_name: {
    type: DataTypes.STRING(100)
  },
  phone: {
    type: DataTypes.STRING(20)
  }
});

module.exports = Merchant;
