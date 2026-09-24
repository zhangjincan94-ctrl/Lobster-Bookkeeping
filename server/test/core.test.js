const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../src/models');
const transactionService = require('../src/services/transactionService');
const purchaseService = require('../src/services/purchaseService');
const ledgerService = require('../src/services/ledgerService');
const { normalizePagination } = require('../src/utils/pagination');
const {
  serializeTransactionListItem,
  serializePurchaseDetail
} = require('../src/serializers');
const miniProgramConfig = require('../../miniprogram/utils/config');

const createDbTx = () => ({ LOCK: { UPDATE: 'UPDATE' } });

test('创建销售单时拒绝不属于当前商户的买家', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Buyer, 'findOne', async () => null);
  const create = t.mock.method(models.Transaction, 'create', async () => ({}));

  await assert.rejects(
    transactionService.createTransaction(10, {
      buyer_id: 99,
      lobster_size: miniProgramConfig.lobsterSizes[0],
      total_amount: 100,
      transaction_time: '2026-07-10 10:00:00'
    }),
    /买家不存在或不属于当前商户/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('创建采购单时拒绝不属于当前商户的供应商', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Supplier, 'findOne', async () => null);
  const create = t.mock.method(models.PurchaseRecord, 'create', async () => ({}));

  await assert.rejects(
    purchaseService.createPurchase(10, {
      supplier_id: 99,
      lobster_size: miniProgramConfig.lobsterSizes[0],
      net_weight: 10,
      unit_cost: 20,
      received_at: '2026-07-10 10:00:00'
    }),
    /供应商不存在或不属于当前商户/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('销售补录付款在事务中锁定订单并同步汇总', async (t) => {
  const dbTx = createDbTx();
  const updates = [];
  const transaction = {
    id: 7,
    order_status: 0,
    total_amount: '100.00',
    paid_amount: '20.00',
    update: async (values, options) => {
      updates.push({ values, options });
    }
  };

  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Transaction, 'findOne', async (options) => {
    assert.equal(options.transaction, dbTx);
    assert.equal(options.lock, 'UPDATE');
    return transaction;
  });
  const create = t.mock.method(models.PaymentRecord, 'create', async (values, options) => {
    assert.equal(options.transaction, dbTx);
    return { id: 1, ...values };
  });

  const result = await transactionService.addPaymentRecord(10, 7, {
    amount: '30.00',
    paid_at: '2026-07-10'
  });

  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(updates[0].values, { paid_amount: 50, payment_status: 2 });
  assert.equal(updates[0].options.transaction, dbTx);
  assert.equal(result.transaction.paid_amount, 50);
});

test('销售补录付款拒绝超过剩余未付金额', async (t) => {
  const dbTx = createDbTx();
  const transaction = {
    id: 7,
    order_status: 0,
    total_amount: '100.00',
    paid_amount: '80.00'
  };

  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Transaction, 'findOne', async () => transaction);
  const create = t.mock.method(models.PaymentRecord, 'create', async () => ({}));

  await assert.rejects(
    transactionService.addPaymentRecord(10, 7, {
      amount: '20.01',
      paid_at: '2026-07-10'
    }),
    /付款金额不能超过剩余未付金额/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('已分摊货源的销售单不能修改重量', async (t) => {
  const dbTx = createDbTx();
  const transaction = {
    id: 7,
    order_status: 0,
    lobster_size: miniProgramConfig.lobsterSizes[0],
    weight: '10.00',
    unit_price: '30.00',
    total_amount: '300.00',
    paid_amount: '0.00'
  };

  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Transaction, 'findOne', async () => transaction);
  t.mock.method(models.TransactionPurchaseAllocation, 'count', async () => 1);

  await assert.rejects(
    transactionService.updateTransaction(10, 7, { weight: '9.00' }),
    /已分摊货源的销售单不能修改规格或重量/
  );
});

test('已分摊采购单可增加净重并按分摊量更新剩余库存', async (t) => {
  const dbTx = createDbTx();
  let updateValues;
  const purchase = {
    id: 8,
    supplier_id: 3,
    lobster_size: miniProgramConfig.lobsterSizes[0],
    net_weight: '10.00',
    remaining_weight: '6.00',
    unit_cost: '20.00',
    total_cost: '200.00',
    paid_amount: '0.00',
    order_status: 0,
    update: async (values, options) => {
      updateValues = values;
      Object.assign(purchase, values);
      assert.equal(options.transaction, dbTx);
    }
  };

  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.PurchaseRecord, 'findOne', async () => purchase);
  t.mock.method(models.TransactionPurchaseAllocation, 'sum', async () => '4.00');
  t.mock.method(models.Supplier, 'findOne', async () => ({ id: 3, name: '测试供应商' }));

  await purchaseService.updatePurchase(10, 8, { net_weight: '12.00' });

  assert.equal(updateValues.net_weight, '12.00');
  assert.equal(updateValues.remaining_weight, 8);
  assert.equal(updateValues.total_cost, 240);
});

test('采购分享查询使用正确关联别名并记录失效链接上下文', async (t) => {
  let queryOptions;
  t.mock.method(models.PurchaseRecord, 'findOne', async (options) => {
    queryOptions = options;
    return null;
  });

  await assert.rejects(
    purchaseService.getPurchaseShareData('12345678-secret'),
    (err) => {
      assert.equal(err.status, 404);
      assert.deepEqual(err.context, {
        feature: '查看采购分享记录',
        shareTokenPrefix: '12345678'
      });
      return true;
    }
  );
  assert.deepEqual(queryOptions.include.map(item => item.as), [
    'supplier',
    'SupplierPaymentRecords'
  ]);
});

test('销售列表结束日期包含当天结束时间', async (t) => {
  let queryOptions;
  t.mock.method(models.Transaction, 'findAndCountAll', async (options) => {
    queryOptions = options;
    return { count: 0, rows: [] };
  });

  await transactionService.listTransactions(10, {
    end_date: '2026-07-10',
    page: 1,
    pageSize: 20
  });

  const endDate = queryOptions.where.transaction_time[models.Sequelize.Op.lte];
  assert.equal(endDate.getHours(), 23);
  assert.equal(endDate.getMinutes(), 59);
  assert.equal(endDate.getSeconds(), 59);
});

test('采购和销售页面共用同一份龙虾规格', () => {
  assert.deepEqual(miniProgramConfig.lobsterSizes, [
    '小青(2-4钱)', '中青(4-6钱)', '大青(6-8钱)', '炮头青(>9钱)',
    '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红(>9钱)', '统货'
  ]);
});

test('分页参数限制为有效正整数且最多100条', () => {
  assert.deepEqual(normalizePagination({ page: '-2', pageSize: '1000' }), {
    page: 1,
    pageSize: 100
  });
  assert.deepEqual(normalizePagination({ page: '3', page_size: '20' }), {
    page: 3,
    pageSize: 20
  });
});

test('序列化器读取Sequelize实际关联别名', () => {
  assert.ok(models.PurchaseRecord.associations.supplier);
  assert.ok(models.TransactionPurchaseAllocation.associations.transaction);

  const transaction = serializeTransactionListItem({
    id: 1,
    buyer_id: 2,
    buyer: { id: 2, name: '测试买家' }
  });
  assert.equal(transaction.buyer_name, '测试买家');

  const purchase = serializePurchaseDetail({
    id: 3,
    supplier: { id: 4, name: '测试供应商' },
    SupplierPaymentRecords: [],
    TransactionAllocations: [{
      id: 5,
      transaction_id: 6,
      weight: '2.00',
      unit_cost: '10.00',
      total_cost: '20.00',
      transaction: {
        transaction_time: '2026-07-10 10:00:00',
        buyer: { name: '分摊买家' }
      }
    }]
  });
  assert.equal(purchase.supplier.name, '测试供应商');
  assert.equal(purchase.transaction_allocations[0].buyer_name, '分摊买家');
});

test('多商品账单按商品数量和单价计算总额', async (t) => {
  const dbTx = createDbTx();
  let createdItems;
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, name: '测试客户' }));
  t.mock.method(models.Product, 'findAll', async () => ([
    { id: 5, name: '大闸蟹', unit: '箱' },
    { id: 6, name: '冰鲜虾', unit: '斤' }
  ]));
  t.mock.method(models.LedgerBill, 'create', async () => ({ id: 9 }));
  t.mock.method(models.LedgerBillItem, 'bulkCreate', async (items, options) => {
    createdItems = { items, options };
  });
  t.mock.method(models.LedgerBill, 'findOne', async () => ({
    id: 9,
    customer_id: 2,
    direction: 'sale',
    bill_date: '2026-07-11',
    total_amount: '39.50',
    remark: '',
    customer: { name: '测试客户' },
    items: [
      { id: 1, product_id: 5, product_name: '大闸蟹', unit: '箱', quantity: '2', unit_price: '10', subtotal: '20' },
      { id: 2, product_id: 6, product_name: '冰鲜虾', unit: '斤', quantity: '1.5', unit_price: '9.666', subtotal: '14.50' },
      { id: 3, product_id: null, product_name: '散装虾', unit: '斤', quantity: '1', unit_price: '5', subtotal: '5.00' }
    ]
  }));

  const bill = await ledgerService.createBill(10, {
    customer_id: 2,
    direction: 'sale',
    bill_date: '2026-07-11',
    items: [
      { product_id: 5, quantity: 2, unit_price: 10 },
      { product_id: 6, quantity: 1.5, unit_price: '9.666' },
      { product_name: ' 散装虾 ', unit: '斤', quantity: 1, unit_price: 5 }
    ]
  });

  assert.equal(createdItems.options.transaction, dbTx);
  assert.deepEqual(createdItems.items.map((item) => item.subtotal), [20, 14.5, 5]);
  assert.deepEqual(createdItems.items[2], {
    ledger_bill_id: 9,
    product_id: null,
    product_name: '散装虾',
    unit: '斤',
    quantity: 1,
    unit_price: 5,
    subtotal: 5
  });
  assert.equal(bill.total_amount, 39.5);
});

