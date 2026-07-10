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
    this.loadTodayOverview()
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

      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        var statusText = isCancelled ? orderStatusText(orderStatus) : paymentStatusText(item.paymentStatus)
        var statusClass = isCancelled ? orderStatusClass(orderStatus) : paymentStatusClass(item.paymentStatus)
        var amount = formatPrice(item.totalAmount)
        var time = formatDate(item.transactionTime || item.createdAt)

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
        recentTransactions: processed
      })
    }).catch(function (err) {
      console.warn('[首页加载失败]', {
        feature: '最近交易',
        reason: err && err.message ? err.message : '请求失败'
      })
    })
  },

  loadTodayOverview: function () {
    var that = this
    var today = this.getTodayStr()
    get(config.api.statsOverview, {
      startDate: today,
      endDate: today
    }).then(function (data) {
      var overview = data || {}
      that.setData({
        todayCount: overview.orderCount || 0,
        todayIncome: formatPrice(overview.totalAmount),
        todayUnpaid: formatPrice(overview.unpaidAmount)
      })
    }).catch(function (err) {
      console.warn('[首页加载失败]', {
        feature: '今日统计',
        reason: err && err.message ? err.message : '请求失败'
      })
    })
  },

  getTodayStr: function () {
    var d = new Date()
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
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

  goStats: function () {
    wx.navigateTo({
      url: '/pages/stats/overview/overview'
    })
  },

  goTransactionDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/transaction/detail/detail?id=' + id
    })
  }
})
