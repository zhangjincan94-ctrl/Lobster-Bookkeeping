const { get } = require('../../utils/request')
const { getMerchantInfo, checkLogin } = require('../../utils/auth')
const { formatPrice, formatDate, paymentStatusText, paymentStatusClass, orderStatusText, orderStatusClass } = require('../../utils/format')
const config = require('../../utils/config')

Page({
  data: {
    merchantName: '',
    todayCount: 0,
    todayIncome: '0.00',
    todayUnpaid: '0.00',
    recentTransactions: []
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadMerchantInfo()
    this.loadRecentTransactions()
  },

  loadMerchantInfo: function () {
    var merchant = getMerchantInfo()
    if (merchant) {
      this.setData({
        merchantName: merchant.shopName || merchant.name || '商家'
      })
    }
  },

  loadRecentTransactions: function () {
    var that = this
    get(config.api.transactionList, { page: 1, pageSize: 5 }).then(function (data) {
      var list = (data && data.list) || []
      var today = that.getTodayStr()
      var todayCount = 0
      var todayIncome = 0
      var todayUnpaid = 0

      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        var statusText = isCancelled ? orderStatusText(orderStatus) : paymentStatusText(item.paymentStatus)
        var statusClass = isCancelled ? orderStatusClass(orderStatus) : paymentStatusClass(item.paymentStatus)
        var amount = formatPrice(item.totalAmount)
        var time = formatDate(item.transactionTime || item.createdAt)

        if (!isCancelled && that.isSameDay(item.transactionTime || item.createdAt, today)) {
          todayCount++
          todayIncome += parseFloat(item.totalAmount) || 0
          if (item.paymentStatus === 0 || item.paymentStatus === 2) {
            todayUnpaid += (parseFloat(item.totalAmount) - parseFloat(item.paidAmount || 0)) || 0
          }
        }

        return {
          id: item.id,
          buyerName: item.buyerName || '未知买家',
          lobsterSize: item.lobsterSize || '',
          totalAmount: amount,
          paymentStatusText: statusText,
          paymentStatusClass: statusClass,
          time: time,
          paymentStatus: item.paymentStatus
        }
      })

      that.setData({
        recentTransactions: processed,
        todayCount: todayCount,
        todayIncome: formatPrice(todayIncome),
        todayUnpaid: formatPrice(todayUnpaid)
      })
    }).catch(function () {})
  },

  getTodayStr: function () {
    var d = new Date()
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
  },

  isSameDay: function (dateStr, todayStr) {
    if (!dateStr) return false
    return dateStr.indexOf(todayStr) === 0
  },

  goAddTransaction: function () {
    wx.navigateTo({
      url: '/pages/transaction/add/add'
    })
  },

  goTransactionList: function () {
    wx.switchTab({
      url: '/pages/transaction/list/list'
    })
  },

  goBuyerList: function () {
    wx.switchTab({
      url: '/pages/buyer/list/list'
    })
  },

  goPurchaseList: function () {
    wx.navigateTo({
      url: '/pages/purchase/list/list'
    })
  },

  goSupplierList: function () {
    wx.navigateTo({
      url: '/pages/supplier/list/list'
    })
  },

  goTransactionDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/transaction/detail/detail?id=' + id
    })
  }
})
