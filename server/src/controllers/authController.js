const authService = require('../services/authService');
const { success, error } = require('../utils/response');

const login = async (ctx) => {
  const { code } = ctx.request.body;

  if (!code) {
    ctx.status = 400;
    ctx.body = error('code不能为空', 400);
    return;
  }

  const result = await authService.wxLogin(code);
  ctx.body = success(result);
};

module.exports = { login };
