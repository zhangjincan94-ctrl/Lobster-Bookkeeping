const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Supplier = sequelize.define('suppliers', {
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
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  remark: {
    type: DataTypes.STRING(500)
  }
});

Supplier.associate = function(models) {
  Supplier.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  Supplier.hasMany(models.PurchaseRecord, { foreignKey: 'supplier_id' });
};

module.exports = Supplier;
