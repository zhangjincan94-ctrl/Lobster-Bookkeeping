const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OtherCost = sequelize.define('other_costs', {
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
  cost_type: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cost_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  remark: {
    type: DataTypes.STRING(200)
  }
});

OtherCost.associate = function(models) {
  OtherCost.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
};

module.exports = OtherCost;
