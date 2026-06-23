const { Transaction, Buyer, Supplier, PurchaseRecord, TransactionPurchaseAllocation, OtherCost, sequelize, Sequelize } = require('../models');
const { Op } = Sequelize;

// 工具：把日期字符串转 Date 对象，end_date 视为当天结束
function buildDateRange(start, end) {
  const range = {};
  if (start) range.start = new Date(start + ' 00:00:00');
  if (end) range.end = new Date(end + ' 23:59:59');
  return range;
}

// 收支概览：返回销售、进货成本、其他成本和净利润
const getOverview = async (merchantId, { start_date, end_date } = {}) => {
  const range = buildDateRange(start_date, end_date);
  const transactionWhere = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 }
  };
  if (range.start || range.end) {
    transactionWhere.transaction_time = {};
    if (range.start) transactionWhere.transaction_time[Op.gte] = range.start;
    if (range.end) transactionWhere.transaction_time[Op.lte] = range.end;
  }

  const purchaseWhere = {
    merchant_id: merchantId,
    order_status: { [Op.ne]: 1 }
  };
  if (range.start || range.end) {
    purchaseWhere.received_at = {};
    if (range.start) purchaseWhere.received_at[Op.gte] = range.start;
    if (range.end) purchaseWhere.received_at[Op.lte] = range.end;
  }

  const otherCostWhere = { merchant_id: merchantId };
  if (range.start || range.end) {
    otherCostWhere.cost_date = {};
    if (range.start) otherCostWhere.cost_date[Op.gte] = range.start;
    if (range.end) otherCostWhere.cost_date[Op.lte] = range.end;
  }

  const result = await Transaction.findOne({
    where: transactionWhere,
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('paid_amount')), 0), 'paid_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_amount - paid_amount')), 0), 'unpaid_amount']
    ],
    raw: true
  });

  const purchaseAgg = await PurchaseRecord.findOne({
    where: purchaseWhere,
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost')), 0), 'amount']],
    raw: true
  });

  const otherCostAgg = await OtherCost.findOne({
    where: otherCostWhere,
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'amount']],
    raw: true
  });

  const totalAmount = parseFloat(result.total_amount) || 0;
  const purchaseCost = parseFloat(purchaseAgg.amount) || 0;
  const otherCost = parseFloat(otherCostAgg.amount) || 0;

  return {
    order_count: parseInt(result.order_count, 10) || 0,
    total_amount: totalAmount,
    paid_amount: parseFloat(result.paid_amount) || 0,
    unpaid_amount: parseFloat(result.unpaid_amount) || 0,
    purchase_cost: purchaseCost,
    other_cost: otherCost,
    net_profit: totalAmount - purchaseCost - otherCost
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
    group: ['buyer_id'],
    having: sequelize.literal('debt_amount > 0'),
    order: [[sequelize.literal('debt_amount'), 'DESC']],
    limit: limitNum,
    raw: true
  });

  const buyerIds = rows.map(r => r.buyer_id).filter(Boolean);
  const buyers = await Buyer.findAll({
    where: {
      id: { [Op.in]: buyerIds },
      merchant_id: merchantId
    },
    attributes: ['id', 'name', 'phone', 'share_token'],
    raw: true
  });
  const buyerMap = buyers.reduce((map, buyer) => {
    map[buyer.id] = buyer;
    return map;
  }, {});

  return rows.map(r => {
    const buyer = buyerMap[r.buyer_id] || {};
    return {
      buyer_id: r.buyer_id,
      buyer_name: buyer.name || '未知买家',
      buyer_phone: buyer.phone || '',
      share_token: buyer.share_token || '',
      order_count: parseInt(r.order_count, 10) || 0,
      total_amount: parseFloat(r.total_amount) || 0,
      paid_amount: parseFloat(r.paid_amount) || 0,
      debt_amount: parseFloat(r.debt_amount) || 0,
      last_transaction_time: r.last_transaction_time
    };
  });
};

