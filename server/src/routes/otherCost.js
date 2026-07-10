const Router = require('koa-router');
const otherCostController = require('../controllers/otherCostController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/other-costs'
});

router.post('/', auth(), otherCostController.create);

module.exports = router;
