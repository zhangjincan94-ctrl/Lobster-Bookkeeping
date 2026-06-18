const Router = require('koa-router');
const transactionController = require('../controllers/transactionController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/transactions'
});

router.get('/', auth(), transactionController.list);
router.post('/', auth(), transactionController.create);
router.get('/:id', auth(), transactionController.detail);
router.put('/:id', auth(), transactionController.update);
router.post('/:id/payments', auth(), transactionController.addPayment);

module.exports = router;
