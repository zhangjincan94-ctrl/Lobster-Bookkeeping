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

const dayjs = require('dayjs');

const normalizeStartDate = (value) => dayjs(value).startOf('day').format('YYYY-MM-DD HH:mm:ss');
const normalizeEndDate = (value) => dayjs(value).endOf('day').format('YYYY-MM-DD HH:mm:ss');

const optionalDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  // 仅传 "HH:mm" 之类纯时间时，按今天日期补齐；非法值直接返回 null
  const str = String(value).trim();
  // 纯时间 13:00 / 13:00:00
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const today = dayjs().format('YYYY-MM-DD');
    const t = str.length === 5 ? str + ':00' : str;
    return today + ' ' + t;
  }
  const d = dayjs(str);
  if (!d.isValid()) return null;
  return d.format('YYYY-MM-DD HH:mm:ss');
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
    where.transaction_time = {};
    if (start_date) where.transaction_time[Op.gte] = normalizeStartDate(start_date);
    if (end_date) where.transaction_time[Op.lte] = normalizeEndDate(end_date);
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await Transaction.findAndCountAll({
    where,
    include: [{
      model: Buyer,
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
    total_amount = parseFloat(data.weight) * parseFloat(data.unit_price);
  }

  let paid_amount = data.paid_amount || 0;
  if (data.payment_status === 1) {
    paid_amount = total_amount;
  }

  let transaction;
  let buyer;
  await sequelize.transaction(async (dbTx) => {
    transaction = await Transaction.create({
      merchant_id: merchantId,
      buyer_id: data.buyer_id,
      lobster_size: data.lobster_size,
      weight: data.weight || null,
      unit_price: data.unit_price || null,
      total_amount: total_amount,
      payment_status: data.payment_status || 0,
      paid_amount: paid_amount,
      delivery_address: data.delivery_address || null,
      delivery_status: data.delivery_status || 0,
      delivery_time: optionalDate(data.delivery_time),
      remark: data.remark || null,
      transaction_time: data.transaction_time
    }, { transaction: dbTx });

    // 录入时如有已付金额，同步生成一条付款记录，避免详情页统计缺失
    if (parseFloat(paid_amount) > 0) {
      await PaymentRecord.create({
        transaction_id: transaction.id,
        amount: paid_amount,
        payment_method: data.payment_method || null,
        paid_at: optionalDate(data.transaction_time) || new Date(),
        note: '录入时初始付款'
      }, { transaction: dbTx });
    }

    await _applyPurchaseAllocations(merchantId, transaction.id, data.lobster_size, data.weight, normalizeSourceAllocations(data), dbTx);

    buyer = await Buyer.findByPk(data.buyer_id, { transaction: dbTx });
  });

  return serializeTransactionListItem(transaction, buyer);
};

const getTransaction = async (merchantId, transactionId) => {
  const transaction = await Transaction.findOne({
    where: { id: transactionId, merchant_id: merchantId },
    include: [
      {
        model: Buyer,
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
          include: [{
            model: Supplier,
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
  const transaction = await Transaction.findOne({
    where: { id: transactionId, merchant_id: merchantId }
  });
  if (!transaction) return null;

  const updateFields = {};
  const allowedFields = [
    'buyer_id', 'lobster_size', 'weight', 'unit_price',
    'total_amount', 'payment_status', 'paid_amount', 'delivery_address',
    'delivery_status', 'delivery_time', 'order_status', 'cancelled_at',
    'remark', 'transaction_time'
  ];
  for (const field of allowedFields) {
    if (data[field] !== undefined) updateFields[field] = data[field];
  }

  if (updateFields.delivery_time !== undefined) {
    updateFields.delivery_time = optionalDate(updateFields.delivery_time);
  }
  if (updateFields.cancelled_at !== undefined) {
    updateFields.cancelled_at = optionalDate(updateFields.cancelled_at);
  }

  const shouldCancel = Number(updateFields.order_status) === 1 && Number(transaction.order_status) !== 1;
  if (shouldCancel && !updateFields.cancelled_at) {
    updateFields.cancelled_at = new Date();
  }

  if (updateFields.paid_amount !== undefined) {
    const total = parseFloat(updateFields.total_amount !== undefined ? updateFields.total_amount : transaction.total_amount);
    const paid = parseFloat(updateFields.paid_amount);
    if (paid >= total) {
      updateFields.payment_status = 1;
    } else if (paid > 0 && paid < total) {
      updateFields.payment_status = 2;
    } else {
      updateFields.payment_status = 0;
    }
  }

  await sequelize.transaction(async (dbTx) => {
    if (shouldCancel) {
      await _restorePurchaseAllocations(transactionId, dbTx);
    }
    await transaction.update(updateFields, { transaction: dbTx });
  });

  const buyer = await Buyer.findByPk(transaction.buyer_id);

  return serializeTransactionListItem(transaction, buyer);
};

const _applyPurchaseAllocations = async (merchantId, transactionId, lobsterSize, saleWeight, allocations, dbTx) => {
  if (allocations.length === 0) return;

  const totalWeight = toNumber(saleWeight);
  if (totalWeight <= 0) {
    const err = new Error('选择货源时销售重量必须大于0');
    err.status = 400;
    throw err;
  }

  const allocationTotal = roundMoney(allocations.reduce((sum, item) => sum + toNumber(item.weight), 0));
  if (Math.abs(allocationTotal - roundMoney(totalWeight)) > 0.01) {
    const err = new Error('货源分摊重量必须等于销售重量');
    err.status = 400;
    throw err;
  }

  for (const allocation of allocations) {
    const purchaseRecordId = getAllocationPurchaseId(allocation);
    const weight = toNumber(allocation.weight);
    if (!purchaseRecordId || weight <= 0) {
      const err = new Error('货源分摊信息无效');
      err.status = 400;
      throw err;
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
      const err = new Error('货源不存在或已取消');
      err.status = 404;
      throw err;
    }
    if (purchase.lobster_size !== lobsterSize) {
      const err = new Error('货源规格与销售规格不一致');
      err.status = 400;
      throw err;
    }

    const remainingWeight = toNumber(purchase.remaining_weight);
    if (remainingWeight + 0.0001 < weight) {
      const err = new Error('货源剩余库存不足');
      err.status = 400;
      throw err;
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
    if (!purchase) continue;

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
  const transaction = await Transaction.findOne({
    where: { id: transactionId, merchant_id: merchantId }
  });
  if (!transaction) return null;
  if (Number(transaction.order_status) === 1) {
    const err = new Error('已取消的订单不能补录付款');
    err.status = 400;
    throw err;
  }

  const paymentRecord = await PaymentRecord.create({
    transaction_id: transactionId,
    amount: data.amount,
    payment_method: data.payment_method || null,
    paid_at: data.paid_at,
    note: data.note || null
  });

  const newPaidAmount = parseFloat(transaction.paid_amount) + parseFloat(data.amount);
  let paymentStatus;
  if (newPaidAmount >= parseFloat(transaction.total_amount)) {
    paymentStatus = 1;
  } else if (newPaidAmount > 0) {
    paymentStatus = 2;
  } else {
    paymentStatus = 0;
  }

  await transaction.update({
    paid_amount: newPaidAmount,
    payment_status: paymentStatus
  });

  return serializePaymentResult(paymentRecord, transaction, newPaidAmount, paymentStatus);
};

module.exports = {
  listTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  addPaymentRecord
};
