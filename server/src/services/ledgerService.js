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

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

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
  sales_amount: roundMoney(toNumber(summary.salesAmount)),
  purchase_amount: roundMoney(toNumber(summary.purchaseAmount)),
  received_amount: roundMoney(toNumber(summary.receivedAmount)),
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

const serializeBill = (bill) => ({
  id: bill.id,
  customer_id: bill.customer_id,
  customer_name: bill.customer ? bill.customer.name : '',
  direction: bill.direction,
  bill_date: bill.bill_date,
  total_amount: roundMoney(toNumber(bill.total_amount)),
  remark: bill.remark || '',
  item_count: bill.items ? bill.items.length : 0,
  items: (bill.items || []).map((item) => ({
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name,
    unit: item.unit,
    quantity: roundMoney(toNumber(item.quantity)),
    unit_price: roundMoney(toNumber(item.unit_price)),
    subtotal: roundMoney(toNumber(item.subtotal))
  }))
});

const findCustomer = async (merchantId, customerId, transaction) => {
  const customer = await Customer.findOne({
    where: { id: customerId, merchant_id: merchantId },
    transaction
  });
  if (!customer) {
    throw serviceError('客户不存在或不属于当前店铺', 404, {
      feature: '通用账本客户校验', merchantId, customerId
    });
  }
  return customer;
};

const getCustomerSummaries = async (merchantId, customerIds) => {
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
    raw: true
  });

  const paymentRows = await CustomerPayment.findAll({
    where: { merchant_id: merchantId, customer_id: { [Op.in]: customerIds } },
    attributes: [
      'customer_id',
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'received_amount']
    ],
    group: ['customer_id'],
    raw: true
  });

  billRows.forEach((row) => {
    summaries.set(String(row.customer_id), {
      salesAmount: toNumber(row.sales_amount),
      purchaseAmount: toNumber(row.purchase_amount),
      receivedAmount: 0
    });
  });
  paymentRows.forEach((row) => {
    const summary = summaries.get(String(row.customer_id)) || {
      salesAmount: 0,
      purchaseAmount: 0,
      receivedAmount: 0
    };
    summary.receivedAmount = toNumber(row.received_amount);
    summaries.set(String(row.customer_id), summary);
  });
  summaries.forEach((summary) => {
    summary.balance = roundMoney(summary.salesAmount - summary.purchaseAmount - summary.receivedAmount);
  });
  return summaries;
};

const listCustomers = async (merchantId, { keyword, page = 1, pageSize = 20 }) => {
  const where = { merchant_id: merchantId, archived_at: null };
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
  const customer = await findCustomer(merchantId, customerId);
  await customer.update({ archived_at: new Date() });
  return { id: customer.id, archived: true };
};

const listCategories = async (merchantId) => {
  const rows = await ProductCategory.findAll({
    where: { merchant_id: merchantId },
    order: [['sort_order', 'ASC'], ['id', 'DESC']]
  });
  return rows.map((item) => ({ id: item.id, name: item.name, sort_order: item.sort_order }));
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
    throw serviceError('该分类仍有关联商品，不能删除', 400, {
      feature: '删除商品分类', merchantId, categoryId, productCount
    });
  }
  await category.destroy();
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

const normalizeItems = async (merchantId, items, transaction) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw serviceError('账单至少需要一条商品明细', 400, { feature: '创建多商品账单', merchantId });
  }
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
        feature: '创建多商品账单', merchantId, itemIndex: index,
        productId: rawProductId, quantity, unitPrice
      });
    }
    if (!product && !productName) {
      throw serviceError('商品名称不能为空', 400, {
        feature: '创建多商品账单', merchantId, itemIndex: index,
        productId: rawProductId || null, quantity, unitPrice
      });
    }
    if (quantity <= 0 || unitPrice < 0) {
      throw serviceError('商品数量或单价无效', 400, {
        feature: '创建多商品账单', merchantId, itemIndex: index,
        productId: rawProductId || null, productName: product ? product.name : productName, quantity, unitPrice
      });
    }
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

const createBill = async (merchantId, data) => {
  const direction = data.direction;
  if (direction !== 'sale' && direction !== 'purchase') {
    throw serviceError('账单方向必须是出货或进货', 400, { feature: '创建多商品账单', merchantId, direction });
  }
  if (!isValidDate(data.bill_date || data.billDate)) {
    throw serviceError('账单日期格式无效', 400, { feature: '创建多商品账单', merchantId });
  }
  const customerId = data.customer_id || data.customerId;
  if (!customerId) throw serviceError('请选择客户', 400, { feature: '创建多商品账单', merchantId });

  let bill;
  await sequelize.transaction(async (transaction) => {
    await findCustomer(merchantId, customerId, transaction);
    const items = await normalizeItems(merchantId, data.items, transaction);
    const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
    bill = await LedgerBill.create({
      merchant_id: merchantId,
      customer_id: customerId,
      direction,
      bill_date: data.bill_date || data.billDate,
      total_amount: totalAmount,
      remark: String(data.remark || '').trim() || null
    }, { transaction });
    await LedgerBillItem.bulkCreate(items.map((item) => ({ ...item, ledger_bill_id: bill.id })), { transaction });
  });
  return getBill(merchantId, bill.id);
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
  const itemInclude = { model: LedgerBillItem, as: 'items' };
  if (product_id) {
    itemInclude.where = { product_id };
    itemInclude.required = true;
  }
  const offset = (page - 1) * pageSize;
  const { count, rows } = await LedgerBill.findAndCountAll({
    where,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      itemInclude
    ],
    limit: pageSize,
    offset,
    distinct: true,
    order: [['bill_date', 'DESC'], ['id', 'DESC']]
  });
  return { list: rows.map(serializeBill), total: count };
};

