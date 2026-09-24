const Router = require('koa-router');
const ledgerController = require('../controllers/ledgerController');
const auth = require('../middlewares/auth');

const router = new Router({ prefix: '/api/ledger' });

router.get('/share/:token', ledgerController.publicStatement);
router.get('/stats/trade', auth(), ledgerController.tradeStats);

router.get('/customers', auth(), ledgerController.listCustomers);
router.post('/customers', auth(), ledgerController.createCustomer);
router.put('/customers/:id', auth(), ledgerController.updateCustomer);
router.delete('/customers/:id', auth(), ledgerController.archiveCustomer);
router.get('/customers/:id/ledger', auth(), ledgerController.customerLedger);

router.get('/categories', auth(), ledgerController.listCategories);
router.post('/categories', auth(), ledgerController.createCategory);
router.delete('/categories/:id', auth(), ledgerController.removeCategory);

router.get('/products', auth(), ledgerController.listProducts);
router.post('/products', auth(), ledgerController.createProduct);
router.put('/products/:id', auth(), ledgerController.updateProduct);
router.delete('/products/:id', auth(), ledgerController.archiveProduct);

router.get('/bills', auth(), ledgerController.listBills);
router.post('/bills', auth(), ledgerController.createBill);
router.put('/bills/:id', auth(), ledgerController.updateBill);
router.get('/bills/:id', auth(), ledgerController.billDetail);
router.delete('/bills/:id', auth(), ledgerController.removeBill);

router.post('/payments', auth(), ledgerController.createPayment);
router.post('/statements', auth(), ledgerController.createStatement);

module.exports = router;
