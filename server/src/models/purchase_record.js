const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PurchaseRecord = sequelize.define('purchase_records', {
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
  supplier_id: {
    type: DataTypes.INTEGER,
    references: {
      model: 'suppliers',
      key: 'id'
    }
  },
  lobster_size: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  gross_weight: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  tare_weight: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  deduct_weight: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  net_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  remaining_weight: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  unit_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  total_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  settlement_status: {
    type: DataTypes.TINYINT,
    defaultValue: 0
  },
  paid_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  received_at: {
    type: DataTypes.DATE,
    allowNull: false
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
  }
});

PurchaseRecord.associate = function(models) {
  PurchaseRecord.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  PurchaseRecord.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
  PurchaseRecord.hasMany(models.SupplierPaymentRecord, { foreignKey: 'purchase_record_id', as: 'SupplierPaymentRecords' });
  PurchaseRecord.hasMany(models.TransactionPurchaseAllocation, { foreignKey: 'purchase_record_id', as: 'TransactionAllocations' });
};

module.exports = PurchaseRecord;
