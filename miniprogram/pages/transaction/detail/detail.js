var { get, post, put } = require('../../../utils/request')
var { formatPrice, formatDate, paymentStatusText, paymentStatusClass, deliveryStatusText, deliveryStatusClass, orderStatusText, orderStatusClass } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    id: '',
    transaction: null,
    showPaymentModal: false,
    paymentAmount: '',
    paymentMethod: '',
    paymentTime: '',
    paymentDate: '',
    paymentTimeOnly: '',
    paymentSubmitting: false,
    updatingStatus: false,
    canceling: false
  },

  onLoad: function (options) {
    if (!checkLogin()) return
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadTransaction()
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    if (this.data.id) {
      this.loadTransaction()
    }
  },

  loadTransaction: function () {
    var that = this
    get(config.api.transactionDetail(this.data.id)).then(function (data) {
      if (!data) return
      var paidAmount = parseFloat(data.paidAmount) || 0
      var totalAmount = parseFloat(data.totalAmount) || 0
      var unpaidAmount = totalAmount - paidAmount
      if (unpaidAmount < 0) unpaidAmount = 0
      var paymentStatus = Number(data.paymentStatus) || 0
      var deliveryStatus = Number(data.deliveryStatus) || 0
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

      var buyer = data.buyer || {}
      var sourceAllocations = (data.sourceAllocations || []).map(function (item) {
        var purchase = item.purchaseRecord || {}
        return {
          id: item.id,
          supplierName: purchase.supplierName || '',
          lobsterSize: purchase.lobsterSize || '',
          weight: item.weight || '',
          unitCost: item.unitCost || '',
          totalCostDisplay: formatPrice(item.totalCost),
          remainingWeight: purchase.remainingWeight || '',
          receivedAt: purchase.receivedAt ? formatDate(purchase.receivedAt) : ''
        }
      })

      that.setData({
        transaction: {
          id: data.id,
          buyerName: buyer.name || data.buyerName || '',
          buyerPhone: buyer.phone || '',
          lobsterSize: data.lobsterSize || '',
          weight: data.weight || '',
          unitPrice: data.unitPrice || '',
          totalAmountDisplay: formatPrice(data.totalAmount),
          paymentStatus: paymentStatus,
          paymentStatusText: isCancelled ? orderStatusText(orderStatus) : paymentStatusText(paymentStatus),
          paymentStatusClass: isCancelled ? orderStatusClass(orderStatus) : paymentStatusClass(paymentStatus),
          paidAmountDisplay: formatPrice(paidAmount),
          unpaidAmountDisplay: formatPrice(unpaidAmount),
          unpaidAmountRaw: unpaidAmount.toFixed(2),
          deliveryAddress: data.deliveryAddress || '',
          deliveryStatus: deliveryStatus,
          deliveryStatusText: deliveryStatusText(deliveryStatus),
          deliveryStatusClass: deliveryStatusClass(deliveryStatus),
          deliveryTime: data.deliveryTime ? formatDate(data.deliveryTime) : '',
          orderStatus: orderStatus,
          orderStatusText: orderStatusText(orderStatus),
          orderStatusClass: orderStatusClass(orderStatus),
          cancelledAt: data.cancelledAt ? formatDate(data.cancelledAt) : '',
          remark: data.remark || '',
          paymentRecords: paymentRecords,
          payments: paymentRecords,
          sourceAllocations: sourceAllocations,
          buyerId: data.buyerId || buyer.id || '',
          shareToken: buyer.shareToken || data.shareToken || '',
          canAddPayment: !isCancelled && paymentStatus !== 1,
          canStartDelivery: !isCancelled && deliveryStatus === 0,
          canFinishDelivery: !isCancelled && deliveryStatus === 1,
          canCancel: !isCancelled
        }
      })
    }).catch(function () {})
  },

  onAddPayment: function () {
    var transaction = this.data.transaction
    if (!transaction || transaction.orderStatus === 1) {
      wx.showToast({ title: '已取消订单不能补录付款', icon: 'none' })
      return
    }
    var now = new Date()
    var y = now.getFullYear()
    var m = now.getMonth() + 1
    var d = now.getDate()
    var hh = now.getHours()
    var mm = now.getMinutes()
    var dateStr = y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d)
    var timeStr = (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm)
    this.setData({
      showPaymentModal: true,
      paymentAmount: transaction.unpaidAmountRaw === '0.00' ? '' : transaction.unpaidAmountRaw,
      paymentMethod: '',
      paymentDate: dateStr,
      paymentTimeOnly: timeStr,
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

  onPaymentDateChange: function (e) {
    this.setData({ paymentDate: e.detail.value })
  },

  onPaymentTimeChange: function (e) {
    this.setData({ paymentTimeOnly: e.detail.value })
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
    post(config.api.transactionPayment(this.data.id), {
      amount: amount.toFixed(2),
      paymentMethod: this.data.paymentMethod.trim(),
      paidAt: this.data.paymentDate + ' ' + this.data.paymentTimeOnly + ':00'
    }).then(function () {
      wx.showToast({ title: '付款已录入', icon: 'success' })
      that.setData({ showPaymentModal: false, paymentSubmitting: false })
      that.loadTransaction()
    }).catch(function () {
      that.setData({ paymentSubmitting: false })
    })
  },

  onUpdateDeliveryStatus: function (e) {
    if (this.data.updatingStatus) return
    var nextStatus = Number(e.currentTarget.dataset.status)
    var nextText = deliveryStatusText(nextStatus)
    var that = this

    wx.showModal({
      title: '更新配送状态',
      content: '确定要将配送状态改为“' + nextText + '”吗？',
      success: function (res) {
        if (!res.confirm) return
        that.setData({ updatingStatus: true })
        put(config.api.transactionUpdate(that.data.id), {
          deliveryStatus: nextStatus
        }).then(function () {
          wx.showToast({ title: '配送状态已更新', icon: 'success' })
          that.setData({ updatingStatus: false })
          that.loadTransaction()
        }).catch(function () {
          that.setData({ updatingStatus: false })
        })
      }
    })
  },

  onCancelOrder: function () {
    if (this.data.canceling) return
    var that = this

    wx.showModal({
      title: '取消订单',
      content: '取消后该订单不会计入买家消费和欠款统计，确定取消吗？',
      confirmText: '取消订单',
      confirmColor: '#E74C3C',
      success: function (res) {
        if (!res.confirm) return
        that.setData({ canceling: true })
        put(config.api.transactionUpdate(that.data.id), {
          orderStatus: 1
        }).then(function () {
          wx.showToast({ title: '订单已取消', icon: 'success' })
          that.setData({ canceling: false })
          that.loadTransaction()
        }).catch(function () {
          that.setData({ canceling: false })
        })
      }
    })
  },

  onShareAppMessage: function () {
    var transaction = this.data.transaction
    if (!transaction) return
    var token = transaction.shareToken || ''
    if (!token) {
      wx.showToast({ title: '分享链接未生成，请刷新后重试', icon: 'none' })
      return {
        title: '龙虾记账',
        path: '/pages/index/index'
      }
    }
    var buyerName = transaction.buyerName || '买家'
    return {
      title: buyerName + '的消费记录',
      path: '/pages/share/records/records?token=' + encodeURIComponent(token)
    }
  }
})
