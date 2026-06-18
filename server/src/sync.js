require('dotenv').config();
const { sequelize } = require('./models');

sequelize.sync({ force: true }).then(() => {
  console.log('数据库表已创建');
  process.exit(0);
}).catch((err) => {
  console.error('创建表失败:', err);
  process.exit(1);
});
