const {
  sequelize,
  Sequelize,
  Customer,
  ProductCategory,
  Product,
  LedgerBill,
  LedgerBillItem,
  CustomerPayment,
  CustomerStatement
} = require('../models');
const { randomUUID } = require('crypto');
const {
  isValidDate,
  assertAmount,
  assertStringLength,
  assertArrayLength
} = require('../utils/validate');

const { Op } = Sequelize;

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round(value * 100) / 100;

const serviceError = (message, status, context) => {
  const err = new Error(message);
  err.status = status;
  err.context = context;
  return err;
};

const buildDateRange = (startDate, endDate) => {
  const range = {};
  if (startDate) range[Op.gte] = startDate;
  if (endDate) range[Op.lte] = endDate;
  return range;
};

const serializeCustomer = (customer, summary = {}) => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone || '',
  account_start_date: customer.account_start_date || '',
  remark: customer.remark || '',
  archived: Boolean(customer.archived_at),
  sales_amount: roundMoney(toNumber(summary.salesAmount)),
  purchase_amount: roundMoney(toNumber(summary.purchaseAmount)),
  received_amount: roundMoney(toNumber(summary.receivedAmount)),
  paid_amount: roundMoney(toNumber(summary.paidAmount)),
  receivable_balance: roundMoney(toNumber(summary.receivableBalance)),
  payable_balance: roundMoney(toNumber(summary.payableBalance)),
  balance: roundMoney(toNumber(summary.balance))
});

const serializeProduct = (product) => ({
  id: product.id,
  category_id: product.category_id || null,
  category_name: product.category ? product.category.name : '',
  name: product.name,
  unit: product.unit,
  default_unit_price: product.default_unit_price === null ? null : roundMoney(toNumber(product.default_unit_price)),
  remark: product.remark || ''
});

const serializeBill = (bill, { withItems = true } = {}) => {
  const data = {
    id: bill.id,
    customer_id: bill.customer_id,
    customer_name: bill.customer ? bill.customer.name : '',
    direction: bill.direction,
    bill_date: bill.bill_date,
    total_amount: roundMoney(toNumber(bill.total_amount)),
    remark: bill.remark || '',
    item_count: bill.item_count === undefined ? (bill.items ? bill.items.length : 0) : bill.item_count
  };
  if (withItems) {
    data.items = (bill.items || []).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      unit: item.unit,
      quantity: roundMoney(toNumber(item.quantity)),
      unit_price: roundMoney(toNumber(item.unit_price)),
      subtotal: roundMoney(toNumber(item.subtotal))
    }));
  }
  return data;
};

const findCustomer = async (merchantId, customerId, transaction, lockForUpdate = false, includeArchived = false) => {
  const customer = await Customer.findOne({
    where: { id: customerId, merchant_id: merchantId },
    transaction,
    ...(lockForUpdate && transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!customer) {
    throw serviceError('客户不存在或不属于当前店铺', 404, {
      feature: '通用账本客户校验', merchantId, customerId
    });
  }
  if (customer.archived_at && !includeArchived) {
    throw serviceError('往来对象已归档', 404, {
      feature: '通用账本客户校验', reason: '往来对象已归档', merchantId, customerId
    });
  }
  return customer;
};

const getCustomerSummaries = async (merchantId, customerIds, transaction) => {
  const summaries = new Map();
  if (!customerIds.length) return summaries;

  const billRows = await LedgerBill.findAll({
    where: {
      merchant_id: merchantId,
      customer_id: { [Op.in]: customerIds },
      deleted_at: null
    },
    attributes: [
      'customer_id',
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN direction = 'sale' THEN total_amount ELSE 0 END")), 0), 'sales_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN direction = 'purchase' THEN total_amount ELSE 0 END")), 0), 'purchase_amount']
    ],
    group: ['customer_id'],
    raw: true,
    transaction
  });

  const paymentRows = await CustomerPayment.findAll({
    where: { merchant_id: merchantId, customer_id: { [Op.in]: customerIds } },
    attributes: [
      'customer_id',
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN flow_type = 'paid' THEN 0 ELSE amount END")), 0), 'received_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN flow_type = 'paid' THEN amount ELSE 0 END")), 0), 'paid_amount']
    ],
    group: ['customer_id'],
    raw: true,
    transaction
  });

  billRows.forEach((row) => {
    summaries.set(String(row.customer_id), {
      salesAmount: toNumber(row.sales_amount),
      purchaseAmount: toNumber(row.purchase_amount),
      receivedAmount: 0,
      paidAmount: 0
    });
  });
  paymentRows.forEach((row) => {
    const summary = summaries.get(String(row.customer_id)) || {
      salesAmount: 0,
      purchaseAmount: 0,
      receivedAmount: 0,
      paidAmount: 0
    };
    summary.receivedAmount = toNumber(row.received_amount);
    summary.paidAmount = toNumber(row.paid_amount);
    summaries.set(String(row.customer_id), summary);
  });
  summaries.forEach((summary) => {
    summary.receivableBalance = roundMoney(Math.max(summary.salesAmount - summary.receivedAmount, 0));
    summary.payableBalance = roundMoney(Math.max(summary.purchaseAmount - summary.paidAmount, 0));
    summary.balance = roundMoney(summary.receivableBalance - summary.payableBalance);
  });
  return summaries;
};

