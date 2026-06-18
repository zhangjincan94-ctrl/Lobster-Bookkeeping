const Router = require('koa-router');
const merchantController = require('../controllers/merchantController');
const auth = require('../middlewares/auth');

const router = new Router({
  prefix: '/api/merchants'
});

router.get('/profile', auth(), merchantController.getProfile);
router.put('/profile', auth(), merchantController.updateProfile);

module.exports = router;
