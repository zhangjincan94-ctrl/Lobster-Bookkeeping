const ledgerService = require('../services/ledgerService');
const exportService = require('../services/exportService');
const { RequestKey } = require('../models');
const { success, error, paginate } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const rateLimit = require('../utils/rateLimit');

const IDEMPOTENT_ROUTES = {
  'POST /api/ledger/bills': true,
  'POST /api/ledger/payments': true
};

const serviceFailure = (message, status) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const findRequestKey = (key, merchantId, route) => RequestKey.findOne({
  where: { key, merchant_id: merchantId, route }
});

const parseStoredResponse = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('[幂等响应解析失败]', {
      feature: '写接口幂等',
      reason: err.message
    });
    return null;
  }
};

// 命中历史 key 直接回放响应；并发唯一键冲突时回查已写入的记录。
const runIdempotent = async (ctx, route, handler) => {
  const key = IDEMPOTENT_ROUTES[route] ? String(ctx.get('x-idempotency-key') || '').trim() : '';
  if (!key) {
    ctx.body = success(await handler());
    return;
  }
  if (key.length > 128) {
    throw serviceFailure('幂等请求标识过长', 400);
  }

  const merchantId = ctx.state.merchant.id;
  const existing = await findRequestKey(key, merchantId, route);
  if (existing) {
    const stored = parseStoredResponse(existing.response_json);
    if (stored) {
      ctx.body = stored;
      return;
    }
  }

  const responseBody = success(await handler());
  try {
    await RequestKey.create({
      key,
      merchant_id: merchantId,
      route,
      response_json: JSON.stringify(responseBody)
    });
  } catch (err) {
    const duplicated = err && (err.name === 'SequelizeUniqueConstraintError' ||
      (err.parent && err.parent.code === 'ER_DUP_ENTRY'));
    if (!duplicated) throw err;
    const concurrent = await findRequestKey(key, merchantId, route);
    const stored = concurrent && parseStoredResponse(concurrent.response_json);
    if (stored) {
      ctx.body = stored;
      return;
    }
    throw err;
  }
  ctx.body = responseBody;
};

const listCustomers = async (ctx) => {
  const { page, pageSize } = normalizePagination(ctx.query, 20);
  const result = await ledgerService.listCustomers(ctx.state.merchant.id, {
    keyword: ctx.query.keyword,
    page,
    pageSize,
    archived: ctx.query.archived === '1'
  });
  ctx.body = paginate(result.list, result.total, page, pageSize);
};

const tradeStats = async (ctx) => {
  ctx.body = success(await ledgerService.getTradeStats(ctx.state.merchant.id, {
    days: ctx.query.days,
    endDate: ctx.query.end_date
  }));
};

const createCustomer = async (ctx) => {
  const customer = await ledgerService.createCustomer(ctx.state.merchant.id, ctx.request.body);
  ctx.body = success(customer);
};

const updateCustomer = async (ctx) => {
  const customer = await ledgerService.updateCustomer(ctx.state.merchant.id, ctx.params.id, ctx.request.body);
  if (!customer) {
    ctx.status = 404;
    ctx.body = error('客户不存在', 404);
    return;
  }
  ctx.body = success(customer);
};

const archiveCustomer = async (ctx) => {
  const result = await ledgerService.archiveCustomer(ctx.state.merchant.id, ctx.params.id);
  ctx.body = success(result);
};

const listCategories = async (ctx) => {
  ctx.body = success(await ledgerService.listCategories(ctx.state.merchant.id));
};

const createCategory = async (ctx) => {
  ctx.body = success(await ledgerService.createCategory(ctx.state.merchant.id, ctx.request.body));
};

const removeCategory = async (ctx) => {
  const result = await ledgerService.removeCategory(ctx.state.merchant.id, ctx.params.id);
  if (!result) {
    ctx.status = 404;
    ctx.body = error('商品分类不存在', 404);
    return;
  }
  ctx.body = success(result);
};

const listProducts = async (ctx) => {
  const { page, pageSize } = normalizePagination(ctx.query, 50);
  const result = await ledgerService.listProducts(ctx.state.merchant.id, {
    keyword: ctx.query.keyword,
    category_id: ctx.query.category_id,
    page,
    pageSize
  });
  ctx.body = paginate(result.list, result.total, page, pageSize);
};

