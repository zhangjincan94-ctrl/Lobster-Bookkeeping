// 后端服务地址：
// - 开发者工具本机调试：保持 http://localhost:3000，并在工具里勾选「不校验合法域名」
// - 真机/体验版：改成内网 IP 或 HTTPS 公网域名，并在小程序后台配置 request 合法域名
var baseUrl = 'http://localhost:3000'

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
  otherCostAdd: '/api/other-costs'
}

module.exports = {
  baseUrl: baseUrl,
  api: api
}
