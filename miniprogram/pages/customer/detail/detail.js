var { get, post, put, del } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

function today() {
  var d = new Date(); var m = d.getMonth() + 1; var day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}
function monthStart() {
  var d = new Date(); var m = d.getMonth() + 1
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-01'
}
Page({
  data: { theme: '', id: '', book: null, loading: true, hasLoaded: false, error: '', showPayment: false, paymentFlowType: 'received', paymentAmount: '', paymentDate: '', paymentRemark: '', savingPayment: false, statementStart: '', statementEnd: '', creatingStatement: false, deletingCustomer: false, showEditCustomer: false, editCustomerName: '', editPhone: '', savingEditCustomer: false },
  onShow: function () { this.setData({ theme: theme.get() }) },
  onLoad: function (options) { this.setData({ id: options.id || '', paymentDate: today(), statementStart: monthStart(), statementEnd: today() }); this.loadBook() },
  loadBook: function () {
    var that = this
    get(config.api.ledgerCustomerBook(this.data.id), {}, { silent: true }).then(function (book) {
      var customer = book.customer || {}
      var hasSeparateBalances = customer.receivableBalance !== undefined && customer.payableBalance !== undefined
      var legacyBalance = parseFloat(customer.balance) || 0
      customer.receivableBalance = hasSeparateBalances ? parseFloat(customer.receivableBalance) || 0 : Math.max(legacyBalance, 0)
      customer.payableBalance = hasSeparateBalances ? parseFloat(customer.payableBalance) || 0 : Math.max(-legacyBalance, 0)
      customer.receivableDisplay = formatPrice(customer.receivableBalance)
      customer.payableDisplay = formatPrice(customer.payableBalance)
      customer.salesDisplay = formatPrice(customer.salesAmount)
      customer.purchaseDisplay = formatPrice(customer.purchaseAmount)
      customer.receivedDisplay = formatPrice(customer.receivedAmount)
      customer.paidDisplay = formatPrice(customer.paidAmount)
      book.bills = (book.bills || []).map(function (bill) { bill.totalDisplay = formatPrice(bill.totalAmount); bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'; bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'; return bill })
      book.payments = (book.payments || []).map(function (payment) {
        payment.amountDisplay = formatPrice(payment.amount)
        payment.flowLabel = payment.flowType === 'paid' ? '供应商付款' : '客户回款'
        payment.flowClass = payment.flowType === 'paid' ? 'paid' : 'received'
        return payment
      })
      that.setData({ book: book, loading: false, hasLoaded: true, error: '' })
    }).catch(function (err) {
      console.warn('[往来账本加载失败]', {
        feature: '往来账本',
        reason: err && err.message ? err.message : '请求失败',
        customerId: that.data.id
      })
      var hasLoaded = that.data.hasLoaded || Boolean(that.data.book)
      that.setData({
        loading: false,
        error: hasLoaded ? '刷新失败，正在显示上次数据' : '加载失败，请检查网络后重试'
      })
    })
  },
  retry: function () {
    return this.loadBook()
  },
  openEditCustomer: function () {
    var customer = this.data.book && this.data.book.customer
    if (!customer) return
    this.setData({
      showEditCustomer: true,
      editCustomerName: customer.name,
      editPhone: customer.phone || '',
      savingEditCustomer: false
    })
  },
  closeEditCustomer: function () { if (!this.data.savingEditCustomer) this.setData({ showEditCustomer: false }) },
  onEditNameInput: function (e) { this.setData({ editCustomerName: e.detail.value }) },
  onEditPhoneInput: function (e) { this.setData({ editPhone: e.detail.value }) },
  saveCustomer: function () {
    var name = this.data.editCustomerName.trim()
    var phone = this.data.editPhone.trim()
    if (!name || this.data.savingEditCustomer) {
      if (!name) wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    var that = this
    this.setData({ savingEditCustomer: true })
    put(config.api.ledgerCustomerUpdate(this.data.id), { name: name, phone: phone }).then(function () {
      that.setData({ showEditCustomer: false, savingEditCustomer: false })
      wx.showToast({ title: '已保存', icon: 'success' })
      that.loadBook()
    }).catch(function (err) {
      console.warn('[往来对象编辑保存失败]', {
        feature: '编辑往来对象',
        reason: err && err.message ? err.message : '请求失败',
        customerId: that.data.id
      })
      that.setData({ savingEditCustomer: false })
    })
  },
  openPayment: function (e) {
    var flowType = e.currentTarget.dataset.flowType === 'paid' ? 'paid' : 'received'
    var customer = this.data.book && this.data.book.customer
    var balance = customer ? parseFloat(flowType === 'paid' ? customer.payableBalance : customer.receivableBalance) || 0 : 0
    if (balance <= 0) {
      wx.showToast({ title: flowType === 'paid' ? '当前没有待付余额' : '当前没有待收余额', icon: 'none' })
      return
    }
    this.setData({ showPayment: true, paymentFlowType: flowType, paymentAmount: '', paymentDate: today(), paymentRemark: '' })
  },
  closePayment: function () { if (!this.data.savingPayment) this.setData({ showPayment: false }) },
  onPaymentAmount: function (e) { this.setData({ paymentAmount: e.detail.value }) },
  onPaymentDate: function (e) { this.setData({ paymentDate: e.detail.value }) },
  onPaymentRemark: function (e) { this.setData({ paymentRemark: e.detail.value }) },
  savePayment: function () {
    var amount = parseFloat(this.data.paymentAmount)
    var isPaid = this.data.paymentFlowType === 'paid'
    if (!amount || amount <= 0 || this.data.savingPayment) { wx.showToast({ title: isPaid ? '请输入正确付款金额' : '请输入正确回款金额', icon: 'none' }); return }
    var that = this
    this.setData({ savingPayment: true })
    post(config.api.ledgerPaymentAdd, { customerId: this.data.id, flowType: this.data.paymentFlowType, amount: amount, paymentDate: this.data.paymentDate, remark: this.data.paymentRemark.trim() }).then(function (result) {
      var action = isPaid ? '付款' : '回款'
      wx.showModal({ title: action + '已记录', content: action + '前 ' + formatPrice(result.balanceBefore) + '\n' + action + '后 ' + formatPrice(result.balanceAfter), showCancel: false })
      that.setData({ showPayment: false, savingPayment: false })
      that.loadBook()
    }).catch(function (err) {
      console.warn('[往来收付款保存失败]', {
        feature: isPaid ? '供应商付款' : '客户回款',
        reason: err && err.message ? err.message : '请求失败',
        customerId: that.data.id
      })
      that.setData({ savingPayment: false })
    })
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
  deleteCustomer: function () {
    var customer = this.data.book && this.data.book.customer
    if (!customer || !this.data.id) {
      console.warn('[往来对象删除失败]', { feature: '往来对象删除', reason: '缺少往来对象信息', customerId: this.data.id })
      wx.showToast({ title: '往来对象信息缺失', icon: 'none' })
      return
    }
    if (this.data.deletingCustomer) return
    if (customer.receivableBalance > 0 || customer.payableBalance > 0) {
      console.warn('[往来对象删除失败]', {
        feature: '往来对象删除', reason: '往来余额未结清', customerId: this.data.id
      })
      wx.showToast({ title: '请先结清待收和待付款', icon: 'none' })
      return
    }
    var that = this
    wx.showModal({
      title: '删除往来对象',
      content: '删除后将移至已归档，可查看原账单和收付款记录。确定删除“' + customer.name + '”吗？',
      confirmText: '删除', confirmColor: '#ff6868',
      success: function (result) {
        if (!result.confirm) return
        that.setData({ deletingCustomer: true })
        del(config.api.ledgerCustomerDelete(that.data.id), {}).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          wx.navigateBack({ fail: function (err) {
            console.warn('[往来对象删除返回失败]', { feature: '往来对象删除', reason: err && err.errMsg ? err.errMsg : '返回失败', customerId: that.data.id })
            that.setData({ deletingCustomer: false })
          } })
        }).catch(function (err) {
          console.warn('[往来对象删除失败]', { feature: '往来对象删除', reason: err && err.message ? err.message : '请求失败', customerId: that.data.id })
          that.setData({ deletingCustomer: false })
        })
      },
      fail: function (err) {
        console.warn('[往来对象删除确认失败]', { feature: '往来对象删除', reason: err && err.errMsg ? err.errMsg : '弹窗失败', customerId: that.data.id })
      }
    })
  },
  goBill: function (e) { wx.navigateTo({ url: '/pages/book/detail/detail?id=' + e.currentTarget.dataset.id + (this.data.book.customer.archived ? '&readonly=1' : '') }) },
  noop: function () {}
})
