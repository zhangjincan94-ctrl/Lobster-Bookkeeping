var { request } = require('../../../utils/request')
var { formatPrice, formatDate, paymentStatusText, paymentStatusClass } = require('../../../utils/format')
var config = require('../../../utils/config')

Page({
  data: {
    token: '',
    buyer: null,
    transactions: [],
    totalSpent: '¥0.00',
    totalDebt: '¥0.00'
  },

  onLoad: function (options) {
    var token = ''
    if (options && options.token) {
      token = options.token
    } else if (options && options.scene) {
      token = decodeURIComponent(options.scene)
    }
    if (token) {
      this.setData({ token: token })
      this.loadRecords()
    }
  },

  loadRecords: function () {
    var that = this
    request({
      url: config.api.shareRecords(that.data.token),
      method: 'GET'
    }).then(function (data) {
      if (!data) return

      var buyerData = data.buyer || {}
      var list = data.transactions || []

      var processed = list.map(function (item) {
        return {
          id: item.id,
          lobsterSize: item.lobsterSize || '',
          weightDisplay: item.weight ? item.weight + '斤' : '',
          unitPriceDisplay: item.unitPrice ? '¥' + item.unitPrice + '/斤' : '',
          totalAmountDisplay: formatPrice(item.totalAmount),
          paymentStatusText: paymentStatusText(item.paymentStatus),
          paymentStatusClass: paymentStatusClass(item.paymentStatus),
          timeDisplay: formatDate(item.transactionTime || item.createdAt)
        }
      })

      that.setData({
        buyer: {
          name: buyerData.name || '买家',
          phone: buyerData.phone || ''
        },
        transactions: processed,
        totalSpent: formatPrice(data.totalSpent),
        totalDebt: formatPrice(data.totalDebt)
      })
    }).catch(function () {})
  }
})
