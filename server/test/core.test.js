const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../src/models');
const transactionService = require('../src/services/transactionService');
const purchaseService = require('../src/services/purchaseService');
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
    '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红(>9钱)'
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
