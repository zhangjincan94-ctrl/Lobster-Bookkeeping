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
      token = decodeURIComponent(options.token)
    } else if (options && options.scene) {
      token = decodeURIComponent(options.scene)
    }
    console.log('[share] options=', options, 'token=', token)
    if (token) {
      this.setData({ token: token })
      this.loadRecords()
    } else {
      wx.showModal({
        title: '链接无效',
        content: '未获取到分享 token，请重新从商户分享卡片进入',
        showCancel: false
      })
    }
  },

  loadRecords: function () {
    var that = this
    request({
      url: config.api.shareRecords(that.data.token),
      method: 'GET'
    }).then(function (data) {
      console.log('[share] response=', data)
      if (!data) {
        wx.showToast({ title: '没有返回数据', icon: 'none' })
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
        totalDebt: formatPrice(data.totalDebt)
      })
    }).catch(function (err) {
      console.error('[share] error=', err)
      wx.showModal({
        title: '加载失败',
        content: '错误：' + (err && err.message ? err.message : JSON.stringify(err)),
        showCancel: false
      })
    })
  }
})
