const ledgerService = require('../services/ledgerService');
const { success, error, paginate } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');

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
  ctx.body = paginate(result.list, result.total, page, pageSize);
};

const createBill = async (ctx) => {
  ctx.body = success(await ledgerService.createBill(ctx.state.merchant.id, ctx.request.body));
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
  ctx.body = success(await ledgerService.createCustomerPayment(ctx.state.merchant.id, ctx.request.body));
};

const createStatement = async (ctx) => {
  ctx.body = success(await ledgerService.createCustomerStatement(ctx.state.merchant.id, ctx.request.body));
};

const publicStatement = async (ctx) => {
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
  createBill,
  updateBill,
  billDetail,
  removeBill,
  customerLedger,
  createPayment,
  createStatement,
  publicStatement
};
