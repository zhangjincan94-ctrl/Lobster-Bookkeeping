const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TransactionPurchaseAllocation = sequelize.define('transaction_purchase_allocations', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transaction_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'transactions',
      key: 'id'
    }
  },
  purchase_record_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'purchase_records',
      key: 'id'
    }
  },
  weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  unit_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  total_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
});

TransactionPurchaseAllocation.associate = function(models) {
  TransactionPurchaseAllocation.belongsTo(models.Transaction, { foreignKey: 'transaction_id' });
  TransactionPurchaseAllocation.belongsTo(models.PurchaseRecord, { foreignKey: 'purchase_record_id' });
};

module.exports = TransactionPurchaseAllocation;