const getCustomerPaymentTotals = async (merchantId, customerId, transaction) => {
  const row = await CustomerPayment.findOne({
    where: { merchant_id: merchantId, customer_id: customerId },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN flow_type = 'paid' THEN 0 ELSE amount END")), 0), 'received_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal("CASE WHEN flow_type = 'paid' THEN amount ELSE 0 END")), 0), 'paid_amount']
    ],
    raw: true,
    transaction
  });
  return {
    receivedAmount: roundMoney(toNumber(row && row.received_amount)),
    paidAmount: roundMoney(toNumber(row && row.paid_amount))
  };
};

const getCustomerBillTotal = async (merchantId, customerId, direction, excludeBillId, transaction) => {
  const where = { merchant_id: merchantId, customer_id: customerId, direction, deleted_at: null };
  if (excludeBillId) where.id = { [Op.ne]: excludeBillId };
  const total = await LedgerBill.sum('total_amount', { where, transaction });
  return roundMoney(toNumber(total));
};

// 账单/收付款没有外键关联，资金一致性只能按客户维度聚合判断。
const assertFundsConsistent = (direction, billTotal, paidTotal, feature, context) => {
  const remaining = roundMoney(billTotal - paidTotal);
  if (remaining >= 0) return;
  const message = direction === 'purchase'
    ? '删除或修改后将导致已付款超过应付，请先调整收付款记录'
    : '删除或修改后将导致已回款超过应收，请先调整收付款记录';
  throw serviceError(message, 409, { feature, ...context });
};

const listCustomers = async (merchantId, { keyword, page = 1, pageSize = 20, archived = false }) => {
  const where = { merchant_id: merchantId, archived_at: archived ? { [Op.ne]: null } : null };
  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { phone: { [Op.like]: `%${keyword}%` } }
    ];
  }
  const offset = (page - 1) * pageSize;
  const { count, rows } = await Customer.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['id', 'DESC']]
  });
  const summaries = await getCustomerSummaries(merchantId, rows.map((item) => item.id));
  return {
    list: rows.map((item) => serializeCustomer(item, summaries.get(String(item.id)))),
    total: count
  };
};

const getTradeStats = async (merchantId, { days = 7, endDate } = {}) => {
  const periodDays = Number(days);
  if (![7, 30].includes(periodDays) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
    throw serviceError('统计周期或日期无效', 400, {
      feature: '交易统计', reason: '参数无效', merchantId, days, endDate
    });
  }
  const end = new Date(endDate + 'T12:00:00Z');
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== endDate) {
    throw serviceError('统计日期无效', 400, {
      feature: '交易统计', reason: '日期不存在', merchantId, endDate
    });
  }
  const dateAt = (offset) => {
    const value = new Date(end);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const currentStart = dateAt(1 - periodDays);
  const previousStart = dateAt(1 - periodDays * 2);
  const rows = await LedgerBill.findAll({
    where: {
      merchant_id: merchantId,
      deleted_at: null,
      bill_date: { [Op.between]: [previousStart, endDate] }
    },
    attributes: [
      'bill_date', 'direction',
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
    ],
    group: ['bill_date', 'direction'],
    order: [['bill_date', 'ASC']],
    raw: true
  });
  const totals = { sale: 0, purchase: 0, count: 0 };
  const previous = { sale: 0, purchase: 0, count: 0 };
  const daily = {};
  rows.forEach((row) => {
    const date = String(row.bill_date);
    const target = date >= currentStart ? totals : previous;
    const direction = row.direction;
    if (direction !== 'sale' && direction !== 'purchase') {
      console.warn('[交易统计数据异常]', { feature: '交易统计', reason: '未知账单方向', merchantId, date, direction });
      return;
    }
    const amount = Math.round(toNumber(row.amount) * 100);
    target[direction] += amount;
    target.count += Number(row.order_count) || 0;
    if (date >= currentStart) {
      if (!daily[date]) daily[date] = { date, sale: 0, purchase: 0, count: 0 };
      daily[date][direction] += amount;
      daily[date].count += Number(row.order_count) || 0;
    }
  });
  const money = (cents) => roundMoney(cents / 100);
  return {
    days: periodDays,
    start_date: currentStart,
    end_date: endDate,
    sale_amount: money(totals.sale),
    purchase_amount: money(totals.purchase),
    order_count: totals.count,
    previous_sale_amount: money(previous.sale),
    previous_purchase_amount: money(previous.purchase),
    previous_order_count: previous.count,
    daily: Object.keys(daily).sort().map((date) => ({
      date,
      sale_amount: money(daily[date].sale),
      purchase_amount: money(daily[date].purchase),
      order_count: daily[date].count
    }))
  };
};

