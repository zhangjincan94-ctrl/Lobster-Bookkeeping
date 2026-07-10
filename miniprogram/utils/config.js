var baseUrl = 'http://localhost:3000'

var lobsterSizes = [
  '小青(2-4钱)', '中青(4-6钱)', '大青(6-8钱)', '炮头青(>9钱)',
  '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红(>9钱)'
]

var api = {
  login: '/api/auth/login',
  merchantProfile: '/api/merchants/profile',
  transactionList: '/api/transactions',
  transactionAdd: '/api/transactions',
  transactionDetail: function (id) { return '/api/transactions/' + id },
  transactionUpdate: function (id) { return '/api/transactions/' + id },
  transactionPayment: function (id) { return '/api/transactions/' + id + '/payments' },
  buyerList: '/api/buyers',
  buyerAdd: '/api/buyers',
  buyerDetail: function (id) { return '/api/buyers/' + id },
  buyerUpdate: function (id) { return '/api/buyers/' + id },
  shareRecords: function (token) { return '/api/buyers/' + token + '/records' },
  supplierList: '/api/suppliers',
  supplierAdd: '/api/suppliers',
  supplierDetail: function (id) { return '/api/suppliers/' + id },
  supplierUpdate: function (id) { return '/api/suppliers/' + id },
  purchaseList: '/api/purchases',
  purchaseAvailable: '/api/purchases/available',
  purchaseAdd: '/api/purchases',
  purchaseDetail: function (id) { return '/api/purchases/' + id },
  purchaseUpdate: function (id) { return '/api/purchases/' + id },
  purchasePayment: function (id) { return '/api/purchases/' + id + '/payments' },
  statsOverview: '/api/stats/overview',
  statsTrend: '/api/stats/trend',
  statsDebtRanking: '/api/stats/debt-ranking',
  statsProductAnalysis: '/api/stats/product-analysis'
}

module.exports = {
  baseUrl: baseUrl,
  lobsterSizes: lobsterSizes,
  api: api
}
