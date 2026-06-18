var { get } = require('../../../utils/request')
var { formatPrice, formatDate, paymentStatusText, paymentStatusClass, orderStatusText, orderStatusClass } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    activeStatus: '',
    startDate: '',
    endDate: '',
    transactions: [],
    page: 1,
    hasMore: true,
    loading: false
  },

  onShow: function () {
    if (!checkLogin()) return
    this.resetAndReload()
  },

  resetAndReload: function () {
    this.setData({
      page: 1,
      transactions: [],
      hasMore: true
    })
    this.loadTransactions(1)
  },

  loadTransactions: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = {
      page: page,
      pageSize: 20
    }
    if (this.data.activeStatus !== '') {
      params.paymentStatus = this.data.activeStatus
    }
    if (this.data.startDate) {
      params.startDate = this.data.startDate
    }
    if (this.data.endDate) {
      params.endDate = this.data.endDate
    }

    get(config.api.transactionList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        return {
          id: item.id,
          buyerName: item.buyerName || '未知买家',
          lobsterSize: item.lobsterSize || '',
          weight: item.weight || '',
          totalAmountDisplay: formatPrice(item.totalAmount),
          paymentStatusText: isCancelled ? orderStatusText(orderStatus) : paymentStatusText(item.paymentStatus),
          paymentStatusClass: isCancelled ? orderStatusClass(orderStatus) : paymentStatusClass(item.paymentStatus),
          timeDisplay: formatDate(item.transactionTime || item.createdAt)
        }
      })

      var newTransactions = page === 1 ? processed : that.data.transactions.concat(processed)
      that.setData({
        transactions: newTransactions,
        page: page,
        hasMore: newTransactions.length < total,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onStatusTap: function (e) {
    var status = e.currentTarget.dataset.status
    this.setData({ activeStatus: status })
    this.resetAndReload()
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value })
    this.resetAndReload()
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value })
    this.resetAndReload()
  },

  onPullDownRefresh: function () {
    this.resetAndReload()
    wx.stopPullDownRefresh()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadTransactions(this.data.page + 1)
    }
  },

  goAddTransaction: function () {
    wx.navigateTo({
      url: '/pages/transaction/add/add'
    })
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/transaction/detail/detail?id=' + id
    })
  }
})
