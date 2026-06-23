const Router = require('koa-router');
const supplierController = require('../controllers/supplierController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/suppliers'
});

router.get('/', auth(), supplierController.list);
router.post('/', auth(), supplierController.create);
router.get('/share/:token', supplierController.shareRecords);
router.get('/:id', auth(), supplierController.detail);
router.put('/:id', auth(), supplierController.update);
router.delete('/:id', auth(), supplierController.remove);

module.exports = router;
