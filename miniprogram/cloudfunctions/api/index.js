const { handle } = require('./dispatcher');

exports.main = async function (event) {
  return handle(event);
};
