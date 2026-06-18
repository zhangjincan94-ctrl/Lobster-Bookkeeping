const { error } = require('../utils/response');

module.exports = () => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const status = err.status || 500;
      const message = err.message || '服务器内部错误';

      ctx.status = status;
      ctx.body = error(message, status);

      if (status === 500) {
        console.error(`[服务器错误] ${new Date().toISOString()} - ${err.stack || err.message}`);
      }
    }
  };
};
