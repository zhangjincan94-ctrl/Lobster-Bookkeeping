var { request } = require('../../../utils/request')
var { formatPrice, formatDate } = require('../../../utils/format')
var config = require('../../../utils/config')

function settlementStatusText(status) {
  var s = Number(status)
  if (s === 1) return '已结清'
  if (s === 2) return '部分付款'
  return '未付款'
}
function settlementStatusClass(status) {
  var s = Number(status)
  if (s === 1) return 'tag-success'
  if (s === 2) return 'tag-warning'
  return 'tag-danger'
}

Page({
  data: {
    token: '',
    supplier: null,
    purchases: [],
    totalCost: '¥0.00',
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
      url: config.api.supplierShareRecords(that.data.token),
      method: 'GET'
    }).then(function (data) {
      if (!data) return
      var supplier = data.supplier || {}
      var list = data.purchases || []
      var processed = list.map(function (item) {
        return {
          id: item.id,
          lobsterSize: item.lobsterSize || '',
          netWeightDisplay: item.netWeight ? item.netWeight + '斤' : '',
          totalCostDisplay: formatPrice(item.totalCost),
          settlementStatusText: settlementStatusText(item.settlementStatus),
          settlementStatusClass: settlementStatusClass(item.settlementStatus),
          timeDisplay: formatDate(item.receivedAt || item.createdAt)
        }
      })
      that.setData({
        supplier: { name: supplier.name || '供应商', phone: supplier.phone || '' },
        purchases: processed,
        totalCost: formatPrice(data.totalCost),
        totalDebt: formatPrice(data.totalDebt)
      })
    }).catch(function (err) {
      wx.showModal({
        title: '加载失败',
        content: '错误：' + (err && err.message ? err.message : JSON.stringify(err)),
        showCancel: false
      })
    })
  }
})
