const Router = require('koa-router');
const authController = require('../controllers/authController');

const router = new Router({
  prefix: '/api/auth'
});

router.post('/login', authController.login);

module.exports = router;
