var { get, post, put } = require('../../../utils/request')
var { formatPrice, formatDate } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function settlementStatusText(status) {
  var map = {
    0: '未结清',
    1: '已结清',
    2: '部分付款'
  }
  return map[status] !== undefined ? map[status] : '未知'
}

function settlementStatusClass(status) {
  var map = {
    0: 'tag-unpaid',
    1: 'tag-paid',
    2: 'tag-partial'
  }
  return map[status] || 'tag-unpaid'
}

Page({
  data: {
    id: '',
    purchase: null,
    showPaymentModal: false,
    paymentAmount: '',
    paymentMethod: '',
    paymentTime: '',
    paymentSubmitting: false,
    canceling: false
  },

  onLoad: function (options) {
    if (!checkLogin()) return
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadPurchase()
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    if (this.data.id) this.loadPurchase()
  },

  loadPurchase: function () {
    var that = this
    get(config.api.purchaseDetail(this.data.id)).then(function (data) {
      if (!data) return
      var paidAmount = parseFloat(data.paidAmount) || 0
      var totalCost = parseFloat(data.totalCost) || 0
      var unpaidAmount = totalCost - paidAmount
      if (unpaidAmount < 0) unpaidAmount = 0
      var settlementStatus = Number(data.settlementStatus) || 0
      var orderStatus = Number(data.orderStatus) || 0
      var isCancelled = orderStatus === 1
      var paymentRecords = (data.paymentRecords || []).map(function (p) {
        return {
          id: p.id,
          amountDisplay: formatPrice(p.amount),
          method: p.paymentMethod || '',
          timeDisplay: formatDate(p.paidAt)
        }
      })
      var supplier = data.supplier || {}

      that.setData({
        purchase: {
          id: data.id,
          supplierName: supplier.name || data.supplierName || '',
          supplierPhone: supplier.phone || '',
          lobsterSize: data.lobsterSize || '',
          grossWeight: data.grossWeight || '',
          tareWeight: data.tareWeight || '',
          deductWeight: data.deductWeight || '',
          netWeight: data.netWeight || '',
          remainingWeight: data.remainingWeight || '',
          unitCost: data.unitCost || '',
          totalCostDisplay: formatPrice(data.totalCost),
          paidAmountDisplay: formatPrice(paidAmount),
          unpaidAmountDisplay: formatPrice(unpaidAmount),
          unpaidAmountRaw: unpaidAmount.toFixed(2),
          settlementStatus: settlementStatus,
          settlementStatusText: isCancelled ? '已取消' : settlementStatusText(settlementStatus),
          settlementStatusClass: isCancelled ? 'tag-cancelled' : settlementStatusClass(settlementStatus),
          orderStatus: orderStatus,
          receivedAt: data.receivedAt ? formatDate(data.receivedAt) : '',
          cancelledAt: data.cancelledAt ? formatDate(data.cancelledAt) : '',
          remark: data.remark || '',
          payments: paymentRecords,
          canAddPayment: !isCancelled && settlementStatus !== 1,
          canCancel: !isCancelled
        }
      })
    }).catch(function () {})
  },

  onAddPayment: function () {
    var purchase = this.data.purchase
    if (!purchase || purchase.orderStatus === 1) {
      wx.showToast({ title: '已取消采购单不能补录付款', icon: 'none' })
      return
    }
    var now = new Date()
    var y = now.getFullYear()
    var m = now.getMonth() + 1
    var d = now.getDate()
    var dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d)
    this.setData({
      showPaymentModal: true,
      paymentAmount: purchase.unpaidAmountRaw === '0.00' ? '' : purchase.unpaidAmountRaw,
      paymentMethod: '',
      paymentTime: dateStr,
      paymentSubmitting: false
    })
  },

  onClosePaymentModal: function () {
    this.setData({ showPaymentModal: false })
  },

  noop: function () {},

  onPaymentAmountInput: function (e) {
    this.setData({ paymentAmount: e.detail.value })
  },

  onPaymentMethodInput: function (e) {
    this.setData({ paymentMethod: e.detail.value })
  },

  onPaymentTimeChange: function (e) {
    this.setData({ paymentTime: e.detail.value })
  },

  onPaymentSubmit: function () {
    if (this.data.paymentSubmitting) return
    var amount = parseFloat(this.data.paymentAmount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    var that = this
    this.setData({ paymentSubmitting: true })
    post(config.api.purchasePayment(this.data.id), {
      amount: amount.toFixed(2),
      paymentMethod: this.data.paymentMethod.trim(),
      paidAt: this.data.paymentTime
    }).then(function () {
      wx.showToast({ title: '付款已录入', icon: 'success' })
      that.setData({ showPaymentModal: false, paymentSubmitting: false })
      that.loadPurchase()
    }).catch(function () {
      that.setData({ paymentSubmitting: false })
    })
  },

  onCancelOrder: function () {
    if (this.data.canceling) return
    var that = this

    wx.showModal({
      title: '取消采购单',
      content: '取消后该采购单不会计入供应商统计，确定取消吗？',
      confirmText: '取消采购单',
      confirmColor: '#E74C3C',
      success: function (res) {
        if (!res.confirm) return
        that.setData({ canceling: true })
        put(config.api.purchaseUpdate(that.data.id), {
          orderStatus: 1
        }).then(function () {
          wx.showToast({ title: '采购单已取消', icon: 'success' })
          that.setData({ canceling: false })
          that.loadPurchase()
        }).catch(function () {
          that.setData({ canceling: false })
        })
      }
    })
  }
})
