const { v4: uuidv4 } = require('uuid');
const { Buyer, Transaction, sequelize, Sequelize } = require('../models');
const { serializeBuyer, serializePublicBuyer } = require('../serializers');
const { Op } = Sequelize;

const listBuyers = async (merchantId, { keyword, page = 1, pageSize = 10 }) => {
  const where = { merchant_id: merchantId };
  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { phone: { [Op.like]: `%${keyword}%` } }
    ];
  }

  const offset = (page - 1) * pageSize;
  const { count, rows } = await Buyer.findAndCountAll({
    where,
    limit: pageSize,
    offset,
    order: [['id', 'DESC']]
  });

  const buyers = [];
  for (const buyer of rows) {
    const stats = await _computeBuyerStats(buyer.id);
    buyers.push(serializeBuyer(buyer, { stats }));
  }

  return { list: buyers, total: count };
};

const createBuyer = async (merchantId, data) => {
  const buyer = await Buyer.create({
    merchant_id: merchantId,
    name: data.name,
    phone: data.phone || null,
    share_token: uuidv4()
  });

  return serializeBuyer(buyer);
};

const updateBuyer = async (merchantId, buyerId, data) => {
  const buyer = await Buyer.findOne({
    where: { id: buyerId, merchant_id: merchantId }
  });
  if (!buyer) return null;

  const updateFields = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.phone !== undefined) updateFields.phone = data.phone;

  await buyer.update(updateFields);

  return serializeBuyer(buyer);
};

const getBuyerDetail = async (merchantId, buyerId) => {
  const buyer = await Buyer.findOne({
    where: { id: buyerId, merchant_id: merchantId }
  });
  if (!buyer) return null;

  const stats = await _computeBuyerStats(buyer.id);

  return serializeBuyer(buyer, { stats, includeTransactionCount: true });
};

const getBuyerByShareToken = async (shareToken) => {
  const buyer = await Buyer.findOne({
    where: { share_token: shareToken }
  });
  if (!buyer) return null;

  const transactions = await Transaction.findAll({
    where: { buyer_id: buyer.id, order_status: { [Op.ne]: 1 } },
    attributes: [
      'id', 'lobster_size', 'weight', 'unit_price',
      'total_amount', 'payment_status', 'paid_amount',
      'delivery_status', 'order_status', 'transaction_time'
    ],
    order: [['transaction_time', 'DESC']]
  });

  const stats = await _computeBuyerStats(buyer.id);

  return {
    buyer: serializePublicBuyer(buyer),
    transactions,
    total_spent: stats.total_spent,
    total_debt: stats.total_debt
  };
};

const _computeBuyerStats = async (buyerId) => {
  const result = await Transaction.findOne({
    where: { buyer_id: buyerId, order_status: { [Op.ne]: 1 } },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_spent'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('CASE WHEN payment_status != 1 THEN total_amount - paid_amount ELSE 0 END')), 0), 'total_debt'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count']
    ],
    raw: true
  });

  return {
    total_spent: parseFloat(result.total_spent) || 0,
    total_debt: parseFloat(result.total_debt) || 0,
    transaction_count: parseInt(result.transaction_count, 10) || 0
  };
};

module.exports = {
  listBuyers,
  createBuyer,
  updateBuyer,
  getBuyerDetail,
  getBuyerByShareToken
};
