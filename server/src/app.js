const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const dotenv = require('dotenv');
const errorHandler = require('./middlewares/errorHandler');
const config = require('./config');

dotenv.config();

const app = new Koa();

app.use(cors());

app.use(bodyParser());

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} ${ctx.status} ${ms}ms`);
});

app.use(errorHandler());

const router = require('./routes');
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = config.port || 3000;

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;
