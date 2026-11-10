require('dotenv').config();
const sequelize = require('../config/database');

const TABLE = 'request_keys';

const tableExists = async () => {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [TABLE] }
  );
  return Number(rows[0].count) > 0;
};

const uniqueIndexExists = async () => {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = 'uk_request_keys_key'`,
    { replacements: [TABLE] }
  );
  return Number(rows[0].count) > 0;
};

const createTableSql = `
  CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(128) NOT NULL,
    merchant_id INT NOT NULL,
    route VARCHAR(64) NOT NULL,
    response_json TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_request_keys_key (\`key\`, merchant_id, route),
    CONSTRAINT fk_request_keys_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const run = async () => {
  if (!(await tableExists())) {
    await sequelize.query(createTableSql);
    console.log(`[幂等迁移] 已创建表 ${TABLE}`);
  } else {
    console.log(`[幂等迁移] 表 ${TABLE} 已存在，跳过`);
  }

  if (await uniqueIndexExists()) {
    console.log('[幂等迁移] 唯一索引 uk_request_keys_key 已存在，跳过');
    return;
  }

  await sequelize.query(
    `CREATE UNIQUE INDEX uk_request_keys_key ON \`${TABLE}\` (\`key\`, merchant_id, route)`
  );
  console.log('[幂等迁移] 已创建唯一索引 uk_request_keys_key');
};

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('[幂等迁移] 执行失败：', err.message);
    await sequelize.close();
    process.exit(1);
  });
