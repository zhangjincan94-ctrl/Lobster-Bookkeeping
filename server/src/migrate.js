require('dotenv').config();
const { sequelize } = require('./models');

const run = async () => {
  let remainingWeightAdded = false;

  // Create only missing model tables; never alter or reset existing data.
  await sequelize.sync();

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NULL,
      remark VARCHAR(500) NULL,
      share_token VARCHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_suppliers_merchant_id (merchant_id),
      CONSTRAINT fk_suppliers_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [supplierShareTokenColumns] = await sequelize.query(`
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'suppliers'
      AND COLUMN_NAME = 'share_token';
  `);

  if (Number(supplierShareTokenColumns[0].count) === 0) {
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN share_token VARCHAR(64) NULL AFTER remark;
    `);
  }

  await sequelize.query(`
    UPDATE suppliers
    SET share_token = UUID()
    WHERE share_token IS NULL OR share_token = '';
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
    remainingWeightAdded = true;
  }

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

  if (remainingWeightAdded) {
    await sequelize.query(`
      UPDATE purchase_records p
      LEFT JOIN (
        SELECT purchase_record_id, SUM(weight) AS allocated_weight
        FROM transaction_purchase_allocations
        GROUP BY purchase_record_id
      ) a ON a.purchase_record_id = p.id
      SET p.remaining_weight = CASE
        WHEN p.order_status = 1 THEN 0
        ELSE GREATEST(p.net_weight - COALESCE(a.allocated_weight, 0), 0)
      END;
    `);
  }

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

  // 新通用账本与旧龙虾业务表独立，迁移只创建缺失表，不改写旧记录。
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      phone VARCHAR(20) NULL,
      account_start_date DATE NULL,
      remark VARCHAR(500) NULL,
      archived_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_merchant_id (merchant_id),
      INDEX idx_customers_archived_at (archived_at),
      CONSTRAINT fk_customers_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_product_categories_merchant_id (merchant_id),
      CONSTRAINT fk_product_categories_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      category_id INT NULL,
      name VARCHAR(80) NOT NULL,
      unit VARCHAR(20) NOT NULL DEFAULT '件',
      default_unit_price DECIMAL(10, 2) NULL,
      remark VARCHAR(500) NULL,
      archived_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_merchant_id (merchant_id),
      INDEX idx_products_category_id (category_id),
      INDEX idx_products_archived_at (archived_at),
      CONSTRAINT fk_products_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ledger_bills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      customer_id INT NOT NULL,
      direction VARCHAR(10) NOT NULL,
      bill_date DATE NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      remark VARCHAR(500) NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ledger_bills_merchant_date (merchant_id, bill_date),
      INDEX idx_ledger_bills_customer_date (customer_id, bill_date),
      INDEX idx_ledger_bills_deleted_at (deleted_at),
      CONSTRAINT fk_ledger_bills_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_ledger_bills_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ledger_bill_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledger_bill_id INT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(80) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      quantity DECIMAL(10, 2) NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(10, 2) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ledger_bill_items_bill_id (ledger_bill_id),
      INDEX idx_ledger_bill_items_product_id (product_id),
      CONSTRAINT fk_ledger_bill_items_bill FOREIGN KEY (ledger_bill_id) REFERENCES ledger_bills(id),
      CONSTRAINT fk_ledger_bill_items_product FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      customer_id INT NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      payment_date DATE NOT NULL,
      payment_method VARCHAR(20) NULL,
      remark VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customer_payments_merchant_date (merchant_id, payment_date),
      INDEX idx_customer_payments_customer_date (customer_id, payment_date),
      CONSTRAINT fk_customer_payments_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_customer_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS customer_statements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      customer_id INT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      share_token VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_statements_share_token (share_token),
      INDEX idx_customer_statements_customer_id (customer_id),
      CONSTRAINT fk_customer_statements_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      CONSTRAINT fk_customer_statements_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
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
