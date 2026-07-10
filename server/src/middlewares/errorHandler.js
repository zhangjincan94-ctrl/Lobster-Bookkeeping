const { error } = require('../utils/response');

module.exports = () => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const status = err.status || 500;
      const message = status >= 500 ? '服务器内部错误' : (err.message || '操作失败');
      const logContext = {
        feature: ctx._matchedRoute || ctx.path,
        reason: err.message || '未知错误',
        method: ctx.method,
        merchantId: ctx.state.merchant && ctx.state.merchant.id,
        recordId: ctx.params && ctx.params.id,
        ...err.context
      };

      ctx.status = status;
      ctx.body = error(message, status);
      ctx.state.requestErrorLogged = true;

      if (status === 500) {
        console.error('[请求失败]', logContext, err.stack || err.message);
      } else {
        console.warn('[请求失败]', logContext);
      }
    }
  };
};
