const buyerService = require('../services/buyerService');
const { success, error, paginate } = require('../utils/response');

const list = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { keyword, page = 1, pageSize, page_size } = ctx.query;
  const size = Number(pageSize || page_size || 10);

  const result = await buyerService.listBuyers(merchantId, { keyword, page: Number(page), pageSize: size });

  ctx.body = paginate(result.list, result.total, page, size);
};

const create = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { name, phone } = ctx.request.body;

  if (!name) {
    ctx.status = 400;
    ctx.body = error('买家名称不能为空', 400);
    return;
  }

  const buyer = await buyerService.createBuyer(merchantId, { name, phone });

  ctx.body = success(buyer);
};

const update = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const buyerId = ctx.params.id;
  const { name, phone } = ctx.request.body;

  if (name === undefined && phone === undefined) {
    ctx.status = 400;
    ctx.body = error('至少需要提供name或phone', 400);
    return;
  }

  const buyer = await buyerService.updateBuyer(merchantId, buyerId, { name, phone });

  if (!buyer) {
    ctx.status = 404;
    ctx.body = error('买家不存在', 404);
    return;
  }

  ctx.body = success(buyer);
};

const detail = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const buyerId = ctx.params.id;

  const buyer = await buyerService.getBuyerDetail(merchantId, buyerId);

  if (!buyer) {
    ctx.status = 404;
    ctx.body = error('买家不存在', 404);
    return;
  }

  ctx.body = success(buyer);
};

const shareRecords = async (ctx) => {
  const shareToken = ctx.params.token;

  const result = await buyerService.getBuyerByShareToken(shareToken);

  if (!result) {
    ctx.status = 404;
    ctx.body = error('分享链接无效', 404);
    return;
  }

  ctx.body = success(result);
};

module.exports = { list, create, update, detail, shareRecords };
