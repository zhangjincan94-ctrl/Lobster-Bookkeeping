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
      statement.balanceDisplay = money(Math.abs(parseFloat(statement.periodBalance) || 0))
      statement.balanceLabel = parseFloat(statement.periodBalance) > 0 ? '期间待收' : (parseFloat(statement.periodBalance) < 0 ? '期间待付' : '期间已平')
      statement.bills = (statement.bills || []).map(function (bill) { bill.totalDisplay = money(bill.totalAmount); bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'; bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'; return bill })
      statement.payments = (statement.payments || []).map(function (payment) { payment.amountDisplay = money(payment.amount); return payment })
      that.setData({ statement: statement, loading: false })
    }).catch(function () { that.setData({ loading: false }) })
  },
  onShareAppMessage: function () {
    var name = this.data.statement && this.data.statement.customer ? this.data.statement.customer.name : '客户'
    return { title: name + '的结账信息', path: '/pages/share/statement/statement?token=' + this.data.token }
  }
})