const createCustomer = async (merchantId, data) => {
  const name = String(data.name || '').trim();
  if (!name) {
    throw serviceError('客户名称不能为空', 400, { feature: '新增客户', merchantId });
  }
  if (data.account_start_date && !isValidDate(data.account_start_date)) {
    throw serviceError('会计起始日格式无效', 400, { feature: '新增客户', merchantId });
  }
  const customer = await Customer.create({
    merchant_id: merchantId,
    name,
    phone: String(data.phone || '').trim() || null,
    account_start_date: data.account_start_date || null,
    remark: String(data.remark || '').trim() || null
  });
  return serializeCustomer(customer);
};

const updateCustomer = async (merchantId, customerId, data) => {
  const customer = await findCustomer(merchantId, customerId);
  if (data.account_start_date !== undefined && data.account_start_date && !isValidDate(data.account_start_date)) {
    throw serviceError('会计起始日格式无效', 400, { feature: '修改客户', merchantId, customerId });
  }
  const updateFields = {};
  ['name', 'phone', 'account_start_date', 'remark'].forEach((field) => {
    if (data[field] !== undefined) updateFields[field] = data[field] || null;
  });
  if (updateFields.name !== undefined) {
    updateFields.name = String(updateFields.name || '').trim();
    if (!updateFields.name) {
      throw serviceError('客户名称不能为空', 400, { feature: '修改客户', merchantId, customerId });
    }
  }
  await customer.update(updateFields);
  const summaries = await getCustomerSummaries(merchantId, [customerId]);
  return serializeCustomer(customer, summaries.get(String(customerId)));
};

const archiveCustomer = async (merchantId, customerId) => {
  return sequelize.transaction(async (transaction) => {
    const customer = await findCustomer(merchantId, customerId, transaction, true);
    const summaries = await getCustomerSummaries(merchantId, [customerId], transaction);
    const summary = summaries.get(String(customerId));
    if (summary && (summary.receivableBalance > 0 || summary.payableBalance > 0)) {
      throw serviceError('该往来对象还有待收或待付款，请结清后删除', 400, {
        feature: '归档往来对象', reason: '往来余额未结清', merchantId, customerId,
        receivableBalance: summary.receivableBalance, payableBalance: summary.payableBalance
      });
    }
    await customer.update({ archived_at: new Date() }, { transaction });
    return { id: customer.id, archived: true };
  });
};

const listCategories = async (merchantId) => {
  const rows = await ProductCategory.findAll({
    where: { merchant_id: merchantId },
    order: [['sort_order', 'ASC'], ['id', 'DESC']]
  });
  // 带上在售商品数，前端可直接说明分类为什么不能删。
  const counts = await Product.findAll({
    where: { merchant_id: merchantId, archived_at: null, category_id: { [Op.ne]: null } },
    attributes: ['category_id', [sequelize.fn('COUNT', sequelize.col('id')), 'product_count']],
    group: ['category_id'],
    raw: true
  });
  const countMap = {};
  counts.forEach((row) => {
    countMap[String(row.category_id)] = parseInt(row.product_count, 10) || 0;
  });
  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    sort_order: item.sort_order,
    product_count: countMap[String(item.id)] || 0
  }));
};

const createCategory = async (merchantId, data) => {
  const name = String(data.name || '').trim();
  if (!name) throw serviceError('分类名称不能为空', 400, { feature: '新增商品分类', merchantId });
  const category = await ProductCategory.create({
    merchant_id: merchantId,
    name,
    sort_order: Number(data.sort_order) || 0
  });
  return { id: category.id, name: category.name, sort_order: category.sort_order };
};

