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

const AVATAR_MAX_LENGTH = 300000;
const AVATAR_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const updateProfile = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { shop_name, phone, avatar } = ctx.request.body;

  if (shop_name === undefined && phone === undefined && avatar === undefined) {
    ctx.status = 400;
    ctx.body = error('至少需要提供shop_name、phone或avatar', 400);
    return;
  }

  if (avatar !== undefined && avatar !== '' && avatar !== null) {
    if (typeof avatar !== 'string' || avatar.length > AVATAR_MAX_LENGTH || !AVATAR_PATTERN.test(avatar)) {
      ctx.status = 400;
      ctx.body = error('头像格式不正确或图片过大', 400);
      return;
    }
  }

  const profile = await merchantService.updateProfile(merchantId, { shop_name, phone, avatar });

  if (!profile) {
    ctx.status = 404;
    ctx.body = error('商户不存在', 404);
    return;
  }

  ctx.body = success(profile);
};

module.exports = { getProfile, updateProfile };
