const { Merchant } = require('../models');
const { code2Session } = require('../utils/wx');
const jwt = require('jsonwebtoken');
const config = require('../config');

const wxLogin = async (code) => {
  const { openid } = await code2Session(code);

  let isNew = false;
  let merchant = await Merchant.findOne({ where: { openid } });

  if (!merchant) {
    merchant = await Merchant.create({ openid });
    isNew = true;
  }

  const token = jwt.sign(
    { id: merchant.id, openid: merchant.openid },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  return {
    token,
    merchant: {
      id: merchant.id,
      shop_name: merchant.shop_name,
      phone: merchant.phone,
      openid: merchant.openid
    },
    isNew
  };
};

module.exports = { wxLogin };
