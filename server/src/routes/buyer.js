const Router = require('koa-router');
const buyerController = require('../controllers/buyerController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/buyers'
});

router.get('/', auth(), buyerController.list);
router.post('/', auth(), buyerController.create);
router.put('/:id', auth(), buyerController.update);
router.get('/:id', auth(), buyerController.detail);
router.get('/:token/records', buyerController.shareRecords);

module.exports = router;