// 品种分析：按 lobster_size 聚合销量、成本和纯收入
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

  const transactions = await Transaction.findAll({
    where,
    attributes: ['id', 'lobster_size', 'weight', 'total_amount'],
    include: [{
      model: TransactionPurchaseAllocation,
      as: 'PurchaseAllocations',
      attributes: ['weight', 'total_cost']
    }],
    order: [['transaction_time', 'DESC']]
  });

  const map = {};
  transactions.forEach(t => {
    const size = t.lobster_size || '未指定';
    if (!map[size]) {
      map[size] = {
        lobster_size: size,
        order_count: 0,
        total_weight: 0,
        total_amount: 0,
        total_cost: 0,
        allocated_weight: 0
      };
    }

    const item = map[size];
    item.order_count += 1;
    item.total_weight += parseFloat(t.weight) || 0;
    item.total_amount += parseFloat(t.total_amount) || 0;

    const allocations = t.PurchaseAllocations || [];
    allocations.forEach(allocation => {
      item.total_cost += parseFloat(allocation.total_cost) || 0;
      item.allocated_weight += parseFloat(allocation.weight) || 0;
    });
  });

  const rows = Object.keys(map).map(size => {
    const item = map[size];
    const profit = item.total_amount - item.total_cost;
    return {
      lobster_size: item.lobster_size,
      order_count: item.order_count,
      total_weight: Number(item.total_weight.toFixed(2)),
      total_amount: Number(item.total_amount.toFixed(2)),
      total_cost: Number(item.total_cost.toFixed(2)),
      profit_amount: Number(profit.toFixed(2)),
      cost_status: item.allocated_weight + 0.0001 >= item.total_weight ? 'calculated' : 'missing'
    };
  });

  const totalProfit = rows.reduce((acc, r) => acc + r.profit_amount, 0);
  return rows.map(r => ({
    ...r,
    profit_ratio: totalProfit > 0 ? Number((r.profit_amount / totalProfit).toFixed(4)) : 0
  })).sort((a, b) => b.profit_amount - a.profit_amount);
};

// 首页仪表盘：今日 4 格数据 + 最近 5 笔销售 + 最近 5 笔进货
const getDashboard = async (merchantId) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // 今日销售汇总
  const salesAgg = await Transaction.findOne({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 },
      transaction_time: { [Op.between]: [todayStart, todayEnd] }
    },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('paid_amount')), 0), 'paid_amount'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_amount - paid_amount')), 0), 'unpaid_amount']
    ],
    raw: true
  });

  // 今日进货汇总
  const purchaseAgg = await PurchaseRecord.findOne({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 },
      received_at: { [Op.between]: [todayStart, todayEnd] }
    },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_cost')), 0), 'total_cost'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('net_weight')), 0), 'total_weight']
    ],
    raw: true
  });

  const otherCostAgg = await OtherCost.findOne({
    where: {
      merchant_id: merchantId,
      cost_date: { [Op.between]: [todayStart, todayEnd] }
    },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'amount']
    ],
    raw: true
  });

  const salesAmount = parseFloat(salesAgg.total_amount) || 0;
  const purchaseCost = parseFloat(purchaseAgg.total_cost) || 0;
  const otherCost = parseFloat(otherCostAgg.amount) || 0;

  const receivableAgg = await Transaction.findOne({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 }
    },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_amount - paid_amount')), 0), 'amount']
    ],
    raw: true
  });

  const payableAgg = await PurchaseRecord.findOne({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 }
    },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('total_cost - paid_amount')), 0), 'amount']
    ],
    raw: true
  });

  const stockAgg = await PurchaseRecord.findOne({
    where: {
      merchant_id: merchantId,
      order_status: { [Op.ne]: 1 },
      remaining_weight: { [Op.gt]: 0 }
    },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('remaining_weight')), 0), 'weight'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    raw: true
  });

  return {
    today: {
      sales_count: parseInt(salesAgg.order_count, 10) || 0,
      sales_amount: salesAmount,
      sales_paid: parseFloat(salesAgg.paid_amount) || 0,
      sales_unpaid: parseFloat(salesAgg.unpaid_amount) || 0,
      purchase_count: parseInt(purchaseAgg.order_count, 10) || 0,
      purchase_cost: purchaseCost,
      purchase_weight: parseFloat(purchaseAgg.total_weight) || 0,
      other_cost: otherCost,
      net_income: salesAmount - purchaseCost - otherCost
    },
    reminders: {
      receivable_amount: parseFloat(receivableAgg.amount) || 0,
      payable_amount: parseFloat(payableAgg.amount) || 0,
      stock_weight: parseFloat(stockAgg.weight) || 0,
      stock_count: parseInt(stockAgg.count, 10) || 0
    }
  };
};

module.exports = {
  getOverview,
  getTrend,
  getDebtRanking,
  getProductAnalysis,
  getDashboard
};
