const supplierService = require('../services/supplierService');
const { success, error, paginate } = require('../utils/response');

const list = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { keyword, page = 1, pageSize, page_size } = ctx.query;
  const size = Number(pageSize || page_size || 10);

  const result = await supplierService.listSuppliers(merchantId, {
    keyword,
    page: Number(page),
    pageSize: size
  });

  ctx.body = paginate(result.list, result.total, page, size);
};

const create = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const { name, phone, remark } = ctx.request.body;

  if (!name) {
    ctx.status = 400;
    ctx.body = error('上游卖家名称不能为空', 400);
    return;
  }

  const supplier = await supplierService.createSupplier(merchantId, { name, phone, remark });
  ctx.body = success(supplier);
};

const update = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const supplierId = ctx.params.id;
  const { name, phone, remark } = ctx.request.body;

  if (name === undefined && phone === undefined && remark === undefined) {
    ctx.status = 400;
    ctx.body = error('至少需要提供name、phone或remark', 400);
    return;
  }

  const supplier = await supplierService.updateSupplier(merchantId, supplierId, { name, phone, remark });
  if (!supplier) {
    ctx.status = 404;
    ctx.body = error('上游卖家不存在', 404);
    return;
  }

  ctx.body = success(supplier);
};

const detail = async (ctx) => {
  const merchantId = ctx.state.merchant.id;
  const supplierId = ctx.params.id;

  const supplier = await supplierService.getSupplierDetail(merchantId, supplierId);
  if (!supplier) {
    ctx.status = 404;
    ctx.body = error('上游卖家不存在', 404);
    return;
  }

  ctx.body = success(supplier);
};

module.exports = { list, create, update, detail, remove, shareRecords };

async function remove(ctx) {
  const merchantId = ctx.state.merchant.id;
  const supplierId = ctx.params.id;
  await supplierService.removeSupplier(merchantId, supplierId);
  ctx.body = success({ id: supplierId });
}

async function shareRecords(ctx) {
  const token = ctx.params.token;
  const data = await supplierService.getSupplierShareData(token);
  ctx.body = success(data);
}
