var { request } = require('../../../utils/request')
var { formatPrice, formatDate, paymentStatusText, paymentStatusClass } = require('../../../utils/format')
var config = require('../../../utils/config')

Page({
  data: {
    token: '',
    buyer: null,
    transactions: [],
    totalSpent: '¥0.00',
    totalDebt: '¥0.00',
    errorMessage: ''
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
    } else {
      console.warn('[分享账单加载失败]', {
        feature: '买家分享账单',
        reason: '缺少分享token'
      })
      this.setData({ errorMessage: '分享链接缺少必要参数' })
    }
  },

  loadRecords: function () {
    var that = this
    request({
      url: config.api.shareRecords(that.data.token),
      method: 'GET'
    }).then(function (data) {
      if (!data) {
        console.warn('[分享账单加载失败]', {
          feature: '买家分享账单',
          reason: '接口返回空数据'
        })
        that.setData({ errorMessage: '账单数据暂时无法加载' })
        return
      }

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
        totalDebt: formatPrice(data.totalDebt),
        errorMessage: ''
      })
    }).catch(function (err) {
      that.setData({ errorMessage: (err && err.message) || '账单加载失败，请稍后重试' })
    })
  }
})
