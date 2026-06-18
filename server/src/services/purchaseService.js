const { PurchaseRecord, Supplier, SupplierPaymentRecord, TransactionPurchaseAllocation, Sequelize } = require('../models');
const {
  serializePurchaseListItem,
  serializePurchaseDetail,
  serializeSupplierPaymentResult
} = require('../serializers');
const { Op } = Sequelize;

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value) => {
  return Math.round(value * 100) / 100;
};

const getSettlementStatus = (totalCost, paidAmount) => {
  if (paidAmount >= totalCost) return 1;
  if (paidAmount > 0) return 2;
  return 0;
};

const buildPurchaseAmounts = (data) => {
  const grossWeight = toNumber(data.gross_weight);
  const tareWeight = toNumber(data.tare_weight);
  const deductWeight = toNumber(data.deduct_weight);
  const netWeight = data.net_weight !== undefined && data.net_weight !== ''
    ? toNumber(data.net_weight)
    : roundMoney(grossWeight - tareWeight - deductWeight);
  const unitCost = toNumber(data.unit_cost);
  const totalCost = data.total_cost !== undefined && data.total_cost !== ''
    ? toNumber(data.total_cost)
    : roundMoney(netWeight * unitCost);

  let paidAmount = toNumber(data.paid_amount);
  if (Number(data.settlement_status) === 1) {
    paidAmount = totalCost;
  }

  return {
    grossWeight,
    tareWeight,
    deductWeight,
    netWeight,
    unitCost,
    totalCost,
    paidAmount,
    settlementStatus: getSettlementStatus(totalCost, paidAmount)
  };
};

const listPurchases = async (merchantId, { supplier_id, settlement_status, start_date, end_date, page = 1, pageSize = 10 }) => {
  const where = { merchant_id: merchantId };
  if (supplier_id) where.supplier_id = supplier_id;
  if (settlement_status !== undefined && settlement_status !== '') where.settlement_status = settlement_status;
  if (start_date || end_date) {
    where.received_at = {};
    if (start_date) where.received_at[Op.gte] = start_date;
    if (end_date) where.received_at[Op.lte] = end_date;
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await PurchaseRecord.findAndCountAll({
    where,
    include: [{
      model: Supplier,
      attributes: ['id', 'name', 'phone']
    }],
    limit: pageSize,
    offset,
    order: [['received_at', 'DESC']]
  });

  const list = rows.map(record => serializePurchaseListItem(record));
  return { list, total: count };
};

const listAvailablePurchases = async (merchantId, { lobster_size, page = 1, pageSize = 20 }) => {
  const where = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 },
    remaining_weight: { [Op.gt]: 0 }
  };
  if (lobster_size) where.lobster_size = lobster_size;

  const offset = (page - 1) * pageSize;
  const { count, rows } = await PurchaseRecord.findAndCountAll({
    where,
    include: [{
      model: Supplier,
      attributes: ['id', 'name', 'phone']
    }],
    limit: pageSize,
    offset,
    order: [['received_at', 'ASC']]
  });

  const list = rows.map(record => serializePurchaseListItem(record));
  return { list, total: count };
};

const createPurchase = async (merchantId, data) => {
  const amounts = buildPurchaseAmounts(data);

  const record = await PurchaseRecord.create({
    merchant_id: merchantId,
    supplier_id: data.supplier_id,
    lobster_size: data.lobster_size,
    gross_weight: amounts.grossWeight,
    tare_weight: amounts.tareWeight,
    deduct_weight: amounts.deductWeight,
    net_weight: amounts.netWeight,
    remaining_weight: amounts.netWeight,
    unit_cost: amounts.unitCost,
    total_cost: amounts.totalCost,
    settlement_status: amounts.settlementStatus,
    paid_amount: amounts.paidAmount,
    received_at: data.received_at,
    remark: data.remark || null
  });

  const supplier = await Supplier.findByPk(data.supplier_id);
  return serializePurchaseListItem(record, supplier);
};

const getPurchase = async (merchantId, purchaseId) => {
  const record = await PurchaseRecord.findOne({
    where: { id: purchaseId, merchant_id: merchantId },
    include: [
      {
        model: Supplier,
        attributes: ['id', 'name', 'phone']
      },
      {
        model: SupplierPaymentRecord,
        as: 'SupplierPaymentRecords'
      }
    ],
    order: [[{ model: SupplierPaymentRecord, as: 'SupplierPaymentRecords' }, 'paid_at', 'DESC']]
  });
  if (!record) return null;

  return serializePurchaseDetail(record);
};

const updatePurchase = async (merchantId, purchaseId, data) => {
  const record = await PurchaseRecord.findOne({
    where: { id: purchaseId, merchant_id: merchantId }
  });
  if (!record) return null;

  const updateFields = {};
  const allowedFields = [
    'supplier_id', 'lobster_size', 'gross_weight', 'tare_weight',
    'deduct_weight', 'net_weight', 'unit_cost', 'total_cost',
    'settlement_status', 'paid_amount', 'received_at', 'order_status',
    'cancelled_at', 'remark'
  ];
  for (const field of allowedFields) {
    if (data[field] !== undefined) updateFields[field] = data[field];
  }

  if (Number(updateFields.order_status) === 1 && !updateFields.cancelled_at) {
    const allocated = await TransactionPurchaseAllocation.sum('weight', {
      where: { purchase_record_id: purchaseId }
    });
    if ((parseFloat(allocated) || 0) > 0) {
      const err = new Error('已被销售使用的采购单不能取消');
      err.status = 400;
      throw err;
    }
    updateFields.cancelled_at = new Date();
    updateFields.remaining_weight = 0;
  }

  if (updateFields.paid_amount !== undefined) {
    const total = toNumber(updateFields.total_cost !== undefined ? updateFields.total_cost : record.total_cost);
    const paid = toNumber(updateFields.paid_amount);
    updateFields.settlement_status = getSettlementStatus(total, paid);
  }

  await record.update(updateFields);

  const supplier = await Supplier.findByPk(record.supplier_id);
  return serializePurchaseListItem(record, supplier);
};

const addSupplierPaymentRecord = async (merchantId, purchaseId, data) => {
  const record = await PurchaseRecord.findOne({
    where: { id: purchaseId, merchant_id: merchantId }
  });
  if (!record) return null;
  if (Number(record.order_status) === 1) {
    const err = new Error('已取消的采购单不能补录付款');
    err.status = 400;
    throw err;
  }

  const paymentRecord = await SupplierPaymentRecord.create({
    purchase_record_id: purchaseId,
    amount: data.amount,
    payment_method: data.payment_method || null,
    paid_at: data.paid_at,
    note: data.note || null
  });

  const newPaidAmount = roundMoney(toNumber(record.paid_amount) + toNumber(data.amount));
  const settlementStatus = getSettlementStatus(toNumber(record.total_cost), newPaidAmount);

  await record.update({
    paid_amount: newPaidAmount,
    settlement_status: settlementStatus
  });

  return serializeSupplierPaymentResult(paymentRecord, record, newPaidAmount, settlementStatus);
};

module.exports = {
  listPurchases,
  listAvailablePurchases,
  createPurchase,
  getPurchase,
  updatePurchase,
  addSupplierPaymentRecord
};
