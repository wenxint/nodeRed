var express = require('express');
var router = express.Router();
const ResponseHelper = require('../common/response');

/* GET users listing. */
router.get('/', function(req, res, next) {
  ResponseHelper.success(res, { message: 'respond with a resource' });
});

module.exports = router;
