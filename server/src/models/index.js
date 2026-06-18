const Sequelize = require('sequelize');
const sequelize = require('../config/database');
const Merchant = require('./merchant');
const Buyer = require('./buyer');
const Transaction = require('./transaction');
const PaymentRecord = require('./payment_record');
const Supplier = require('./supplier');
const PurchaseRecord = require('./purchase_record');
const SupplierPaymentRecord = require('./supplier_payment_record');
const TransactionPurchaseAllocation = require('./transaction_purchase_allocation');

const models = {
  Merchant,
  Buyer,
  Transaction,
  PaymentRecord,
  Supplier,
  PurchaseRecord,
  SupplierPaymentRecord,
  TransactionPurchaseAllocation
};

Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  Merchant,
  Buyer,
  Transaction,
  PaymentRecord,
  Supplier,
  PurchaseRecord,
  SupplierPaymentRecord,
  TransactionPurchaseAllocation
};
