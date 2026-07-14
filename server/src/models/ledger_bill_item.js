const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LedgerBillItem = sequelize.define('ledger_bill_items', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ledger_bill_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'ledger_bills', key: 'id' }
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'products', key: 'id' }
  },
  product_name: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
});

LedgerBillItem.associate = function(models) {
  LedgerBillItem.belongsTo(models.LedgerBill, { foreignKey: 'ledger_bill_id', as: 'bill' });
  LedgerBillItem.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
};

module.exports = LedgerBillItem;