const removeCategory = async (merchantId, categoryId) => {
  const category = await ProductCategory.findOne({ where: { id: categoryId, merchant_id: merchantId } });
  if (!category) return null;
  const productCount = await Product.count({ where: { merchant_id: merchantId, category_id: categoryId, archived_at: null } });
  if (productCount > 0) {
    throw serviceError('该分类下还有 ' + productCount + ' 个商品，请先删除商品', 400, {
      feature: '删除商品分类', merchantId, categoryId, productCount
    });
  }
  await sequelize.transaction(async (transaction) => {
    // 已归档商品的行仍引用该分类，外键会挡住删除，先解除关联；
    // 商品名、单位、单价在账单明细里已有快照，不影响历史账目。
    await Product.update({ category_id: null }, {
      where: { merchant_id: merchantId, category_id: categoryId },
      transaction
    });
    await category.destroy({ transaction });
  });
  return { id: categoryId };
};

const validateCategory = async (merchantId, categoryId, transaction) => {
  if (!categoryId) return null;
  const category = await ProductCategory.findOne({
    where: { id: categoryId, merchant_id: merchantId }, transaction
  });
  if (!category) {
    throw serviceError('商品分类不存在或不属于当前店铺', 400, {
      feature: '商品分类校验', merchantId, categoryId
    });
  }
  return category;
};

const listProducts = async (merchantId, { keyword, category_id, page = 1, pageSize = 50 }) => {
  const where = { merchant_id: merchantId, archived_at: null };
  if (keyword) where.name = { [Op.like]: `%${keyword}%` };
  if (category_id) where.category_id = category_id;
  const offset = (page - 1) * pageSize;
  const { count, rows } = await Product.findAndCountAll({
    where,
    include: [{ model: ProductCategory, as: 'category', attributes: ['id', 'name'] }],
    limit: pageSize,
    offset,
    order: [['id', 'DESC']]
  });
  return { list: rows.map(serializeProduct), total: count };
};

const createProduct = async (merchantId, data) => {
  const name = String(data.name || '').trim();
  if (!name) throw serviceError('商品名称不能为空', 400, { feature: '新增商品', merchantId });
  const price = data.default_unit_price === '' || data.default_unit_price === undefined ? null : toNumber(data.default_unit_price);
  if (price !== null && price < 0) {
    throw serviceError('默认单价不能小于0', 400, { feature: '新增商品', merchantId });
  }
  const category = await validateCategory(merchantId, data.category_id);
  const product = await Product.create({
    merchant_id: merchantId,
    category_id: category ? category.id : null,
    name,
    unit: String(data.unit || '件').trim() || '件',
    default_unit_price: price,
    remark: String(data.remark || '').trim() || null
  });
  product.category = category;
  return serializeProduct(product);
};

const updateProduct = async (merchantId, productId, data) => {
  const product = await Product.findOne({ where: { id: productId, merchant_id: merchantId } });
  if (!product) return null;
  const updateFields = {};
  ['name', 'unit', 'remark'].forEach((field) => {
    if (data[field] !== undefined) updateFields[field] = data[field];
  });
  if (data.category_id !== undefined) {
    const category = await validateCategory(merchantId, data.category_id);
    updateFields.category_id = category ? category.id : null;
  }
  if (data.default_unit_price !== undefined) {
    updateFields.default_unit_price = data.default_unit_price === '' ? null : toNumber(data.default_unit_price);
    if (updateFields.default_unit_price !== null && updateFields.default_unit_price < 0) {
      throw serviceError('默认单价不能小于0', 400, { feature: '修改商品', merchantId, productId });
    }
  }
  if (updateFields.name !== undefined) {
    updateFields.name = String(updateFields.name || '').trim();
    if (!updateFields.name) throw serviceError('商品名称不能为空', 400, { feature: '修改商品', merchantId, productId });
  }
  if (updateFields.unit !== undefined) updateFields.unit = String(updateFields.unit || '').trim() || '件';
  await product.update(updateFields);
  product.category = await ProductCategory.findByPk(product.category_id);
  return serializeProduct(product);
};

const archiveProduct = async (merchantId, productId) => {
  const product = await Product.findOne({ where: { id: productId, merchant_id: merchantId } });
  if (!product) return null;
  await product.update({ archived_at: new Date() });
  return { id: product.id, archived: true };
};

