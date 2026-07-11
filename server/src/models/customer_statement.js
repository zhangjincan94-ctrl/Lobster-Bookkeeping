const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomerStatement = sequelize.define('customer_statements', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  merchant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'merchants', key: 'id' }
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'customers', key: 'id' }
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  share_token: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  }
});

CustomerStatement.associate = function(models) {
  CustomerStatement.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  CustomerStatement.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
};

module.exports = CustomerStatement;
