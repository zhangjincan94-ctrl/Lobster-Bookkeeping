const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('products', {
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
  category_id: {
    type: DataTypes.INTEGER,
    references: { model: 'product_categories', key: 'id' }
  },
  name: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '件'
  },
  default_unit_price: {
    type: DataTypes.DECIMAL(10, 2)
  },
  remark: {
    type: DataTypes.STRING(500)
  },
  archived_at: {
    type: DataTypes.DATE
  }
});

Product.associate = function(models) {
  Product.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  Product.belongsTo(models.ProductCategory, { foreignKey: 'category_id', as: 'category' });
  Product.hasMany(models.LedgerBillItem, { foreignKey: 'product_id', as: 'LedgerBillItems' });
};

module.exports = Product;
