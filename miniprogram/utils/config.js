// 后端服务地址：
// - 开发者工具本机调试：保持 http://localhost:3000，并在工具里勾选「不校验合法域名」
// - 真机/体验版：改成内网 IP 或 HTTPS 公网域名，并在小程序后台配置 request 合法域名
var baseUrl = 'https://lobster-bookkeeping-test.onrender.com'

var lobsterSizes = [
  '小青(2-4钱)', '中青(4-6钱)', '大青(6-8钱)', '炮头青(>9钱)',
  '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红(>9钱)', '统货'
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
  buyerDelete: function (id) { return '/api/buyers/' + id },
  shareRecords: function (token) { return '/api/buyers/' + token + '/records' },
  supplierList: '/api/suppliers',
  supplierAdd: '/api/suppliers',
  supplierDetail: function (id) { return '/api/suppliers/' + id },
  supplierUpdate: function (id) { return '/api/suppliers/' + id },
  supplierDelete: function (id) { return '/api/suppliers/' + id },
  supplierShareRecords: function (token) { return '/api/suppliers/share/' + token },
  purchaseList: '/api/purchases',
  purchaseAvailable: '/api/purchases/available',
  purchaseAdd: '/api/purchases',
  purchaseDetail: function (id) { return '/api/purchases/' + id },
  purchaseUpdate: function (id) { return '/api/purchases/' + id },
  purchasePayment: function (id) { return '/api/purchases/' + id + '/payments' },
  purchaseShareRecord: function (token) { return '/api/purchases/share/' + token },
  statsOverview: '/api/stats/overview',
  statsTrend: '/api/stats/trend',
  statsDebtRanking: '/api/stats/debt-ranking',
  statsProductAnalysis: '/api/stats/product-analysis',
  statsDashboard: '/api/stats/dashboard',
  otherCostAdd: '/api/other-costs',
  ledgerCustomerList: '/api/ledger/customers',
  ledgerCustomerAdd: '/api/ledger/customers',
  ledgerCustomerUpdate: function (id) { return '/api/ledger/customers/' + id },
  ledgerCustomerDelete: function (id) { return '/api/ledger/customers/' + id },
  ledgerCustomerBook: function (id) { return '/api/ledger/customers/' + id + '/ledger' },
  ledgerCategoryList: '/api/ledger/categories',
  ledgerCategoryAdd: '/api/ledger/categories',
  ledgerCategoryDelete: function (id) { return '/api/ledger/categories/' + id },
  ledgerProductList: '/api/ledger/products',
  ledgerProductAdd: '/api/ledger/products',
  ledgerProductUpdate: function (id) { return '/api/ledger/products/' + id },
  ledgerProductDelete: function (id) { return '/api/ledger/products/' + id },
  ledgerBillList: '/api/ledger/bills',
  ledgerBillAdd: '/api/ledger/bills',
  ledgerBillDetail: function (id) { return '/api/ledger/bills/' + id },
  ledgerBillDelete: function (id) { return '/api/ledger/bills/' + id },
  ledgerPaymentAdd: '/api/ledger/payments',
  ledgerStatementAdd: '/api/ledger/statements',
  ledgerStatementShare: function (token) { return '/api/ledger/share/' + token }
}

module.exports = {
  baseUrl: baseUrl,
  lobsterSizes: lobsterSizes,
  api: api
}
