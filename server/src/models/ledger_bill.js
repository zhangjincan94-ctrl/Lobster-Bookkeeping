const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LedgerBill = sequelize.define('ledger_bills', {
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
  direction: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  bill_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  remark: {
    type: DataTypes.STRING(500)
  },
  deleted_at: {
    type: DataTypes.DATE
  }
});

LedgerBill.associate = function(models) {
  LedgerBill.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  LedgerBill.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
  LedgerBill.hasMany(models.LedgerBillItem, { foreignKey: 'ledger_bill_id', as: 'items' });
};

module.exports = LedgerBill;
