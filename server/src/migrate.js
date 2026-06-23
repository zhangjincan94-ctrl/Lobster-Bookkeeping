require('dotenv').config();
const sequelize = require('./config/database');

const run = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NULL,
      remark VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_suppliers_merchant_id (merchant_id),
      CONSTRAINT fk_suppliers_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS purchase_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      supplier_id INT NOT NULL,
      lobster_size VARCHAR(30) NOT NULL,
      gross_weight DECIMAL(10, 2) NOT NULL DEFAULT 0,
      tare_weight DECIMAL(10, 2) NOT NULL DEFAULT 0,
      deduct_weight DECIMAL(10, 2) NOT NULL DEFAULT 0,
      net_weight DECIMAL(10, 2) NOT NULL,
      unit_cost DECIMAL(10, 2) NOT NULL,
      total_cost DECIMAL(10, 2) NOT NULL,
      settlement_status TINYINT NOT NULL DEFAULT 0,
      paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      received_at DATETIME NOT NULL,
      order_status TINYINT NOT NULL DEFAULT 0,
      cancelled_at DATETIME NULL,
      remark VARCHAR(500) NULL,
      share_token VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_purchase_merchant_id (merchant_id),
      INDEX idx_purchase_supplier_id (supplier_id),
      CONSTRAINT fk_purchase_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_purchase_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [remainingWeightColumns] = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_records'
      AND COLUMN_NAME = 'remaining_weight';
  `);

  if (Number(remainingWeightColumns[0].count) === 0) {
    await sequelize.query(`
      ALTER TABLE purchase_records
      ADD COLUMN remaining_weight DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER net_weight;
    `);
  }

  await sequelize.query(`
    UPDATE purchase_records
    SET remaining_weight = net_weight
    WHERE remaining_weight = 0 AND order_status != 1;
  `);

  const [shareTokenColumns] = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_records'
      AND COLUMN_NAME = 'share_token';
  `);

  if (Number(shareTokenColumns[0].count) === 0) {
    await sequelize.query(`
      ALTER TABLE purchase_records
      ADD COLUMN share_token VARCHAR(64) NULL AFTER remark;
    `);
  }

  await sequelize.query(`
    UPDATE purchase_records
    SET share_token = UUID()
    WHERE share_token IS NULL OR share_token = '';
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS supplier_payment_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_record_id INT NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      payment_method VARCHAR(20) NULL,
      paid_at DATETIME NOT NULL,
      note VARCHAR(200) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_supplier_payments_purchase_id (purchase_record_id),
      CONSTRAINT fk_supplier_payments_purchase FOREIGN KEY (purchase_record_id) REFERENCES purchase_records(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS transaction_purchase_allocations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      purchase_record_id INT NOT NULL,
      weight DECIMAL(10, 2) NOT NULL,
      unit_cost DECIMAL(10, 2) NOT NULL,
      total_cost DECIMAL(10, 2) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tpa_transaction_id (transaction_id),
      INDEX idx_tpa_purchase_record_id (purchase_record_id),
      CONSTRAINT fk_tpa_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      CONSTRAINT fk_tpa_purchase_record FOREIGN KEY (purchase_record_id) REFERENCES purchase_records(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS other_costs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      cost_type VARCHAR(20) NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      cost_date DATETIME NOT NULL,
      remark VARCHAR(200) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_other_costs_merchant_id (merchant_id),
      INDEX idx_other_costs_cost_date (cost_date),
      CONSTRAINT fk_other_costs_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('数据库迁移已完成');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('数据库迁移失败:', err);
    process.exit(1);
  });