test('多商品账单拒绝商品名称为空的手工明细', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, name: '测试客户' }));
  const create = t.mock.method(models.LedgerBill, 'create', async () => ({ id: 9 }));

  await assert.rejects(
    ledgerService.createBill(10, {
      customer_id: 2,
      direction: 'sale',
      bill_date: '2026-07-11',
      items: [{ product_name: '   ', unit: '斤', quantity: 1, unit_price: 5 }]
    }),
    /商品名称不能为空/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('多商品账单拒绝不属于当前店铺的商品库记录', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, name: '测试客户' }));
  t.mock.method(models.Product, 'findAll', async () => []);
  const create = t.mock.method(models.LedgerBill, 'create', async () => ({ id: 9 }));

  await assert.rejects(
    ledgerService.createBill(10, {
      customer_id: 2,
      direction: 'sale',
      bill_date: '2026-07-11',
      items: [{ product_id: 99, product_name: '其他店铺商品', quantity: 1, unit_price: 5 }]
    }),
    /商品不存在或不属于当前店铺/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('修改账单在事务中替换商品明细并重新计算总额', async (t) => {
  const dbTx = createDbTx();
  const updatedValues = [];
  let createdItems;
  const existingBill = {
    id: 9,
    update: async (values, options) => {
      updatedValues.push({ values, options });
    }
  };

  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 3, name: '修改后客户' }));
  t.mock.method(models.Product, 'findAll', async () => ([{ id: 5, name: '大闸蟹', unit: '箱' }]));
  t.mock.method(models.LedgerBill, 'findOne', async (options) => {
    if (options.transaction) {
      assert.equal(options.transaction, dbTx);
      assert.equal(options.lock, 'UPDATE');
      return existingBill;
    }
    return {
      id: 9,
      customer_id: 3,
      direction: 'sale',
      bill_date: '2026-07-14',
      total_amount: '35.00',
      remark: '已修改',
      customer: { name: '修改后客户' },
      items: [
        { id: 3, product_id: 5, product_name: '大闸蟹', unit: '箱', quantity: '3', unit_price: '10', subtotal: '30' },
        { id: 4, product_id: null, product_name: '散装虾', unit: '斤', quantity: '1', unit_price: '5', subtotal: '5' }
      ]
    };
  });
  const destroy = t.mock.method(models.LedgerBillItem, 'destroy', async (options) => {
    assert.deepEqual(options.where, { ledger_bill_id: 9 });
    assert.equal(options.transaction, dbTx);
    return 2;
  });
  t.mock.method(models.LedgerBillItem, 'bulkCreate', async (items, options) => {
    createdItems = { items, options };
  });

  const bill = await ledgerService.updateBill(10, 9, {
    customer_id: 3,
    direction: 'sale',
    bill_date: '2026-07-14',
    remark: '已修改',
    items: [
      { product_id: 5, quantity: 3, unit_price: 10 },
      { product_name: '散装虾', unit: '斤', quantity: 1, unit_price: 5 }
    ]
  });

  assert.equal(destroy.mock.callCount(), 1);
  assert.equal(updatedValues[0].options.transaction, dbTx);
  assert.deepEqual(updatedValues[0].values, {
    customer_id: 3,
    direction: 'sale',
    bill_date: '2026-07-14',
    total_amount: 35,
    remark: '已修改'
  });
  assert.equal(createdItems.options.transaction, dbTx);
  assert.deepEqual(createdItems.items.map((item) => item.product_name), ['大闸蟹', '散装虾']);
  assert.equal(bill.total_amount, 35);
});