const createProduct = async (ctx) => {
  ctx.body = success(await ledgerService.createProduct(ctx.state.merchant.id, ctx.request.body));
};

const updateProduct = async (ctx) => {
  const product = await ledgerService.updateProduct(ctx.state.merchant.id, ctx.params.id, ctx.request.body);
  if (!product) {
    ctx.status = 404;
    ctx.body = error('商品不存在', 404);
    return;
  }
  ctx.body = success(product);
};

const archiveProduct = async (ctx) => {
  const result = await ledgerService.archiveProduct(ctx.state.merchant.id, ctx.params.id);
  if (!result) {
    ctx.status = 404;
    ctx.body = error('商品不存在', 404);
    return;
  }
  ctx.body = success(result);
};

const listBills = async (ctx) => {
  const { page, pageSize } = normalizePagination(ctx.query, 20);
  const result = await ledgerService.listBills(ctx.state.merchant.id, {
    direction: ctx.query.direction,
    customer_id: ctx.query.customer_id,
    product_id: ctx.query.product_id,
    start_date: ctx.query.start_date,
    end_date: ctx.query.end_date,
    page,
    pageSize
  });
  const response = paginate(result.list, result.total, page, pageSize);
  response.data.totals = result.totals;
  ctx.body = response;
};

const exportBills = async (ctx) => {
  ctx.body = success(await exportService.exportBills(ctx.state.merchant.id, {
    start_date: ctx.query.start_date,
    end_date: ctx.query.end_date,
    direction: ctx.query.direction,
    customer_id: ctx.query.customer_id,
    include_items: ctx.query.include_items,
    max_bytes: ctx.query.max_bytes
  }));
};

const createBill = async (ctx) => {
  await runIdempotent(ctx, 'POST /api/ledger/bills', () =>
    ledgerService.createBill(ctx.state.merchant.id, ctx.request.body));
};

const updateBill = async (ctx) => {
  ctx.body = success(await ledgerService.updateBill(ctx.state.merchant.id, ctx.params.id, ctx.request.body));
};

const billDetail = async (ctx) => {
  const bill = await ledgerService.getBill(ctx.state.merchant.id, ctx.params.id);
  if (!bill) {
    ctx.status = 404;
    ctx.body = error('账单不存在', 404);
    return;
  }
  ctx.body = success(bill);
};

const removeBill = async (ctx) => {
  const result = await ledgerService.removeBill(ctx.state.merchant.id, ctx.params.id);
  if (!result) {
    ctx.status = 404;
    ctx.body = error('账单不存在', 404);
    return;
  }
  ctx.body = success(result);
};

const customerLedger = async (ctx) => {
  const data = await ledgerService.getCustomerLedger(ctx.state.merchant.id, ctx.params.id, {
    start_date: ctx.query.start_date,
    end_date: ctx.query.end_date
  });
  ctx.body = success(data);
};

const createPayment = async (ctx) => {
  await runIdempotent(ctx, 'POST /api/ledger/payments', () =>
    ledgerService.createCustomerPayment(ctx.state.merchant.id, ctx.request.body));
};

const createStatement = async (ctx) => {
  ctx.body = success(await ledgerService.createCustomerStatement(ctx.state.merchant.id, ctx.request.body));
};

const revokeStatement = async (ctx) => {
  ctx.body = success(await ledgerService.revokeCustomerStatement(ctx.state.merchant.id, ctx.params.id));
};

const publicStatement = async (ctx) => {
  const clientIp = String(ctx.header['x-forwarded-for'] || ctx.header['x-real-ip'] || '')
    .split(',')[0]
    .trim();
  const limitKey = `share:${ctx.params.token || clientIp || 'unknown'}`;
  if (!rateLimit.hit(limitKey).allowed) {
    ctx.status = 429;
    ctx.body = error('访问过于频繁，请稍后再试', 429);
    return;
  }
  ctx.body = success(await ledgerService.getPublicCustomerStatement(ctx.params.token));
};

module.exports = {
  listCustomers,
  tradeStats,
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
  listBills,
  exportBills,
  createBill,
  updateBill,
  billDetail,
  removeBill,
  customerLedger,
  createPayment,
  createStatement,
  revokeStatement,
  publicStatement
};
