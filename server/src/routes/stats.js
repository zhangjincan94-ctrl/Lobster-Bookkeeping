const Router = require('koa-router');
const statsController = require('../controllers/statsController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/stats'
});

router.get('/dashboard', auth(), statsController.dashboard);
router.get('/overview', auth(), statsController.overview);
router.get('/trend', auth(), statsController.trend);
router.get('/debt-ranking', auth(), statsController.debtRanking);
router.get('/product-analysis', auth(), statsController.productAnalysis);

module.exports = router;
