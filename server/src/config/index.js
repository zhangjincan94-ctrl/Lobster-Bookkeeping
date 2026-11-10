const dotenv = require('dotenv');

dotenv.config();

const PLACEHOLDER_PATTERNS = [
  'change-me',
  'change_me',
  'your-secret',
  'your_secret',
  'please-change',
  'please_change',
  'placeholder',
  'example'
];

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const config = {
  port: process.env.PORT || 3000,
  corsOrigin: process.env.CORS_ORIGIN || '',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME || 'lobster_accounting',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    sslCaBase64: process.env.DB_SSL_CA_BASE64 || '',
    poolMax: toPositiveInt(process.env.DB_POOL_MAX, 10),
    acquireMs: toPositiveInt(process.env.DB_ACQUIRE_MS, 30000)
  },
  jwt: {
    secret: process.env.JWT_SECRET || ''
  },
  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || ''
  }
};

// 启动期配置校验：只说明缺失的配置项与配置位置，不输出真实值。
const assertConfig = () => {
  const secret = String(config.jwt.secret || '').trim();
  if (!secret) {
    throw new Error('服务配置缺失：JWT_SECRET 未配置，请在 server/.env 或云函数环境变量中设置至少 32 位的随机字符串');
  }
  if (secret.length < 32) {
    throw new Error('服务配置缺失：JWT_SECRET 长度不足 32 位，请在 server/.env 或云函数环境变量中更换为随机字符串');
  }
  const lowered = secret.toLowerCase();
  if (secret.includes('<') || secret.includes('>') || PLACEHOLDER_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    throw new Error('服务配置缺失：JWT_SECRET 仍为示例占位值，请在 server/.env 或云函数环境变量中更换为随机字符串');
  }

  if (!String(config.db.host || '').trim() || !String(config.db.name || '').trim() || !String(config.db.user || '').trim()) {
    throw new Error('服务配置缺失：数据库 DB_HOST、DB_NAME、DB_USER 必须配置，请在 server/.env 或云函数环境变量中设置');
  }

  return true;
};

module.exports = {
  port: config.port,
  corsOrigin: config.corsOrigin,
  db: config.db,
  jwt: config.jwt,
  wx: config.wx,
  assertConfig
};
