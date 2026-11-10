const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RequestKey = sequelize.define('request_keys', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  merchant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'merchants', key: 'id' }
  },
  route: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  response_json: {
    type: DataTypes.TEXT
  }
}, {
  indexes: [
    {
      unique: true,
      name: 'uk_request_keys_key',
      fields: ['key', 'merchant_id', 'route']
    }
  ]
});

RequestKey.associate = function(models) {
  RequestKey.belongsTo(models.Merchant, { foreignKey: 'merchant_id' });
};

module.exports = RequestKey;
