const purchaseService = require('../services/purchaseService');
const { success, error, paginate } = require('../utils/response');

const list = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { supplier_id, settlement_status, start_date, end_date, page = 1, pageSize, page_size } = ctx.query;
  const size = Number(pageSize || page_size || 10);

  const result = await purchaseService.listPurchases(merchantId, {
    supplier_id,
    settlement_status,
    start_date,
    end_date,
    page: Number(page),
    pageSize: size
  });

  ctx.body = paginate(result.list, result.total, page, size);
};

const available = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { lobster_size, page = 1, pageSize, page_size } = ctx.query;
  const size = Number(pageSize || page_size || 20);

  const result = await purchaseService.listAvailablePurchases(merchantId, {
    lobster_size,
    page: Number(page),
    pageSize: size
  });

  ctx.body = paginate(result.list, result.total, page, size);
};

const create = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const data = ctx.request.body;

  if (!data.supplier_id) {
    ctx.status = 400;
    ctx.body = error('供应商ID不能为空', 400);
    return;
  }
  if (!data.lobster_size) {
    ctx.status = 400;
    ctx.body = error('龙虾规格不能为空', 400);
    return;
  }
  if (!data.total_cost && !data.unit_cost) {
    ctx.status = 400;
    ctx.body = error('总成本或单价必须提供', 400);
    return;
  }
  if (!data.net_weight && data.total_cost === undefined && (!data.gross_weight && !data.unit_cost)) {
    ctx.status = 400;
    ctx.body = error('净重或毛重和单价必须提供', 400);
    return;
  }
  if (!data.received_at) {
    ctx.status = 400;
    ctx.body = error('收货时间不能为空', 400);
    return;
  }

  const purchase = await purchaseService.createPurchase(merchantId, data);

  ctx.body = success(purchase);
};

const detail = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const purchaseId = ctx.params.id;

  const purchase = await purchaseService.getPurchase(merchantId, purchaseId);

  if (!purchase) {
    ctx.status = 404;
    ctx.body = error('采购记录不存在', 404);
    return;
  }

  ctx.body = success(purchase);
};

const update = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const purchaseId = ctx.params.id;
  const data = ctx.request.body;

  const purchase = await purchaseService.updatePurchase(merchantId, purchaseId, data);

  if (!purchase) {
    ctx.status = 404;
    ctx.body = error('采购记录不存在', 404);
    return;
  }

  ctx.body = success(purchase);
};

const addPayment = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const purchaseId = ctx.params.id;
  const data = ctx.request.body;

  if (!data.amount) {
    ctx.status = 400;
    ctx.body = error('付款金额不能为空', 400);
    return;
  }
  if (!data.paid_at) {
    ctx.status = 400;
    ctx.body = error('付款时间不能为空', 400);
    return;
  }

  const result = await purchaseService.addSupplierPaymentRecord(merchantId, purchaseId, data);

  if (!result) {
    ctx.status = 404;
    ctx.body = error('采购记录不存在', 404);
    return;
  }

  ctx.body = success(result);
};

module.exports = { list, available, create, detail, update, addPayment };
