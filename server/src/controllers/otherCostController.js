const otherCostService = require('../services/otherCostService');
const { success } = require('../utils/response');

const create = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const data = await otherCostService.createOtherCost(merchantId, ctx.request.body || {});
  ctx.body = success(data);
};

module.exports = {
  create
};