const removeBill = async (merchantId, billId) => {
  const bill = await LedgerBill.findOne({ where: { id: billId, merchant_id: merchantId, deleted_at: null } });
  if (!bill) return null;
  await bill.update({ deleted_at: new Date() });
  return { id: bill.id, deleted: true };
};

const getCustomerLedger = async (merchantId, customerId, { start_date, end_date }) => {
  const customer = await findCustomer(merchantId, customerId);
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
  const summary = summaries.get(String(customerId)) || { salesAmount: 0, purchaseAmount: 0, receivedAmount: 0, balance: 0 };
  return {
    customer: serializeCustomer(customer, summary),
    period: { start_date: start_date || '', end_date: end_date || '' },
    bills: bills.map(serializeBill),
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: roundMoney(toNumber(payment.amount)),
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
  if (!customerId || amount <= 0 || !isValidDate(paymentDate)) {
    throw serviceError('客户、回款金额和日期必须正确填写', 400, {
      feature: '客户回款', merchantId, customerId, amount, paymentDate
    });
  }
  let payment;
  let balanceBefore;
  await sequelize.transaction(async (transaction) => {
    await findCustomer(merchantId, customerId, transaction);
    const summaries = await getCustomerSummaries(merchantId, [customerId]);
    balanceBefore = (summaries.get(String(customerId)) || { balance: 0 }).balance;
    if (balanceBefore <= 0) {
      throw serviceError('该客户当前没有待收余额，不能记录回款', 400, {
        feature: '客户回款', merchantId, customerId, balanceBefore
      });
    }
    if (amount > balanceBefore) {
      throw serviceError('回款金额不能超过当前待收余额', 400, {
        feature: '客户回款', merchantId, customerId, amount, balanceBefore
      });
    }
    payment = await CustomerPayment.create({
      merchant_id: merchantId,
      customer_id: customerId,
      amount,
      payment_date: paymentDate,
      payment_method: String(data.payment_method || data.paymentMethod || '').trim() || null,
      remark: String(data.remark || '').trim() || null
    }, { transaction });
  });
  return {
    id: payment.id,
    customer_id: customerId,
    amount,
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
  const statement = await CustomerStatement.create({
    merchant_id: merchantId,
    customer_id: customerId,
    start_date: startDate,
    end_date: endDate,
    share_token: randomUUID()
  });
  return {
    id: statement.id,
    share_token: statement.share_token,
    start_date: statement.start_date,
    end_date: statement.end_date
  };
};

const getPublicCustomerStatement = async (shareToken) => {
  const statement = await CustomerStatement.findOne({ where: { share_token: shareToken } });
  if (!statement) {
    throw serviceError('结账信息不存在或已失效', 404, {
      feature: '查看客户结账信息', shareTokenPrefix: String(shareToken || '').slice(0, 8)
    });
  }
  const ledger = await getCustomerLedger(statement.merchant_id, statement.customer_id, {
    start_date: statement.start_date,
    end_date: statement.end_date
  });
  const salesAmount = ledger.bills.filter((bill) => bill.direction === 'sale').reduce((sum, bill) => sum + toNumber(bill.total_amount), 0);
  const purchaseAmount = ledger.bills.filter((bill) => bill.direction === 'purchase').reduce((sum, bill) => sum + toNumber(bill.total_amount), 0);
  const receivedAmount = ledger.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  return {
    customer: { name: ledger.customer.name },
    start_date: statement.start_date,
    end_date: statement.end_date,
    generated_at: statement.createdAt || statement.created_at,
    bill_count: ledger.bills.length,
    sales_amount: roundMoney(salesAmount),
    purchase_amount: roundMoney(purchaseAmount),
    received_amount: roundMoney(receivedAmount),
    period_balance: roundMoney(salesAmount - purchaseAmount - receivedAmount),
    bills: ledger.bills,
    payments: ledger.payments
  };
};

module.exports = {
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
  getBill,
  listBills,
  removeBill,
  getCustomerLedger,
  createCustomerPayment,
  createCustomerStatement,
  getPublicCustomerStatement
};
