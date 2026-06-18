const { Transaction, Buyer, sequelize, Sequelize } = require('../models');
const { Op } = Sequelize;

// 工具：把日期字符串转 Date 对象，end_date 视为当天结束
function buildDateRange(start, end) {
  const range = {};
  if (start) range.start = new Date(start + ' 00:00:00');
  if (end) range.end = new Date(end + ' 23:59:59');
  return range;
}

// 收支概览：返回总单数、总收入、已收、未收
const getOverview = async (merchantId, { start_date, end_date } = {}) => {
  const where = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 } // 排除已取消
  };
  const range = buildDateRange(start_date, end_date);
  if (range.start || range.end) {
    where.transaction_time = {};
    if (range.start) where.transaction_time[Op.gte] = range.start;
    if (range.end) where.transaction_time[Op.lte] = range.end;
  }

  const result = await Transaction.findOne({
    where,
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('paid_amount')), 0), 'paid_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_amount - paid_amount')), 0), 'unpaid_amount']
    ],
    raw: true
  });

  return {
    order_count: parseInt(result.order_count, 10) || 0,
    total_amount: parseFloat(result.total_amount) || 0,
    paid_amount: parseFloat(result.paid_amount) || 0,
    unpaid_amount: parseFloat(result.unpaid_amount) || 0
  };
};

// 趋势：按 day / week / month 分组返回时间序列
const getTrend = async (merchantId, { dimension = 'day', start_date, end_date } = {}) => {
  let formatExpr;
  switch (dimension) {
    case 'month':
      formatExpr = "DATE_FORMAT(transaction_time, '%Y-%m')";
      break;
    case 'week':
      // ISO 周
      formatExpr = "DATE_FORMAT(transaction_time, '%x-W%v')";
      break;
    case 'day':
    default:
      formatExpr = "DATE_FORMAT(transaction_time, '%Y-%m-%d')";
      break;
  }

  const where = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 }
  };
  const range = buildDateRange(start_date, end_date);
  if (range.start || range.end) {
    where.transaction_time = {};
    if (range.start) where.transaction_time[Op.gte] = range.start;
    if (range.end) where.transaction_time[Op.lte] = range.end;
  }

  const rows = await Transaction.findAll({
    where,
    attributes: [
      [sequelize.literal(formatExpr), 'period'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('paid_amount')), 0), 'paid_amount']
    ],
    group: [sequelize.literal('period')],
    order: [[sequelize.literal('period'), 'ASC']],
    raw: true
  });

  return rows.map(r => ({
    period: r.period,
    order_count: parseInt(r.order_count, 10) || 0,
    total_amount: parseFloat(r.total_amount) || 0,
    paid_amount: parseFloat(r.paid_amount) || 0,
    unpaid_amount: (parseFloat(r.total_amount) || 0) - (parseFloat(r.paid_amount) || 0)
  }));
};

// 欠款排行：按买家欠款倒序
const getDebtRanking = async (merchantId, { limit = 20 } = {}) => {
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const rows = await Transaction.findAll({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 },
      payment_status: { [Op.ne]: 1 } // 排除已结清
    },
    attributes: [
      'buyer_id',
      [sequelize.fn('COUNT', sequelize.col('transactions.id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('paid_amount')), 0), 'paid_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_amount - paid_amount')), 0), 'debt_amount'],
      [sequelize.fn('MAX', sequelize.col('transaction_time')), 'last_transaction_time']
    ],
    include: [{
      model: Buyer,
      attributes: ['id', 'name', 'phone', 'share_token']
    }],
    group: ['buyer_id', 'Buyer.id'],
    having: sequelize.literal('debt_amount > 0'),
    order: [[sequelize.literal('debt_amount'), 'DESC']],
    limit: limitNum,
    raw: true,
    nest: true
  });

  return rows.map(r => ({
    buyer_id: r.buyer_id,
    buyer_name: r.Buyer ? r.Buyer.name : '未知买家',
    buyer_phone: r.Buyer ? r.Buyer.phone : '',
    share_token: r.Buyer ? r.Buyer.share_token : '',
    order_count: parseInt(r.order_count, 10) || 0,
    total_amount: parseFloat(r.total_amount) || 0,
    paid_amount: parseFloat(r.paid_amount) || 0,
    debt_amount: parseFloat(r.debt_amount) || 0,
    last_transaction_time: r.last_transaction_time
  }));
};

// 品种分析：按 lobster_size 聚合销量与收入
const getProductAnalysis = async (merchantId, { start_date, end_date } = {}) => {
  const where = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 }
  };
  const range = buildDateRange(start_date, end_date);
  if (range.start || range.end) {
    where.transaction_time = {};
    if (range.start) where.transaction_time[Op.gte] = range.start;
    if (range.end) where.transaction_time[Op.lte] = range.end;
  }

  const rows = await Transaction.findAll({
    where,
    attributes: [
      'lobster_size',
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('weight')), 0), 'total_weight'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount']
    ],
    group: ['lobster_size'],
    order: [[sequelize.literal('total_amount'), 'DESC']],
    raw: true
  });

  const totalAmount = rows.reduce((acc, r) => acc + (parseFloat(r.total_amount) || 0), 0);

  return rows.map(r => {
    const amount = parseFloat(r.total_amount) || 0;
    return {
      lobster_size: r.lobster_size || '未指定',
      order_count: parseInt(r.order_count, 10) || 0,
      total_weight: parseFloat(r.total_weight) || 0,
      total_amount: amount,
      ratio: totalAmount > 0 ? Number((amount / totalAmount).toFixed(4)) : 0
    };
  });
};

module.exports = {
  getOverview,
  getTrend,
  getDebtRanking,
  getProductAnalysis
};
