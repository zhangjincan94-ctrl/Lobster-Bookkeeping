module.exports = {
  ...require('./merchantSerializer'),
  ...require('./buyerSerializer'),
  ...require('./transactionSerializer'),
  ...require('./supplierSerializer'),
  ...require('./purchaseSerializer')
};
