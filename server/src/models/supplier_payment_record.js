const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SupplierPaymentRecord = sequelize.define('supplier_payment_records', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  purchase_record_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'purchase_records',
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

SupplierPaymentRecord.associate = function(models) {
  SupplierPaymentRecord.belongsTo(models.PurchaseRecord, { foreignKey: 'purchase_record_id' });
};

module.exports = SupplierPaymentRecord;
