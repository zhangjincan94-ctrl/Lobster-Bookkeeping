var { get } = require('../../../utils/request')
var { formatPrice, formatDate, paymentStatusText, paymentStatusClass, orderStatusText, orderStatusClass } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    id: '',
    buyer: null,
    transactions: [],
    page: 1,
    hasMore: true,
    loading: false
  },

  onLoad: function (options) {
    if (!checkLogin()) return
    if (options && options.id) {
      this.setData({ id: options.id })
      this.loadBuyerDetail()
      this.loadTransactions(1)
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    if (this.data.id) {
      this.loadBuyerDetail()
      this.loadTransactions(1)
    }
  },

  loadBuyerDetail: function () {
    var that = this
    get(config.api.buyerDetail(this.data.id)).then(function (data) {
      if (!data) return
      that.setData({
        buyer: {
          name: data.name || '未知买家',
          phone: data.phone || '',
          shareToken: data.shareToken || '',
          totalSpentDisplay: formatPrice(data.totalSpent),
          paidAmountDisplay: formatPrice(data.totalSpent - data.totalDebt),
          totalDebtDisplay: formatPrice(data.totalDebt)
        }
      })
    }).catch(function () {})
  },

  loadTransactions: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = {
      buyerId: this.data.id,
      page: page,
      pageSize: 20
    }

    get(config.api.transactionList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        return {
          id: item.id,
          lobsterSize: item.lobsterSize || '',
          weightDisplay: item.weight ? item.weight + '斤' : '',
          unitPriceDisplay: item.unitPrice ? '¥' + item.unitPrice + '/斤' : '',
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

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadTransactions(this.data.page + 1)
    }
  },

  goAddTransaction: function () {
    wx.navigateTo({
      url: '/pages/transaction/add/add?buyer_id=' + this.data.id
    })
  },

  onShareAppMessage: function () {
    var buyer = this.data.buyer
    var token = buyer && buyer.shareToken ? buyer.shareToken : ''
    return {
      title: (buyer ? buyer.name : '买家') + '的消费记录',
      path: '/pages/share/records/records?token=' + token
    }
  },

  goTransactionDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/transaction/detail/detail?id=' + id
    })
  }
})
