const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentRecord = sequelize.define('payment_records', {
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
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  payment_method: {
    type: DataTypes.STRING(20)
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  note: {
    type: DataTypes.STRING(200)
  }
});

PaymentRecord.associate = function(models) {
  PaymentRecord.belongsTo(models.Transaction, { foreignKey: 'transaction_id' });
};

module.exports = PaymentRecord;
