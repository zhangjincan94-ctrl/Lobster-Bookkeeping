const serializeMerchant = (merchant) => {
  if (!merchant) return null;

  return {
    id: merchant.id,
    shop_name: merchant.shop_name,
    phone: merchant.phone,
    avatar: merchant.avatar || '',
    openid: merchant.openid,
    created_at: merchant.created_at
  };
};

module.exports = { serializeMerchant };
