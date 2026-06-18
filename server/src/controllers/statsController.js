const statsService = require('../services/statsService');
const { success } = require('../utils/response');

const overview = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { start_date, end_date } = ctx.query;

  const data = await statsService.getOverview(merchantId, { start_date, end_date });
  ctx.body = success(data);
};

const trend = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { dimension, start_date, end_date } = ctx.query;

  const data = await statsService.getTrend(merchantId, { dimension, start_date, end_date });
  ctx.body = success(data);
};

const debtRanking = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { limit } = ctx.query;

  const data = await statsService.getDebtRanking(merchantId, { limit });
  ctx.body = success(data);
};

const productAnalysis = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { start_date, end_date } = ctx.query;

  const data = await statsService.getProductAnalysis(merchantId, { start_date, end_date });
  ctx.body = success(data);
};

module.exports = {
  overview,
  trend,
  debtRanking,
  productAnalysis
};
