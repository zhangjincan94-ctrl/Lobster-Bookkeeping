require('dotenv').config();
const sequelize = require('../config/database');

const TABLE = 'customer_statements';
const COLUMNS = [
  { name: 'expires_at', definition: 'DATETIME NULL' },
  { name: 'revoked_at', definition: 'DATETIME NULL' }
];

const tableExists = async () => {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [TABLE] }
  );
  return Number(rows[0].count) > 0;
};

const columnExists = async (column) => {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    { replacements: [TABLE, column] }
  );
  return Number(rows[0].count) > 0;
};

const run = async () => {
  if (!(await tableExists())) {
    console.log(`[分享迁移] 表 ${TABLE} 不存在，跳过`);
    return;
  }

  for (const column of COLUMNS) {
    if (await columnExists(column.name)) {
      console.log(`[分享迁移] ${TABLE}.${column.name} 已存在，跳过`);
      continue;
    }
    await sequelize.query(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${column.name}\` ${column.definition}`
    );
    console.log(`[分享迁移] 已新增列 ${TABLE}.${column.name}`);
  }
};

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('[分享迁移] 执行失败：', err.message);
    await sequelize.close();
    process.exit(1);
  });