const normalizeItems = async (merchantId, items, transaction, feature = '创建多商品账单') => {
  if (!Array.isArray(items) || items.length === 0) {
    throw serviceError('账单至少需要一条商品明细', 400, { feature, merchantId });
  }
  assertArrayLength(items, 200, '账单明细');
  const productIds = items.map((item) => {
    const value = item.product_id === undefined ? item.productId : item.product_id;
    return Number(value);
  }).filter((productId) => Number.isInteger(productId) && productId > 0);
  const products = productIds.length ? await Product.findAll({
    where: { id: { [Op.in]: productIds }, merchant_id: merchantId, archived_at: null },
    transaction
  }) : [];
  const productMap = new Map(products.map((product) => [String(product.id), product]));
  const normalized = items.map((item, index) => {
    const rawProductId = item.product_id === undefined ? item.productId : item.product_id;
    const hasProductId = rawProductId !== undefined && rawProductId !== null && String(rawProductId).trim() !== '';
    const product = hasProductId ? productMap.get(String(rawProductId)) : null;
    const productName = String(item.product_name === undefined ? (item.productName || '') : (item.product_name || '')).trim();
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price === undefined ? item.unitPrice : item.unit_price);
    if (hasProductId && !product) {
      throw serviceError('商品不存在或不属于当前店铺', 400, {
        feature, merchantId, itemIndex: index,
        productId: rawProductId, quantity, unitPrice
      });
    }
    if (!product && !productName) {
      throw serviceError('商品名称不能为空', 400, {
        feature, merchantId, itemIndex: index,
        productId: rawProductId || null, quantity, unitPrice
      });
    }
    if (quantity <= 0 || unitPrice < 0) {
      throw serviceError('商品数量或单价无效', 400, {
        feature, merchantId, itemIndex: index,
        productId: rawProductId || null, productName: product ? product.name : productName, quantity, unitPrice
      });
    }
    assertAmount(quantity, '商品数量');
    assertAmount(unitPrice, '商品单价');
    assertStringLength(product ? product.name : productName, 80, '商品名称');
    assertStringLength(product ? product.unit : (String(item.unit || '斤').trim() || '斤'), 20, '商品单位');
    return {
      product_id: product ? product.id : null,
      product_name: product ? product.name : productName,
      unit: product ? product.unit : (String(item.unit || '斤').trim() || '斤'),
      quantity,
      unit_price: unitPrice,
      subtotal: roundMoney(quantity * unitPrice)
    };
  });
  return normalized;
};

const normalizeBillHeader = (merchantId, data, feature) => {
  const direction = data.direction;
  if (direction !== 'sale' && direction !== 'purchase') {
    throw serviceError('账单方向必须是出货或进货', 400, { feature, merchantId, direction });
  }
  const billDate = data.bill_date || data.billDate;
  if (!isValidDate(billDate)) {
    throw serviceError('账单日期格式无效', 400, { feature, merchantId, billDate });
  }
  const customerId = data.customer_id || data.customerId;
  if (!customerId) throw serviceError('请选择客户', 400, { feature, merchantId });
  assertStringLength(data.remark, 500, '账单备注');
  return { direction, billDate, customerId };
};

const createBill = async (merchantId, data) => {
  const feature = '创建多商品账单';
  const { direction, billDate, customerId } = normalizeBillHeader(merchantId, data, feature);

  let bill;
  await sequelize.transaction(async (transaction) => {
    await findCustomer(merchantId, customerId, transaction, true);
    const items = await normalizeItems(merchantId, data.items, transaction, feature);
    const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
    bill = await LedgerBill.create({
      merchant_id: merchantId,
      customer_id: customerId,
      direction,
      bill_date: billDate,
      total_amount: totalAmount,
      remark: String(data.remark || '').trim() || null
    }, { transaction });
    await LedgerBillItem.bulkCreate(items.map((item) => ({ ...item, ledger_bill_id: bill.id })), { transaction });
  });
  return getBill(merchantId, bill.id);
};

const updateBill = async (merchantId, billId, data) => {
  const feature = '修改多商品账单';
  const { direction, billDate, customerId } = normalizeBillHeader(merchantId, data, feature);

  await sequelize.transaction(async (transaction) => {
    const bill = await LedgerBill.findOne({
      where: { id: billId, merchant_id: merchantId, deleted_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!bill) {
      throw serviceError('账单不存在或已删除', 404, { feature, merchantId, billId });
    }

    await findCustomer(merchantId, customerId, transaction, true);
    const items = await normalizeItems(merchantId, data.items, transaction, feature);
    const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));

    const previousAmount = roundMoney(toNumber(bill.total_amount));
    const customerChanged = String(bill.customer_id) !== String(customerId);
    const directionChanged = bill.direction !== direction;
    const paymentTotals = await getCustomerPaymentTotals(merchantId, bill.customer_id, transaction);
    const hasPayments = paymentTotals.receivedAmount > 0 || paymentTotals.paidAmount > 0;

    if (hasPayments && (customerChanged || directionChanged)) {
      throw serviceError('该往来对象已有收付款记录，不能修改账单的客户或出入方向', 409, {
        feature, reason: '已有收付款记录', merchantId, billId,
        customerChanged, directionChanged
      });
    }
    if (hasPayments && !customerChanged && !directionChanged && previousAmount !== totalAmount) {
      const otherBillTotal = await getCustomerBillTotal(merchantId, customerId, direction, bill.id, transaction);
      const paidTotal = direction === 'purchase' ? paymentTotals.paidAmount : paymentTotals.receivedAmount;
      assertFundsConsistent(direction, roundMoney(otherBillTotal + totalAmount), paidTotal, feature, {
        merchantId, billId, previousAmount, nextAmount: totalAmount, paidTotal
      });
    }

    await bill.update({
      customer_id: customerId,
      direction,
      bill_date: billDate,
      total_amount: totalAmount,
      remark: String(data.remark || '').trim() || null
    }, { transaction });
    await LedgerBillItem.destroy({ where: { ledger_bill_id: bill.id }, transaction });
    await LedgerBillItem.bulkCreate(items.map((item) => ({ ...item, ledger_bill_id: bill.id })), { transaction });
  });

  return getBill(merchantId, billId);
};

