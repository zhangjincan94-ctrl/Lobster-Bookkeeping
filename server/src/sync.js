require('dotenv').config();
const { sequelize } = require('./models');

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_RESET !== 'true') {
  console.error('[数据库重置失败]', {
    feature: '数据库重置',
    reason: '仅允许在非生产环境显式设置 ALLOW_DB_RESET=true 后执行'
  });
  process.exit(1);
}

sequelize.sync({ force: true }).then(() => {
  console.log('数据库表已创建');
  process.exit(0);
}).catch((err) => {
  console.error('创建表失败:', err);
  process.exit(1);
});