test('通用账本分别计算待收和待付，不互相抵消', async (t) => {
  t.mock.method(models.Customer, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ id: 2, name: '双向往来客户', phone: '', remark: '' }]
  }));
  t.mock.method(models.LedgerBill, 'findAll', async () => ([{
    customer_id: 2,
    sales_amount: '100.00',
    purchase_amount: '80.00'
  }]));
  t.mock.method(models.CustomerPayment, 'findAll', async () => ([{
    customer_id: 2,
    received_amount: '20.00',
    paid_amount: '10.00'
  }]));

  const result = await ledgerService.listCustomers(10, { page: 1, pageSize: 20 });

  assert.equal(result.list[0].receivable_balance, 80);
  assert.equal(result.list[0].payable_balance, 70);
  assert.equal(result.list[0].balance, 10);
});

test('未结清的往来对象不能归档，且不修改记录', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  const update = t.mock.fn(async () => {});
  t.mock.method(models.Customer, 'findOne', async (options) => {
    assert.deepEqual(options.where, { id: 2, merchant_id: 10 });
    assert.equal(options.transaction, dbTx);
    assert.equal(options.lock, 'UPDATE');
    return { id: 2, archived_at: null, update };
  });
  t.mock.method(models.LedgerBill, 'findAll', async () => ([{
    customer_id: 2, sales_amount: '100.00', purchase_amount: '100.00'
  }]));
  t.mock.method(models.CustomerPayment, 'findAll', async () => ([{
    customer_id: 2, received_amount: '100.00', paid_amount: '20.00'
  }]));

  await assert.rejects(ledgerService.archiveCustomer(10, 2), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /待收或待付款/);
    return true;
  });
  assert.equal(update.mock.callCount(), 0);
});

