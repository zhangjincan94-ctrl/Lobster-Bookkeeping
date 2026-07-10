const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const dotenv = require('dotenv');
const errorHandler = require('./middlewares/errorHandler');
const config = require('./config');

dotenv.config();

const app = new Koa();

app.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    const feature = ctx._matchedRoute || ctx.path;
    if (ctx.status >= 400) {
      if (!ctx.state.requestErrorLogged) {
        console.warn('[请求失败]', {
          feature,
          reason: ctx.body && ctx.body.message,
          method: ctx.method,
          status: ctx.status,
          merchantId: ctx.state.merchant && ctx.state.merchant.id,
          recordId: ctx.params && ctx.params.id,
          durationMs: ms
        });
      }
    } else {
      console.log(`${ctx.method} ${feature} ${ctx.status} ${ms}ms`);
    }
  }
});

app.use(errorHandler());

if (config.corsOrigin) {
  app.use(cors({ origin: config.corsOrigin }));
}

app.use(bodyParser());

const router = require('./routes');
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = config.port || 3000;

if (!config.jwt.secret || config.jwt.secret === 'change_me') {
  throw new Error('JWT_SECRET 未配置或仍为示例值，服务拒绝启动');
}

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;
