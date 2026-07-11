var { get, post } = require('../../../utils/request')
var config = require('../../../utils/config')

function today() {
  var d = new Date(); var m = d.getMonth() + 1; var day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}
function monthStart() {
  var d = new Date(); var m = d.getMonth() + 1
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-01'
}
function money(value) { return '¥' + (parseFloat(value) || 0).toFixed(2) }

Page({
  data: { id: '', book: null, loading: true, showPayment: false, paymentAmount: '', paymentDate: '', paymentRemark: '', savingPayment: false, statementStart: '', statementEnd: '', creatingStatement: false },
  onLoad: function (options) { this.setData({ id: options.id || '', paymentDate: today(), statementStart: monthStart(), statementEnd: today() }); this.loadBook() },
  loadBook: function () {
    var that = this
    get(config.api.ledgerCustomerBook(this.data.id), {}).then(function (book) {
      var customer = book.customer || {}
      var balance = parseFloat(customer.balance) || 0
      customer.balanceDisplay = money(Math.abs(balance))
      customer.balanceLabel = balance > 0 ? '当前待收' : (balance < 0 ? '当前待付' : '当前已平')
      customer.balanceClass = balance > 0 ? 'receivable' : (balance < 0 ? 'payable' : 'settled')
      customer.salesDisplay = money(customer.salesAmount)
      customer.purchaseDisplay = money(customer.purchaseAmount)
      customer.receivedDisplay = money(customer.receivedAmount)
      book.bills = (book.bills || []).map(function (bill) { bill.totalDisplay = money(bill.totalAmount); bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'; bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'; return bill })
      book.payments = (book.payments || []).map(function (payment) { payment.amountDisplay = money(payment.amount); return payment })
      that.setData({ book: book, loading: false })
    }).catch(function () { that.setData({ loading: false }) })
  },
  openPayment: function () {
    if (!this.data.book || parseFloat(this.data.book.customer.balance) <= 0) { wx.showToast({ title: '当前没有待收余额', icon: 'none' }); return }
    this.setData({ showPayment: true, paymentAmount: '', paymentDate: today(), paymentRemark: '' })
  },
  closePayment: function () { if (!this.data.savingPayment) this.setData({ showPayment: false }) },
  onPaymentAmount: function (e) { this.setData({ paymentAmount: e.detail.value }) },
  onPaymentDate: function (e) { this.setData({ paymentDate: e.detail.value }) },
  onPaymentRemark: function (e) { this.setData({ paymentRemark: e.detail.value }) },
  savePayment: function () {
    var amount = parseFloat(this.data.paymentAmount)
    if (!amount || amount <= 0 || this.data.savingPayment) { wx.showToast({ title: '请输入正确回款金额', icon: 'none' }); return }
    var that = this
    this.setData({ savingPayment: true })
    post(config.api.ledgerPaymentAdd, { customerId: this.data.id, amount: amount, paymentDate: this.data.paymentDate, remark: this.data.paymentRemark.trim() }).then(function (result) {
      wx.showModal({ title: '回款已记录', content: '回款前 ' + money(result.balanceBefore) + '\n回款后 ' + money(result.balanceAfter), showCancel: false })
      that.setData({ showPayment: false, savingPayment: false })
      that.loadBook()
    }).catch(function () { that.setData({ savingPayment: false }) })
  },
  onStatementStart: function (e) { this.setData({ statementStart: e.detail.value }) },
  onStatementEnd: function (e) { this.setData({ statementEnd: e.detail.value }) },
  createStatement: function () {
    if (this.data.creatingStatement) return
    if (!this.data.statementStart || !this.data.statementEnd || this.data.statementStart > this.data.statementEnd) {
      wx.showToast({ title: '请选择正确的日期范围', icon: 'none' })
      return
    }
    var that = this
    this.setData({ creatingStatement: true })
    post(config.api.ledgerStatementAdd, {
      customerId: this.data.id,
      startDate: this.data.statementStart,
      endDate: this.data.statementEnd
    }).then(function (result) {
      that.setData({ creatingStatement: false })
      wx.navigateTo({ url: '/pages/share/statement/statement?token=' + result.shareToken })
    }).catch(function () { that.setData({ creatingStatement: false }) })
  },
  goBill: function (e) { wx.navigateTo({ url: '/pages/book/detail/detail?id=' + e.currentTarget.dataset.id }) },
  noop: function () {}
})
