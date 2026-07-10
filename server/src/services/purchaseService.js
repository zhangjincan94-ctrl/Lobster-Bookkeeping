const { randomUUID } = require('crypto');
const {
  sequelize,
  PurchaseRecord,
  Supplier,
  SupplierPaymentRecord,
  TransactionPurchaseAllocation,
  Transaction,
  Buyer,
  Sequelize
} = require('../models');
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

const serviceError = (message, status, context) => {
  const err = new Error(message);
  err.status = status;
  err.context = context;
  return err;
};

const buildDateRange = (startDate, endDate) => {
  const range = {};
  if (startDate) range[Op.gte] = new Date(`${startDate} 00:00:00`);
  if (endDate) range[Op.lte] = new Date(`${endDate} 23:59:59`);
  return range;
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
    where.received_at = buildDateRange(start_date, end_date);
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await PurchaseRecord.findAndCountAll({
    where,
    include: [{
      model: Supplier,
      as: 'supplier',
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
      as: 'supplier',
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
  if (amounts.netWeight <= 0 || amounts.unitCost <= 0 || amounts.totalCost <= 0) {
    throw serviceError('采购净重、单价和总成本必须大于0', 400, {
      feature: '创建采购单', merchantId
    });
  }
  if (amounts.paidAmount < 0 || amounts.paidAmount > amounts.totalCost) {
    throw serviceError('已付金额必须在0和采购总成本之间', 400, {
      feature: '创建采购单', merchantId
    });
  }

  let record;
  let supplier;
  await sequelize.transaction(async (dbTx) => {
    supplier = await Supplier.findOne({
      where: { id: data.supplier_id, merchant_id: merchantId },
      transaction: dbTx
    });
    if (!supplier) {
      throw serviceError('供应商不存在或不属于当前商户', 400, {
        feature: '创建采购单', merchantId, supplierId: data.supplier_id
      });
    }

    record = await PurchaseRecord.create({
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
      remark: data.remark || null,
      share_token: randomUUID()
    }, { transaction: dbTx });

    if (amounts.paidAmount > 0) {
      await SupplierPaymentRecord.create({
        purchase_record_id: record.id,
        amount: amounts.paidAmount,
        paid_at: data.received_at,
        note: '创建采购单时录入'
      }, { transaction: dbTx });
    }
  });

  return serializePurchaseListItem(record, supplier);
};

const getPurchaseShareData = async (shareToken) => {
  const record = await PurchaseRecord.findOne({
    where: { share_token: shareToken },
    include: [
      {
        model: Supplier,
        as: 'supplier',
        attributes: ['id', 'name', 'phone']
      },
      {
        model: SupplierPaymentRecord,
        as: 'SupplierPaymentRecords'
      }
    ],
    order: [[{ model: SupplierPaymentRecord, as: 'SupplierPaymentRecords' }, 'paid_at', 'DESC']]
  });
  if (!record || Number(record.order_status) === 1) {
    throw serviceError('链接无效或已失效', 404, {
      feature: '查看采购分享记录',
      shareTokenPrefix: String(shareToken || '').slice(0, 8)
    });
  }

  return serializePurchaseDetail(record);
};

const getPurchase = async (merchantId, purchaseId) => {
  const record = await PurchaseRecord.findOne({
    where: { id: purchaseId, merchant_id: merchantId },
    include: [
      {
        model: Supplier,
        as: 'supplier',
        attributes: ['id', 'name', 'phone']
      },
      {
        model: SupplierPaymentRecord,
        as: 'SupplierPaymentRecords'
      },
      {
        model: TransactionPurchaseAllocation,
        as: 'TransactionAllocations',
        include: [{
          model: Transaction,
          as: 'transaction',
          attributes: ['id', 'buyer_id', 'transaction_time'],
          include: [{
            model: Buyer,
            as: 'buyer',
            attributes: ['id', 'name']
          }]
        }]
      }
    ],
    order: [[{ model: SupplierPaymentRecord, as: 'SupplierPaymentRecords' }, 'paid_at', 'DESC']]
  });
  if (!record) return null;
  if (!record.share_token) {
    await record.update({ share_token: randomUUID() });
  }

  return serializePurchaseDetail(record);
};

const updatePurchase = async (merchantId, purchaseId, data) => {
  let record;
  await sequelize.transaction(async (dbTx) => {
    record = await PurchaseRecord.findOne({
      where: { id: purchaseId, merchant_id: merchantId },
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!record) return;

    const updateFields = {};
    const allowedFields = [
      'supplier_id', 'lobster_size', 'gross_weight', 'tare_weight',
      'deduct_weight', 'net_weight', 'unit_cost', 'total_cost',
      'received_at', 'order_status', 'remark'
    ];
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateFields[field] = data[field];
    }

    if (Number(record.order_status) === 1) {
      throw serviceError('已取消的采购单不能恢复或修改', 400, {
        feature: '更新采购单', merchantId, purchaseId
      });
    }

    if (updateFields.supplier_id !== undefined) {
      const supplier = await Supplier.findOne({
        where: { id: updateFields.supplier_id, merchant_id: merchantId },
        transaction: dbTx
      });
      if (!supplier) {
        throw serviceError('供应商不存在或不属于当前商户', 400, {
          feature: '更新采购单', merchantId, purchaseId, supplierId: updateFields.supplier_id
        });
      }
    }

    const allocated = toNumber(await TransactionPurchaseAllocation.sum('weight', {
      where: { purchase_record_id: purchaseId },
      transaction: dbTx
    }));
    const changesAllocatedPurchase = allocated > 0 && (
      (updateFields.lobster_size !== undefined && updateFields.lobster_size !== record.lobster_size) ||
      (updateFields.unit_cost !== undefined && toNumber(updateFields.unit_cost) !== toNumber(record.unit_cost))
    );
    if (changesAllocatedPurchase) {
      throw serviceError('已有销售分摊的采购单不能修改规格或单价', 400, {
        feature: '更新采购单', merchantId, purchaseId, allocatedWeight: allocated
      });
    }

    if (Number(updateFields.order_status) === 1) {
      if (allocated > 0) {
        throw serviceError('已被销售使用的采购单不能取消', 400, {
          feature: '取消采购单', merchantId, purchaseId, allocatedWeight: allocated
        });
      }
      updateFields.cancelled_at = new Date();
      updateFields.remaining_weight = 0;
    } else if (updateFields.net_weight !== undefined) {
      const netWeight = toNumber(updateFields.net_weight);
      if (netWeight <= 0) {
        throw serviceError('采购净重必须大于0', 400, {
          feature: '更新采购单', merchantId, purchaseId
        });
      }
      if (netWeight < allocated) {
        throw serviceError('新斤数不能小于已被销售关联的斤数', 400, {
          feature: '更新采购单', merchantId, purchaseId, netWeight, allocatedWeight: allocated
        });
      }
      updateFields.remaining_weight = roundMoney(netWeight - allocated);
    }

    if (updateFields.total_cost === undefined &&
        (updateFields.net_weight !== undefined || updateFields.unit_cost !== undefined)) {
      const netWeight = toNumber(updateFields.net_weight !== undefined ? updateFields.net_weight : record.net_weight);
      const unitCost = toNumber(updateFields.unit_cost !== undefined ? updateFields.unit_cost : record.unit_cost);
      updateFields.total_cost = roundMoney(netWeight * unitCost);
    }
    if (updateFields.total_cost !== undefined) {
      const totalCost = toNumber(updateFields.total_cost);
      if (totalCost <= 0 || totalCost < toNumber(record.paid_amount)) {
        throw serviceError('采购总成本必须大于0且不能小于已付金额', 400, {
          feature: '更新采购单', merchantId, purchaseId
        });
      }
      updateFields.total_cost = totalCost;
      updateFields.settlement_status = getSettlementStatus(totalCost, toNumber(record.paid_amount));
    }

    await record.update(updateFields, { transaction: dbTx });
  });

  if (!record) return null;
  const supplier = await Supplier.findOne({ where: { id: record.supplier_id, merchant_id: merchantId } });
  return serializePurchaseListItem(record, supplier);
};

const addSupplierPaymentRecord = async (merchantId, purchaseId, data) => {
  const amount = roundMoney(toNumber(data.amount));
  if (amount <= 0) {
    throw serviceError('付款金额必须大于0', 400, {
      feature: '采购补录付款', merchantId, purchaseId
    });
  }

  let record;
  let paymentRecord;
  let newPaidAmount;
  let settlementStatus;
  await sequelize.transaction(async (dbTx) => {
    record = await PurchaseRecord.findOne({
      where: { id: purchaseId, merchant_id: merchantId },
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!record) return;
    if (Number(record.order_status) === 1) {
      throw serviceError('已取消的采购单不能补录付款', 400, {
        feature: '采购补录付款', merchantId, purchaseId
      });
    }

    const remainingAmount = roundMoney(toNumber(record.total_cost) - toNumber(record.paid_amount));
    if (amount > remainingAmount) {
      throw serviceError('付款金额不能超过剩余未付金额', 400, {
        feature: '采购补录付款', merchantId, purchaseId, amount, remainingAmount
      });
    }

    paymentRecord = await SupplierPaymentRecord.create({
      purchase_record_id: purchaseId,
      amount,
      payment_method: data.payment_method || null,
      paid_at: data.paid_at,
      note: data.note || null
    }, { transaction: dbTx });

    newPaidAmount = roundMoney(toNumber(record.paid_amount) + amount);
    settlementStatus = getSettlementStatus(toNumber(record.total_cost), newPaidAmount);
    await record.update({
      paid_amount: newPaidAmount,
      settlement_status: settlementStatus
    }, { transaction: dbTx });
  });

  if (!record) return null;

  return serializeSupplierPaymentResult(paymentRecord, record, newPaidAmount, settlementStatus);
};

module.exports = {
  listPurchases,
  listAvailablePurchases,
  createPurchase,
  getPurchaseShareData,
  getPurchase,
  updatePurchase,
  addSupplierPaymentRecord
};
