const { OtherCost } = require('../models');

const createOtherCost = async (merchantId, data) => {
  const amount = parseFloat(data.amount);
  if (!amount || amount <= 0) {
    const err = new Error('请输入正确的费用金额');
    err.status = 400;
    throw err;
  }

  const costType = data.cost_type || data.costType;
  if (!['labor', 'packaging'].includes(costType)) {
    const err = new Error('请选择费用类型');
    err.status = 400;
    throw err;
  }

  const cost = await OtherCost.create({
    merchant_id: merchantId,
    cost_type: costType,
    amount,
    cost_date: data.cost_date || data.costDate || new Date(),
    remark: data.remark || null
  });

  return cost;
};

module.exports = {
  createOtherCost
};
