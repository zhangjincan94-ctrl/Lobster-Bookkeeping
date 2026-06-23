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
    purchase: null
  },

  onLoad: function (options) {
    var token = ''
    if (options && options.token) {
      token = options.token
    } else if (options && options.scene) {
      token = decodeURIComponent(options.scene)
    }

    if (!token) {
      wx.showModal({
        title: '链接无效',
        content: '未获取到分享 token，请重新从商户分享卡片进入',
        showCancel: false
      })
      return
    }

    this.setData({ token: token })
    this.loadRecord()
  },

  loadRecord: function () {
    var that = this
    request({
      url: config.api.purchaseShareRecord(that.data.token),
      method: 'GET'
    }).then(function (data) {
      if (!data) return
      var supplier = data.supplier || {}
      var paidAmount = parseFloat(data.paidAmount) || 0
      var totalCost = parseFloat(data.totalCost) || 0
      var unpaidAmount = totalCost - paidAmount
      if (unpaidAmount < 0) unpaidAmount = 0
      var payments = (data.paymentRecords || []).map(function (item) {
        return {
          id: item.id,
          amountDisplay: formatPrice(item.amount),
          method: item.paymentMethod || '未记录',
          timeDisplay: formatDate(item.paidAt)
        }
      })

      that.setData({
        purchase: {
          supplierName: supplier.name || '供应商',
          supplierPhone: supplier.phone || '',
          lobsterSize: data.lobsterSize || '',
          netWeightDisplay: data.netWeight ? data.netWeight + '斤' : '-',
          unitCostDisplay: data.unitCost ? formatPrice(data.unitCost) + '/斤' : '-',
          totalCostDisplay: formatPrice(totalCost),
          paidAmountDisplay: formatPrice(paidAmount),
          unpaidAmountDisplay: formatPrice(unpaidAmount),
          settlementStatusText: settlementStatusText(data.settlementStatus),
          settlementStatusClass: settlementStatusClass(data.settlementStatus),
          receivedAtDisplay: data.receivedAt ? formatDate(data.receivedAt) : '',
          remark: data.remark || '',
          payments: payments
        }
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
