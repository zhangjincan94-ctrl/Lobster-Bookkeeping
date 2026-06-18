const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('transactions', {
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
  buyer_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'buyers',
      key: 'id'
    }
  },
  lobster_size: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  weight: {
    type: DataTypes.DECIMAL(10, 2)
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2)
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  payment_status: {
    type: DataTypes.TINYINT,
    defaultValue: 0
  },
  paid_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  delivery_address: {
    type: DataTypes.STRING(200)
  },
  delivery_status: {
    type: DataTypes.TINYINT,
    defaultValue: 0
  },
  delivery_time: {
    type: DataTypes.DATE
  },
  order_status: {
    type: DataTypes.TINYINT,
    defaultValue: 0
  },
  cancelled_at: {
    type: DataTypes.DATE
  },
  remark: {
    type: DataTypes.STRING(500)
  },
  transaction_time: {
    type: DataTypes.DATE,
    allowNull: false
  }
});

Transaction.associate = function(models) {
  Transaction.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  Transaction.belongsTo(models.Buyer, { foreignKey: 'buyer_id' });
  Transaction.hasMany(models.PaymentRecord, { foreignKey: 'transaction_id', as: 'PaymentRecords' });
  Transaction.hasMany(models.TransactionPurchaseAllocation, { foreignKey: 'transaction_id', as: 'PurchaseAllocations' });
};

module.exports = Transaction;
