const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomerPayment = sequelize.define('customer_payments', {
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
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  flow_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'received'
  },
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  payment_method: {
    type: DataTypes.STRING(20)
  },
  remark: {
    type: DataTypes.STRING(500)
  }
});

CustomerPayment.associate = function(models) {
  CustomerPayment.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  CustomerPayment.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
};

module.exports = CustomerPayment;
