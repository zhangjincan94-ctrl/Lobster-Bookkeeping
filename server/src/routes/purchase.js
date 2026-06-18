const Router = require('koa-router');
const purchaseController = require('../controllers/purchaseController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/purchases'
});

router.get('/', auth(), purchaseController.list);
router.get('/available', auth(), purchaseController.available);
router.post('/', auth(), purchaseController.create);
router.get('/:id', auth(), purchaseController.detail);
router.put('/:id', auth(), purchaseController.update);
router.post('/:id/payments', auth(), purchaseController.addPayment);

module.exports = router;
