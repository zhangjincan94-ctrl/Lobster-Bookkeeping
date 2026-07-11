const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Customer = sequelize.define('customers', {
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
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  account_start_date: {
    type: DataTypes.DATEONLY
  },
  remark: {
    type: DataTypes.STRING(500)
  },
  archived_at: {
    type: DataTypes.DATE
  }
});

Customer.associate = function(models) {
  Customer.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  Customer.hasMany(models.LedgerBill, { foreignKey: 'customer_id', as: 'LedgerBills' });
  Customer.hasMany(models.CustomerPayment, { foreignKey: 'customer_id', as: 'CustomerPayments' });
};

module.exports = Customer;
