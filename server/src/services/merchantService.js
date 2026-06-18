const { Merchant } = require('../models');
const { serializeMerchant } = require('../serializers');

const getProfile = async (merchantId) => {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) return null;

  return serializeMerchant(merchant);
};

const updateProfile = async (merchantId, data) => {
  const merchant = await Merchant.findByPk(merchantId);
  if (!merchant) return null;

  const updateFields = {};
  if (data.shop_name !== undefined) updateFields.shop_name = data.shop_name;
  if (data.phone !== undefined) updateFields.phone = data.phone;

  await merchant.update(updateFields);

  return serializeMerchant(merchant);
};

module.exports = { getProfile, updateProfile };