const getBill = async (merchantId, billId) => {
  const bill = await LedgerBill.findOne({
    where: { id: billId, merchant_id: merchantId, deleted_at: null },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: LedgerBillItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] }
    ],
    order: [[{ model: LedgerBillItem, as: 'items' }, 'id', 'ASC']]
  });
  return bill ? serializeBill(bill) : null;
};

const listBills = async (merchantId, { direction, customer_id, product_id, start_date, end_date, page = 1, pageSize = 20 }) => {
  const where = { merchant_id: merchantId, deleted_at: null };
  if (direction === 'sale' || direction === 'purchase') where.direction = direction;
  if (customer_id) where.customer_id = customer_id;
  if (start_date || end_date) where.bill_date = buildDateRange(start_date, end_date);
  const productId = product_id ? parseInt(product_id, 10) : NaN;
  const include = [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }];
  if (Number.isFinite(productId)) {
    include.push({
      model: LedgerBillItem,
      as: 'items',
      attributes: [],
      where: { product_id: productId },
      required: true
    });
  }
  const totalsWhere = { ...where };
  if (Number.isFinite(productId)) {
    totalsWhere.id = {
      [Op.in]: sequelize.literal(
        `(SELECT DISTINCT ledger_bill_id FROM ledger_bill_items WHERE product_id = ${productId})`
      )
    };
  }
  const offset = (page - 1) * pageSize;
  const [billsResult, totalsRows] = await Promise.all([
    LedgerBill.findAndCountAll({
      where,
      include,
      limit: pageSize,
      offset,
      distinct: true,
      order: [['bill_date', 'DESC'], ['id', 'DESC']]
    }),
    LedgerBill.findAll({
      where: totalsWhere,
      attributes: ['direction', [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']],
      group: ['direction'],
      raw: true
    })
  ]);

  let itemCountMap = {};
  const billIds = billsResult.rows.map((bill) => bill.id);
  if (billIds.length) {
    const countRows = await LedgerBillItem.findAll({
      where: { ledger_bill_id: { [Op.in]: billIds } },
      attributes: ['ledger_bill_id', [sequelize.fn('COUNT', sequelize.col('id')), 'item_count']],
      group: ['ledger_bill_id'],
      raw: true
    });
    itemCountMap = countRows.reduce((map, row) => {
      map[String(row.ledger_bill_id)] = parseInt(row.item_count, 10) || 0;
      return map;
    }, {});
  }

  const list = billsResult.rows.map((bill) => {
    const plain = typeof bill.get === 'function' ? bill.get({ plain: true }) : bill;
    return serializeBill({ ...plain, item_count: itemCountMap[String(plain.id)] || 0 }, { withItems: false });
  });
  const totals = { sale_amount: 0, purchase_amount: 0 };
  totalsRows.forEach((row) => {
    if (row.direction === 'sale') totals.sale_amount = roundMoney(toNumber(row.amount));
    if (row.direction === 'purchase') totals.purchase_amount = roundMoney(toNumber(row.amount));
  });
  return { list, total: billsResult.count, totals };
};

const removeBill = async (merchantId, billId) => {
  return sequelize.transaction(async (transaction) => {
    const bill = await LedgerBill.findOne({
      where: { id: billId, merchant_id: merchantId, deleted_at: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!bill) return null;

    const now = new Date();
    const activeStatement = await CustomerStatement.findOne({
      where: {
        merchant_id: merchantId,
        customer_id: bill.customer_id,
        start_date: { [Op.lte]: bill.bill_date },
        end_date: { [Op.gte]: bill.bill_date },
        revoked_at: null,
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: now } }
        ]
      },
      transaction
    });
    if (activeStatement) {
      throw serviceError('该账单所在区间已生成结账分享，请先作废分享链接', 409, {
        feature: '删除账单', reason: '账单所在区间已生成结账分享',
        merchantId, billId, statementId: activeStatement.id
      });
    }

    const paymentTotals = await getCustomerPaymentTotals(merchantId, bill.customer_id, transaction);
    const direction = bill.direction;
    if (direction === 'sale' || direction === 'purchase') {
      const paidTotal = direction === 'purchase' ? paymentTotals.paidAmount : paymentTotals.receivedAmount;
      const otherBillTotal = await getCustomerBillTotal(merchantId, bill.customer_id, direction, bill.id, transaction);
      assertFundsConsistent(direction, otherBillTotal, paidTotal, '删除账单', {
        merchantId, billId, paidTotal
      });
    }

    await bill.update({ deleted_at: now }, { transaction });
    return { id: bill.id, deleted: true };
  });
};