test('已结清的往来对象软归档并保留历史账单', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  const update = t.mock.fn(async () => {});
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, archived_at: null, update }));
  t.mock.method(models.LedgerBill, 'findAll', async () => ([{
    customer_id: 2, sales_amount: '100.00', purchase_amount: '0.00'
  }]));
  t.mock.method(models.CustomerPayment, 'findAll', async () => ([{
    customer_id: 2, received_amount: '100.00', paid_amount: '0.00'
  }]));

  assert.deepEqual(await ledgerService.archiveCustomer(10, 2), { id: 2, archived: true });
  assert.equal(update.mock.callCount(), 1);
  assert.ok(update.mock.calls[0].arguments[0].archived_at instanceof Date);
  assert.equal(update.mock.calls[0].arguments[1].transaction, dbTx);
});

test('已归档的往来对象不能再用于开单', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async (options) => {
    assert.equal(options.transaction, dbTx);
    assert.equal(options.lock, 'UPDATE');
    return { id: 2, archived_at: new Date() };
  });
  const create = t.mock.method(models.LedgerBill, 'create', async () => ({}));

  await assert.rejects(ledgerService.createBill(10, {
    customer_id: 2, direction: 'sale', bill_date: '2026-09-24',
    items: [{ product_name: '商品', quantity: 1, unit_price: 10 }]
  }), /往来对象已归档/);
  assert.equal(create.mock.callCount(), 0);
});

