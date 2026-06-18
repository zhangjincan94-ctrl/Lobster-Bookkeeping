const jwt = require('jsonwebtoken');
const config = require('../config');
const { error } = require('../utils/response');

module.exports = () => {
  return async (ctx, next) => {
    const authorization = ctx.header.authorization;
    if (!authorization) {
      ctx.status = 401;
      ctx.body = error('未登录，请先登录', 401);
      return;
    }

    const token = authorization.replace('Bearer ', '');
    if (!token) {
      ctx.status = 401;
      ctx.body = error('令牌无效，请重新登录', 401);
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      ctx.status = 401;
      ctx.body = error('登录已过期，请重新登录', 401);
      return;
    }

    ctx.state.merchant = {
      id: decoded.id,
      openid: decoded.openid
    };
    await next();
  };
};
