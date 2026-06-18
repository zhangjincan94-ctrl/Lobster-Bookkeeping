const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Buyer = sequelize.define('buyers', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  merchant_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'merchants',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  share_token: {
    type: DataTypes.STRING(64),
    unique: true,
    allowNull: false
  }
});

Buyer.associate = function(models) {
  Buyer.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
};

module.exports = Buyer;
