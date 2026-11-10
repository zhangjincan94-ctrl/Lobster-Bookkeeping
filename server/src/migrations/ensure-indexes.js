require('dotenv').config();
const sequelize = require('../config/database');

const INDEX_SPECS = [
  { table: 'ledger_bills', name: 'idx_ledger_bills_merchant_date', columns: ['merchant_id', 'bill_date'] },
  { table: 'ledger_bills', name: 'idx_ledger_bills_customer_date', columns: ['customer_id', 'bill_date'] },
  { table: 'ledger_bills', name: 'idx_ledger_bills_deleted_at', columns: ['deleted_at'] },
  { table: 'customers', name: 'idx_customers_archived_at', columns: ['archived_at'] },
  { table: 'customer_payments', name: 'idx_customer_payments_merchant_date', columns: ['merchant_id', 'payment_date'] },
  { table: 'customer_payments', name: 'idx_customer_payments_customer_date', columns: ['customer_id', 'payment_date'] },
  { table: 'products', name: 'idx_products_archived_at', columns: ['archived_at'] }
];

const describe = (spec) => `${spec.table}(${spec.columns.join(', ')})`;

const tableExists = async (table) => {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  );
  return Number(rows[0].count) > 0;
};

const getExistingIndexes = async (table) => {
  const [rows] = await sequelize.query(
    `SELECT INDEX_NAME AS index_name, COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    { replacements: [table] }
  );
  const indexes = new Map();
  rows.forEach((row) => {
    const name = String(row.index_name);
    if (!indexes.has(name)) indexes.set(name, []);
    indexes.get(name).push(String(row.column_name).toLowerCase());
  });
  return indexes;
};

// 同名索引或列顺序完全一致的索引都视为已存在，避免重复创建。
const hasEquivalentIndex = (indexes, spec) => {
  if (indexes.has(spec.name)) return true;
  const target = spec.columns.map((column) => column.toLowerCase());
  for (const [name, columns] of indexes) {
    if (name.toUpperCase() === 'PRIMARY') continue;
    if (columns.length !== target.length) continue;
    if (columns.every((column, index) => column === target[index])) return true;
  }
  return false;
};

const createIndexSql = (spec) => {
  const columns = spec.columns.map((column) => `\`${column}\``).join(', ');
  return `CREATE INDEX \`${spec.name}\` ON \`${spec.table}\` (${columns})`;
};

const run = async () => {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of INDEX_SPECS) {
    if (!(await tableExists(spec.table))) {
      console.log(`[索引迁移] 表 ${spec.table} 不存在，跳过 ${describe(spec)}`);
      skipped += 1;
      continue;
    }

    const indexes = await getExistingIndexes(spec.table);
    if (hasEquivalentIndex(indexes, spec)) {
      console.log(`[索引迁移] ${describe(spec)} 已存在，跳过`);
      skipped += 1;
      continue;
    }

    try {
      await sequelize.query(createIndexSql(spec));
      console.log(`[索引迁移] 已创建 ${spec.name}：${describe(spec)}`);
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(`[索引迁移] 创建 ${spec.name} 失败：${err.message}`);
    }
  }

  console.log(`[索引迁移] 完成：创建 ${created} 个，跳过 ${skipped} 个，失败 ${failed} 个`);
  if (failed > 0) process.exitCode = 1;
};

run()
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error('[索引迁移] 执行失败：', err.message);
    await sequelize.close();
    process.exit(1);
  });
