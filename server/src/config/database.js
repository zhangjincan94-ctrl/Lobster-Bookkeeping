const { Sequelize } = require('sequelize');
const config = require('./index');

const buildSslOptions = () => {
  if (!config.db.sslCaBase64) return null;

  const ca = Buffer.from(config.db.sslCaBase64, 'base64').toString('utf8');
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
    console.error('[数据库 TLS 配置失败]', {
      feature: '数据库连接',
      reason: 'DB_SSL_CA_BASE64 不是有效的 PEM CA 证书'
    });
    throw new Error('DB_SSL_CA_BASE64 必须为 PEM CA 证书的 Base64 编码');
  }

  return { ca, rejectUnauthorized: true };
};

const ssl = buildSslOptions();

const sequelize = new Sequelize(
  config.db.name,
  config.db.user,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      charset: 'utf8mb4',
      ...(ssl ? { ssl } : {})
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    timezone: '+08:00',
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

module.exports = sequelize;
