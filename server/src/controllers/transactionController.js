const transactionService = require('../services/transactionService');
const { success, error, paginate } = require('../utils/response');

const list = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { buyer_id, payment_status, start_date, end_date, page = 1, pageSize, page_size } = ctx.query;
  const size = Number(pageSize || page_size || 10);

  const result = await transactionService.listTransactions(merchantId, {
    buyer_id,
    payment_status,
    start_date,
    end_date,
    page: Number(page),
    pageSize: size
  });

  ctx.body = paginate(result.list, result.total, page, size);
};

const create = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const data = ctx.request.body;

  if (!data.buyer_id) {
    ctx.status = 400;
    ctx.body = error('买家ID不能为空', 400);
    return;
  }
  if (!data.lobster_size) {
    ctx.status = 400;
    ctx.body = error('龙虾规格不能为空', 400);
    return;
  }
  if (!data.total_amount && (!data.weight || !data.unit_price)) {
    ctx.status = 400;
    ctx.body = error('总金额或重量和单价必须提供', 400);
    return;
  }
  if (!data.transaction_time) {
    ctx.status = 400;
    ctx.body = error('交易时间不能为空', 400);
    return;
  }

  const transaction = await transactionService.createTransaction(merchantId, data);

  ctx.body = success(transaction);
};

const detail = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const transactionId = ctx.params.id;

  const transaction = await transactionService.getTransaction(merchantId, transactionId);

  if (!transaction) {
    ctx.status = 404;
    ctx.body = error('交易记录不存在', 404);
    return;
  }

  ctx.body = success(transaction);
};

const update = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const transactionId = ctx.params.id;
  const data = ctx.request.body;

  const transaction = await transactionService.updateTransaction(merchantId, transactionId, data);

  if (!transaction) {
    ctx.status = 404;
    ctx.body = error('交易记录不存在', 404);
    return;
  }

  ctx.body = success(transaction);
};

const addPayment = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const transactionId = ctx.params.id;
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

  const result = await transactionService.addPaymentRecord(merchantId, transactionId, data);

  if (!result) {
    ctx.status = 404;
    ctx.body = error('交易记录不存在', 404);
    return;
  }

  ctx.body = success(result);
};

module.exports = { list, create, detail, update, addPayment };
