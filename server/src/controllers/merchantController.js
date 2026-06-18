const merchantService = require('../services/merchantService');
const { success, error } = require('../utils/response');

const getProfile = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const profile = await merchantService.getProfile(merchantId);

  if (!profile) {
    ctx.status = 404;
    ctx.body = error('商户不存在', 404);
    return;
  }

  ctx.body = success(profile);
};

const updateProfile = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { shop_name, phone } = ctx.request.body;

  if (shop_name === undefined && phone === undefined) {
    ctx.status = 400;
    ctx.body = error('至少需要提供shop_name或phone', 400);
    return;
  }

  const profile = await merchantService.updateProfile(merchantId, { shop_name, phone });

  if (!profile) {
    ctx.status = 404;
    ctx.body = error('商户不存在', 404);
    return;
  }

  ctx.body = success(profile);
};

module.exports = { getProfile, updateProfile };
