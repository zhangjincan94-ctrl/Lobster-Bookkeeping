const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductCategory = sequelize.define('product_categories', {
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
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
});

ProductCategory.associate = function(models) {
  ProductCategory.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
  ProductCategory.hasMany(models.Product, { foreignKey: 'category_id', as: 'Products' });
};

module.exports = ProductCategory;
