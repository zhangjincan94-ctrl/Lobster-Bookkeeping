const Router = require('koa-router');
const authRoutes = require('./auth');
const merchantRoutes = require('./merchant');
const buyerRoutes = require('./buyer');
const transactionRoutes = require('./transaction');
const supplierRoutes = require('./supplier');
const purchaseRoutes = require('./purchase');
const statsRoutes = require('./stats');
const router = new Router();

router.use(authRoutes.routes());
router.use(merchantRoutes.routes());
router.use(buyerRoutes.routes());
router.use(transactionRoutes.routes());
router.use(supplierRoutes.routes());
router.use(purchaseRoutes.routes());
router.use(statsRoutes.routes());

router.get('/', (ctx) => {
  ctx.body = {
    code: 0,
    message: '龙虾记账服务运行中',
    data: null
  };
});

module.exports = router;
