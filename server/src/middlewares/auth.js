const jwt = require('jsonwebtoken');
const config = require('../config');
const { error } = require('../utils/response');

module.exports = () => {
  return async (ctx, next) => {
    const authorization = String(ctx.header.authorization || '').trim();
    if (!authorization) {
      ctx.status = 401;
      ctx.body = error('未登录，请先登录', 401);
      return;
    }

    // 只接受规范的 Bearer 前缀，避免任意前缀被当作令牌。
    const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      ctx.status = 401;
      ctx.body = error('令牌格式无效，请使用 Bearer 令牌', 401);
      return;
    }

    const token = bearerMatch[1].trim();
    if (!token) {
      ctx.status = 401;
      ctx.body = error('令牌无效，请重新登录', 401);
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
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
