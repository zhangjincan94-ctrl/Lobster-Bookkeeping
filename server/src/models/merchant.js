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
  },
  // 店铺头像以压缩后的 data URL 存储，避免额外引入对象存储服务
  avatar: {
    type: DataTypes.TEXT('medium')
  }
});

module.exports = Merchant;
