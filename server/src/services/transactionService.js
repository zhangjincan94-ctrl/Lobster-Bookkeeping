const { sequelize, Transaction, Buyer, PaymentRecord, PurchaseRecord, TransactionPurchaseAllocation, Supplier, Sequelize } = require('../models');
const {
  serializeTransactionListItem,
  serializeTransactionDetail,
  serializePaymentResult
} = require('../serializers');
const { Op } = Sequelize;

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value) => {
  return Math.round(value * 100) / 100;
};

const optionalDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  // 仅传 "HH:mm" 之类纯时间时，按今天日期补齐；非法值直接返回 null
  const str = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${now.getFullYear()}-${month}-${day}`;
    const t = str.length === 5 ? str + ':00' : str;
    return today + ' ' + t;
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : value;
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

const normalizeSourceAllocations = (data) => {
  const allocations = data.source_allocations || data.purchase_allocations || [];
  return Array.isArray(allocations) ? allocations : [];
};

const getAllocationPurchaseId = (allocation) => {
  return allocation.purchase_record_id || allocation.purchaseRecordId || allocation.id;
};

const listTransactions = async (merchantId, { buyer_id, payment_status, start_date, end_date, page = 1, pageSize = 10 }) => {
  const where = { merchant_id: merchantId };
  if (buyer_id) where.buyer_id = buyer_id;
  if (payment_status !== undefined && payment_status !== '') where.payment_status = payment_status;
  if (start_date || end_date) {
    where.transaction_time = buildDateRange(start_date, end_date);
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await Transaction.findAndCountAll({
    where,
    include: [{
      model: Buyer,
      as: 'buyer',
      attributes: ['id', 'name', 'phone']
    }],
    limit: pageSize,
    offset,
    order: [['transaction_time', 'DESC']]
  });

  const list = rows.map(t => serializeTransactionListItem(t));

  return { list, total: count };
};

const createTransaction = async (merchantId, data) => {
  let total_amount = data.total_amount;
  if (total_amount === undefined && data.weight !== undefined && data.unit_price !== undefined) {
    total_amount = roundMoney(toNumber(data.weight) * toNumber(data.unit_price));
  }

  total_amount = toNumber(total_amount);
  if (total_amount <= 0) {
    throw serviceError('交易总金额必须大于0', 400, { feature: '创建销售单', merchantId });
  }

  let paid_amount = toNumber(data.paid_amount);
  if (Number(data.payment_status) === 1) {
    paid_amount = total_amount;
  }
  if (paid_amount < 0 || paid_amount > total_amount) {
    throw serviceError('已付金额必须在0和交易总金额之间', 400, { feature: '创建销售单', merchantId });
  }

  const paymentStatus = paid_amount >= total_amount ? 1 : (paid_amount > 0 ? 2 : 0);

  let transaction;
  let buyer;
  await sequelize.transaction(async (dbTx) => {
    buyer = await Buyer.findOne({
      where: { id: data.buyer_id, merchant_id: merchantId },
      transaction: dbTx
    });
    if (!buyer) {
      throw serviceError('买家不存在或不属于当前商户', 400, {
        feature: '创建销售单', merchantId, buyerId: data.buyer_id
      });
    }

    transaction = await Transaction.create({
      merchant_id: merchantId,
      buyer_id: data.buyer_id,
      lobster_size: data.lobster_size,
      weight: data.weight || null,
      unit_price: data.unit_price || null,
      total_amount: total_amount,
      payment_status: paymentStatus,
      paid_amount: paid_amount,
      delivery_address: data.delivery_address || null,
      delivery_status: data.delivery_status || 0,
      delivery_time: optionalDate(data.delivery_time),
      remark: data.remark || null,
      transaction_time: data.transaction_time
    }, { transaction: dbTx });

    if (paid_amount > 0) {
      await PaymentRecord.create({
        transaction_id: transaction.id,
        amount: paid_amount,
        payment_method: data.payment_method || null,
        paid_at: optionalDate(data.transaction_time) || new Date(),
        note: '录入时初始付款'
      }, { transaction: dbTx });
    }

    await _applyPurchaseAllocations(merchantId, transaction.id, data.lobster_size, data.weight, normalizeSourceAllocations(data), dbTx);
  });

  return serializeTransactionListItem(transaction, buyer);
};

const getTransaction = async (merchantId, transactionId) => {
  const transaction = await Transaction.findOne({
    where: { id: transactionId, merchant_id: merchantId },
    include: [
      {
        model: Buyer,
        as: 'buyer',
        attributes: ['id', 'name', 'phone']
      },
      {
        model: PaymentRecord,
        as: 'PaymentRecords'
      },
      {
        model: TransactionPurchaseAllocation,
        as: 'PurchaseAllocations',
        include: [{
          model: PurchaseRecord,
          as: 'purchase_record',
          include: [{
            model: Supplier,
            as: 'supplier',
            attributes: ['id', 'name', 'phone']
          }]
        }]
      }
    ],
    order: [[{ model: PaymentRecord, as: 'PaymentRecords' }, 'paid_at', 'DESC']]
  });
  if (!transaction) return null;

  return serializeTransactionDetail(transaction);
};

const updateTransaction = async (merchantId, transactionId, data) => {
  let transaction;
  await sequelize.transaction(async (dbTx) => {
    transaction = await Transaction.findOne({
      where: { id: transactionId, merchant_id: merchantId },
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!transaction) return;

    const updateFields = {};
    const allowedFields = [
      'buyer_id', 'lobster_size', 'weight', 'unit_price',
      'total_amount', 'delivery_address', 'delivery_status', 'delivery_time',
      'order_status', 'remark', 'transaction_time'
    ];
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateFields[field] = data[field];
    }

    if (Number(transaction.order_status) === 1) {
      throw serviceError('已取消的销售单不能恢复或修改', 400, {
        feature: '更新销售单', merchantId, transactionId
      });
    }

    if (updateFields.buyer_id !== undefined) {
      const buyer = await Buyer.findOne({
        where: { id: updateFields.buyer_id, merchant_id: merchantId },
        transaction: dbTx
      });
      if (!buyer) {
        throw serviceError('买家不存在或不属于当前商户', 400, {
          feature: '更新销售单', merchantId, transactionId, buyerId: updateFields.buyer_id
        });
      }
    }

    const allocations = await TransactionPurchaseAllocation.count({
      where: { transaction_id: transactionId },
      transaction: dbTx
    });
    const changesAllocatedSale = allocations > 0 && (
      (updateFields.lobster_size !== undefined && updateFields.lobster_size !== transaction.lobster_size) ||
      (updateFields.weight !== undefined && toNumber(updateFields.weight) !== toNumber(transaction.weight))
    );
    if (changesAllocatedSale) {
      throw serviceError('已分摊货源的销售单不能修改规格或重量', 400, {
        feature: '更新销售单', merchantId, transactionId, allocationCount: allocations
      });
    }

    if (updateFields.delivery_time !== undefined) {
      updateFields.delivery_time = optionalDate(updateFields.delivery_time);
    }

    if (updateFields.total_amount === undefined &&
        (updateFields.weight !== undefined || updateFields.unit_price !== undefined)) {
      const weight = toNumber(updateFields.weight !== undefined ? updateFields.weight : transaction.weight);
      const unitPrice = toNumber(updateFields.unit_price !== undefined ? updateFields.unit_price : transaction.unit_price);
      updateFields.total_amount = roundMoney(weight * unitPrice);
    }
    if (updateFields.total_amount !== undefined) {
      const total = toNumber(updateFields.total_amount);
      if (total <= 0 || total < toNumber(transaction.paid_amount)) {
        throw serviceError('交易总金额必须大于0且不能小于已付金额', 400, {
          feature: '更新销售单', merchantId, transactionId
        });
      }
      updateFields.total_amount = total;
      updateFields.payment_status = toNumber(transaction.paid_amount) >= total ? 1 :
        (toNumber(transaction.paid_amount) > 0 ? 2 : 0);
    }

    const shouldCancel = Number(updateFields.order_status) === 1 && Number(transaction.order_status) !== 1;
    if (shouldCancel) {
      await _restorePurchaseAllocations(transactionId, dbTx);
      updateFields.cancelled_at = new Date();
    }
    await transaction.update(updateFields, { transaction: dbTx });
  });

  if (!transaction) return null;

  const buyer = await Buyer.findOne({ where: { id: transaction.buyer_id, merchant_id: merchantId } });

  return serializeTransactionListItem(transaction, buyer);
};

const _applyPurchaseAllocations = async (merchantId, transactionId, lobsterSize, saleWeight, allocations, dbTx) => {
  if (allocations.length === 0) return;

  const totalWeight = toNumber(saleWeight);
  if (totalWeight <= 0) {
    throw serviceError('选择货源时销售重量必须大于0', 400, {
      feature: '销售货源分摊', merchantId, transactionId, saleWeight
    });
  }

  const allocationTotal = roundMoney(allocations.reduce((sum, item) => sum + toNumber(item.weight), 0));
  if (Math.abs(allocationTotal - roundMoney(totalWeight)) > 0.01) {
    throw serviceError('货源分摊重量必须等于销售重量', 400, {
      feature: '销售货源分摊', merchantId, transactionId, saleWeight: totalWeight, allocationTotal
    });
  }

  for (let allocationIndex = 0; allocationIndex < allocations.length; allocationIndex++) {
    const allocation = allocations[allocationIndex];
    const purchaseRecordId = getAllocationPurchaseId(allocation);
    const weight = toNumber(allocation.weight);
    if (!purchaseRecordId || weight <= 0) {
      throw serviceError('货源分摊信息无效', 400, {
        feature: '销售货源分摊', merchantId, transactionId, allocationIndex
      });
    }

    const purchase = await PurchaseRecord.findOne({
      where: {
        id: purchaseRecordId,
        merchant_id: merchantId,
        order_status: { [Op.ne]: 1 }
      },
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!purchase) {
      throw serviceError('货源不存在或已取消', 404, {
        feature: '销售货源分摊', merchantId, transactionId, purchaseRecordId
      });
    }
    if (purchase.lobster_size !== lobsterSize) {
      throw serviceError('货源规格与销售规格不一致', 400, {
        feature: '销售货源分摊', merchantId, transactionId, purchaseRecordId
      });
    }

    const remainingWeight = toNumber(purchase.remaining_weight);
    if (remainingWeight + 0.0001 < weight) {
      throw serviceError('货源剩余库存不足', 400, {
        feature: '销售货源分摊', merchantId, transactionId, purchaseRecordId,
        requestedWeight: weight, remainingWeight
      });
    }

    const unitCost = toNumber(purchase.unit_cost);
    await purchase.update({
      remaining_weight: roundMoney(remainingWeight - weight)
    }, { transaction: dbTx });

    await TransactionPurchaseAllocation.create({
      transaction_id: transactionId,
      purchase_record_id: purchaseRecordId,
      weight,
      unit_cost: unitCost,
      total_cost: roundMoney(weight * unitCost)
    }, { transaction: dbTx });
  }
};

const _restorePurchaseAllocations = async (transactionId, dbTx) => {
  const allocations = await TransactionPurchaseAllocation.findAll({
    where: { transaction_id: transactionId },
    transaction: dbTx
  });

  for (const allocation of allocations) {
    const purchase = await PurchaseRecord.findByPk(allocation.purchase_record_id, {
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!purchase) {
      console.warn('[库存恢复失败]', {
        feature: '取消销售单',
        reason: '分摊对应的采购记录不存在',
        transactionId,
        purchaseRecordId: allocation.purchase_record_id
      });
      continue;
    }

    await purchase.update({
      remaining_weight: roundMoney(toNumber(purchase.remaining_weight) + toNumber(allocation.weight))
    }, { transaction: dbTx });
  }

  if (allocations.length > 0) {
    await TransactionPurchaseAllocation.destroy({
      where: { transaction_id: transactionId },
      transaction: dbTx
    });
  }
};

const addPaymentRecord = async (merchantId, transactionId, data) => {
  const amount = roundMoney(toNumber(data.amount));
  if (amount <= 0) {
    throw serviceError('付款金额必须大于0', 400, {
      feature: '销售补录付款', merchantId, transactionId
    });
  }

  let transaction;
  let paymentRecord;
  let newPaidAmount;
  let paymentStatus;
  await sequelize.transaction(async (dbTx) => {
    transaction = await Transaction.findOne({
      where: { id: transactionId, merchant_id: merchantId },
      transaction: dbTx,
      lock: dbTx.LOCK.UPDATE
    });
    if (!transaction) return;
    if (Number(transaction.order_status) === 1) {
      throw serviceError('已取消的订单不能补录付款', 400, {
        feature: '销售补录付款', merchantId, transactionId
      });
    }

    const remainingAmount = roundMoney(toNumber(transaction.total_amount) - toNumber(transaction.paid_amount));
    if (amount > remainingAmount) {
      throw serviceError('付款金额不能超过剩余未付金额', 400, {
        feature: '销售补录付款', merchantId, transactionId, amount, remainingAmount
      });
    }

    paymentRecord = await PaymentRecord.create({
      transaction_id: transactionId,
      amount,
      payment_method: data.payment_method || null,
      paid_at: data.paid_at,
      note: data.note || null
    }, { transaction: dbTx });

    newPaidAmount = roundMoney(toNumber(transaction.paid_amount) + amount);
    paymentStatus = newPaidAmount >= toNumber(transaction.total_amount) ? 1 : 2;
    await transaction.update({
      paid_amount: newPaidAmount,
      payment_status: paymentStatus
    }, { transaction: dbTx });
  });

  if (!transaction) return null;

  return serializePaymentResult(paymentRecord, transaction, newPaidAmount, paymentStatus);
};

module.exports = {
  listTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  addPaymentRecord
};