test('供应商付款在事务中锁定往来对象并减少待付', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async (options) => {
    assert.deepEqual(options.where, { id: 2, merchant_id: 10 });
    assert.equal(options.transaction, dbTx);
    assert.equal(options.lock, 'UPDATE');
    return { id: 2, name: '测试供应商' };
  });
  t.mock.method(models.LedgerBill, 'findAll', async (options) => {
    assert.equal(options.transaction, dbTx);
    return [{ customer_id: 2, sales_amount: '0.00', purchase_amount: '100.00' }];
  });
  t.mock.method(models.CustomerPayment, 'findAll', async (options) => {
    assert.equal(options.transaction, dbTx);
    return [{ customer_id: 2, received_amount: '0.00', paid_amount: '20.00' }];
  });
  const create = t.mock.method(models.CustomerPayment, 'create', async (values, options) => {
    assert.equal(options.transaction, dbTx);
    return { id: 8, payment_date: values.payment_date, ...values };
  });

  const result = await ledgerService.createCustomerPayment(10, {
    customer_id: 2,
    flow_type: 'paid',
    amount: 30,
    payment_date: '2026-07-15'
  });

  assert.equal(create.mock.callCount(), 1);
  assert.equal(create.mock.calls[0].arguments[0].flow_type, 'paid');
  assert.equal(result.balance_before, 80);
  assert.equal(result.balance_after, 50);
});

test('旧客户端不传收付款类型时仍按客户回款处理', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, name: '测试客户' }));
  t.mock.method(models.LedgerBill, 'findAll', async () => ([{
    customer_id: 2,
    sales_amount: '100.00',
    purchase_amount: '0.00'
  }]));
  t.mock.method(models.CustomerPayment, 'findAll', async () => ([{
    customer_id: 2,
    received_amount: '20.00',
    paid_amount: '0.00'
  }]));
  const create = t.mock.method(models.CustomerPayment, 'create', async (values) => ({ id: 9, ...values }));

  const result = await ledgerService.createCustomerPayment(10, {
    customer_id: 2,
    amount: 30,
    payment_date: '2026-07-15'
  });

  assert.equal(create.mock.calls[0].arguments[0].flow_type, 'received');
  assert.equal(result.balance_before, 80);
  assert.equal(result.balance_after, 50);
});

test('供应商付款拒绝超过当前待付余额', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => ({ id: 2, name: '测试供应商' }));
  t.mock.method(models.LedgerBill, 'findAll', async () => ([{
    customer_id: 2,
    sales_amount: '0.00',
    purchase_amount: '50.00'
  }]));
  t.mock.method(models.CustomerPayment, 'findAll', async () => ([{
    customer_id: 2,
    received_amount: '0.00',
    paid_amount: '20.00'
  }]));
  const create = t.mock.method(models.CustomerPayment, 'create', async () => ({}));

  await assert.rejects(
    ledgerService.createCustomerPayment(10, {
      customer_id: 2,
      flow_type: 'paid',
      amount: 31,
      payment_date: '2026-07-15'
    }),
    /供应商付款不能超过当前待付余额/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('供应商付款拒绝其他商户的往来对象', async (t) => {
  const dbTx = createDbTx();
  t.mock.method(models.sequelize, 'transaction', async (callback) => callback(dbTx));
  t.mock.method(models.Customer, 'findOne', async () => null);
  const create = t.mock.method(models.CustomerPayment, 'create', async () => ({}));

  await assert.rejects(
    ledgerService.createCustomerPayment(10, {
      customer_id: 99,
      flow_type: 'paid',
      amount: 10,
      payment_date: '2026-07-15'
    }),
    /客户不存在或不属于当前店铺/
  );
  assert.equal(create.mock.callCount(), 0);
});

test('通用账本拒绝未知账单方向、收付款类型和无效金额', async () => {
  await assert.rejects(
    ledgerService.createBill(10, {
      customer_id: 2,
      direction: 'transfer',
      bill_date: '2026-07-11',
      items: []
    }),
    /账单方向必须是出货或进货/
  );
  await assert.rejects(
    ledgerService.createCustomerPayment(10, {
      customer_id: 2,
      amount: 0,
      payment_date: '2026-07-11'
    }),
    /往来对象、金额和日期必须正确填写/
  );
  await assert.rejects(
    ledgerService.createCustomerPayment(10, {
      customer_id: 2,
      flow_type: 'refund',
      amount: 10,
      payment_date: '2026-07-11'
    }),
    /收付款类型不正确/
  );
});

test('结账信息拒绝错误的日期范围，且不修改账单或回款', async () => {
  await assert.rejects(
    ledgerService.createCustomerStatement(10, {
      customer_id: 2,
      start_date: '2026-07-12',
      end_date: '2026-07-11'
    }),
    /客户和结账日期范围必须正确填写/
  );
  assert.ok(models.CustomerStatement.associations.customer);
});
