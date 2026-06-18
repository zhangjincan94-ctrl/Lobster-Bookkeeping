const { Supplier, PurchaseRecord, sequelize, Sequelize } = require('../models');
const { serializeSupplier } = require('../serializers');
const { Op } = Sequelize;

const listSuppliers = async (merchantId, { keyword, page = 1, pageSize = 10 }) => {
  const where = { merchant_id: merchantId };
  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { phone: { [Op.like]: `%${keyword}%` } }
    ];
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await Supplier.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['id', 'DESC']]
  });

  const suppliers = [];
  for (const supplier of rows) {
    const stats = await _computeSupplierStats(supplier.id);
    suppliers.push(serializeSupplier(supplier, stats));
  }

  return { list: suppliers, total: count };
};

const createSupplier = async (merchantId, data) => {
  const supplier = await Supplier.create({
    merchant_id: merchantId,
    name: data.name,
    phone: data.phone || null,
    remark: data.remark || null
  });

  return serializeSupplier(supplier);
};

const updateSupplier = async (merchantId, supplierId, data) => {
  const supplier = await Supplier.findOne({
    where: { id: supplierId, merchant_id: merchantId }
  });
  if (!supplier) return null;

  const updateFields = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.phone !== undefined) updateFields.phone = data.phone;
  if (data.remark !== undefined) updateFields.remark = data.remark;

  await supplier.update(updateFields);
  const stats = await _computeSupplierStats(supplier.id);

  return serializeSupplier(supplier, stats);
};

const getSupplierDetail = async (merchantId, supplierId) => {
  const supplier = await Supplier.findOne({
    where: { id: supplierId, merchant_id: merchantId }
  });
  if (!supplier) return null;

  const stats = await _computeSupplierStats(supplier.id);
  return serializeSupplier(supplier, stats);
};

const _computeSupplierStats = async (supplierId) => {
  const result = await PurchaseRecord.findOne({
    where: { supplier_id: supplierId, order_status: { [Op.ne]: 1 } },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('net_weight')), 0), 'total_weight'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost')), 0), 'total_cost'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('CASE WHEN settlement_status != 1 THEN total_cost - paid_amount ELSE 0 END')), 0), 'total_debt'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'purchase_count']
    ],
    raw: true
  });

  return {
    total_weight: parseFloat(result.total_weight) || 0,
    total_cost: parseFloat(result.total_cost) || 0,
    total_debt: parseFloat(result.total_debt) || 0,
    purchase_count: parseInt(result.purchase_count, 10) || 0
  };
};

module.exports = {
  listSuppliers,
  createSupplier,
  updateSupplier,
  getSupplierDetail
};
