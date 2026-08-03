var { get } = require('../../../utils/request')
var config = require('../../../utils/config')

function money(value) { return '¥' + (parseFloat(value) || 0).toFixed(2) }

Page({
  data: { token: '', statement: null, loading: true },
  onLoad: function (options) {
    this.setData({ token: options.token || '' })
    this.loadStatement()
  },
  loadStatement: function () {
    if (!this.data.token) { this.setData({ loading: false }); return }
    var that = this
    get(config.api.ledgerStatementShare(this.data.token), {}).then(function (statement) {
      statement.salesDisplay = money(statement.salesAmount)
      statement.purchaseDisplay = money(statement.purchaseAmount)
      statement.receivedDisplay = money(statement.receivedAmount)
      statement.paidDisplay = money(statement.paidAmount)
      var hasSeparateBalances = statement.receivableAmount !== undefined && statement.payableAmount !== undefined
      var legacyBalance = parseFloat(statement.periodBalance) || 0
      statement.receivableAmount = hasSeparateBalances ? parseFloat(statement.receivableAmount) || 0 : Math.max(legacyBalance, 0)
      statement.payableAmount = hasSeparateBalances ? parseFloat(statement.payableAmount) || 0 : Math.max(-legacyBalance, 0)
      statement.receivableDisplay = money(statement.receivableAmount)
      statement.payableDisplay = money(statement.payableAmount)
      statement.bills = (statement.bills || []).map(function (bill) { bill.totalDisplay = money(bill.totalAmount); bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'; bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'; return bill })
      statement.payments = (statement.payments || []).map(function (payment) {
        payment.amountDisplay = money(payment.amount)
        payment.flowLabel = payment.flowType === 'paid' ? '供应商付款' : '客户回款'
        payment.flowClass = payment.flowType === 'paid' ? 'paid' : 'received'
        return payment
      })
      that.setData({ statement: statement, loading: false })
    }).catch(function (err) {
      console.warn('[结账信息加载失败]', {
        feature: '只读结账信息',
        reason: err && err.message ? err.message : '请求失败',
        tokenPrefix: String(that.data.token || '').slice(0, 8)
      })
      that.setData({ loading: false })
    })
  },
  onShareAppMessage: function () {
    var name = this.data.statement && this.data.statement.customer ? this.data.statement.customer.name : '客户'
    return { title: name + '的结账信息', path: '/pages/share/statement/statement?token=' + this.data.token }
  }
})