const getCustomerLedger = async (merchantId, customerId, { start_date, end_date }) => {
  const customer = await findCustomer(merchantId, customerId, undefined, false, true);
  const billWhere = { merchant_id: merchantId, customer_id: customerId, deleted_at: null };
  const paymentWhere = { merchant_id: merchantId, customer_id: customerId };
  if (start_date || end_date) {
    const range = buildDateRange(start_date, end_date);
    billWhere.bill_date = range;
    paymentWhere.payment_date = range;
  }
  const [bills, payments, summaries] = await Promise.all([
    LedgerBill.findAll({
      where: billWhere,
      include: [{ model: LedgerBillItem, as: 'items' }],
      order: [['bill_date', 'DESC'], ['id', 'DESC']]
    }),
    CustomerPayment.findAll({ where: paymentWhere, order: [['payment_date', 'DESC'], ['id', 'DESC']] }),
    getCustomerSummaries(merchantId, [customerId])
  ]);
  const summary = summaries.get(String(customerId)) || {
    salesAmount: 0,
    purchaseAmount: 0,
    receivedAmount: 0,
    paidAmount: 0,
    receivableBalance: 0,
    payableBalance: 0,
    balance: 0
  };
  return {
    customer: serializeCustomer(customer, summary),
    period: { start_date: start_date || '', end_date: end_date || '' },
    bills: bills.map(serializeBill),
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: roundMoney(toNumber(payment.amount)),
      flow_type: payment.flow_type || 'received',
      payment_date: payment.payment_date,
      payment_method: payment.payment_method || '',
      remark: payment.remark || ''
    }))
  };
};

const createCustomerPayment = async (merchantId, data) => {
  const customerId = data.customer_id || data.customerId;
  const amount = roundMoney(toNumber(data.amount));
  const paymentDate = data.payment_date || data.paymentDate;
  const flowType = data.flow_type || data.flowType || 'received';
  const feature = flowType === 'paid' ? '供应商付款' : '客户回款';
  if (flowType !== 'received' && flowType !== 'paid') {
    throw serviceError('收付款类型不正确', 400, {
      feature: '往来收付款', merchantId, customerId, flowType
    });
  }
  if (!customerId || amount <= 0 || !isValidDate(paymentDate)) {
    throw serviceError('往来对象、金额和日期必须正确填写', 400, {
      feature, merchantId, customerId, amount, paymentDate, flowType
    });
  }
  assertAmount(amount, '收付款金额', { allowZero: false });
  assertStringLength(data.payment_method || data.paymentMethod, 20, '收付款方式');
  assertStringLength(data.remark, 500, '收付款备注');
  let payment;
  let balanceBefore;
  await sequelize.transaction(async (transaction) => {
    await findCustomer(merchantId, customerId, transaction, true);
    const summaries = await getCustomerSummaries(merchantId, [customerId], transaction);
    const summary = summaries.get(String(customerId)) || { receivableBalance: 0, payableBalance: 0 };
    balanceBefore = flowType === 'paid' ? summary.payableBalance : summary.receivableBalance;
    if (balanceBefore <= 0) {
      const message = flowType === 'paid'
        ? '当前没有待付余额，不能记录供应商付款'
        : '当前没有待收余额，不能记录客户回款';
      throw serviceError(message, 400, {
        feature, merchantId, customerId, balanceBefore, flowType
      });
    }
    if (amount > balanceBefore) {
      const message = flowType === 'paid'
        ? '供应商付款不能超过当前待付余额'
        : '客户回款不能超过当前待收余额';
      throw serviceError(message, 400, {
        feature, merchantId, customerId, amount, balanceBefore, flowType
      });
    }
    payment = await CustomerPayment.create({
      merchant_id: merchantId,
      customer_id: customerId,
      amount,
      flow_type: flowType,
      payment_date: paymentDate,
      payment_method: String(data.payment_method || data.paymentMethod || '').trim() || null,
      remark: String(data.remark || '').trim() || null
    }, { transaction });
  });
  return {
    id: payment.id,
    customer_id: customerId,
    amount,
    flow_type: flowType,
    payment_date: payment.payment_date,
    balance_before: balanceBefore,
    balance_after: roundMoney(balanceBefore - amount)
  };
};

const createCustomerStatement = async (merchantId, data) => {
  const customerId = data.customer_id || data.customerId;
  const startDate = data.start_date || data.startDate;
  const endDate = data.end_date || data.endDate;
  if (!customerId || !isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
    throw serviceError('客户和结账日期范围必须正确填写', 400, {
      feature: '生成客户结账信息', merchantId, customerId, startDate, endDate
    });
  }
  await findCustomer(merchantId, customerId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const statement = await CustomerStatement.create({
    merchant_id: merchantId,
    customer_id: customerId,
    start_date: startDate,
    end_date: endDate,
    share_token: randomUUID(),
    expires_at: expiresAt
  });
  return {
    id: statement.id,
    share_token: statement.share_token,
    start_date: statement.start_date,
    end_date: statement.end_date,
    expires_at: statement.expires_at || expiresAt
  };
};

const revokeCustomerStatement = async (merchantId, statementId) => {
  const statement = await CustomerStatement.findOne({
    where: { id: statementId, merchant_id: merchantId }
  });
  if (!statement) {
    throw serviceError('结账分享不存在', 404, {
      feature: '作废结账分享', merchantId, statementId
    });
  }
  if (!statement.revoked_at) {
    await statement.update({ revoked_at: new Date() });
  }
  return { id: statement.id, revoked: true };
};

const getPublicCustomerStatement = async (shareToken) => {
  const statement = await CustomerStatement.findOne({ where: { share_token: shareToken } });
  if (!statement) {
    throw serviceError('结账信息不存在或已失效', 404, {
      feature: '查看客户结账信息', shareTokenPrefix: String(shareToken || '').slice(0, 8)
    });
  }
  // 旧数据 expires_at 为空表示长期有效，保持兼容。
  const expired = statement.expires_at && new Date(statement.expires_at).getTime() <= Date.now();
  if (statement.revoked_at || expired) {
    throw serviceError('分享链接已失效', 410, {
      feature: '查看客户结账信息',
      reason: statement.revoked_at ? '分享链接已作废' : '分享链接已过期',
      shareTokenPrefix: String(shareToken || '').slice(0, 8)
    });
  }
  const ledger = await getCustomerLedger(statement.merchant_id, statement.customer_id, {
    start_date: statement.start_date,
    end_date: statement.end_date
  });
  const salesAmount = ledger.bills.filter((bill) => bill.direction === 'sale').reduce((sum, bill) => sum + toNumber(bill.total_amount), 0);
  const purchaseAmount = ledger.bills.filter((bill) => bill.direction === 'purchase').reduce((sum, bill) => sum + toNumber(bill.total_amount), 0);
  const receivedAmount = ledger.payments.filter((payment) => payment.flow_type !== 'paid').reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const paidAmount = ledger.payments.filter((payment) => payment.flow_type === 'paid').reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const receivableAmount = roundMoney(Math.max(salesAmount - receivedAmount, 0));
  const payableAmount = roundMoney(Math.max(purchaseAmount - paidAmount, 0));
  return {
    customer: { name: ledger.customer.name },
    start_date: statement.start_date,
    end_date: statement.end_date,
    generated_at: statement.createdAt || statement.created_at,
    bill_count: ledger.bills.length,
    sales_amount: roundMoney(salesAmount),
    purchase_amount: roundMoney(purchaseAmount),
    received_amount: roundMoney(receivedAmount),
    paid_amount: roundMoney(paidAmount),
    receivable_amount: receivableAmount,
    payable_amount: payableAmount,
    period_balance: roundMoney(receivableAmount - payableAmount),
    bills: ledger.bills,
    payments: ledger.payments
  };
};

module.exports = {
  getTradeStats,
  listCustomers,
  createCustomer,
  updateCustomer,
  archiveCustomer,
  listCategories,
  createCategory,
  removeCategory,
  listProducts,
  createProduct,
  updateProduct,
  archiveProduct,
  createBill,
  updateBill,
  getBill,
  listBills,
  removeBill,
  getCustomerLedger,
  createCustomerPayment,
  createCustomerStatement,
  revokeCustomerStatement,
  getPublicCustomerStatement
};
