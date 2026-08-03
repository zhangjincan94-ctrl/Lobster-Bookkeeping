var { get } = require('../../../utils/request')
var config = require('../../../utils/config')

function number(value) {
  var parsed = parseFloat(value)
  if (!isFinite(parsed)) return '0'
  return parsed.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function buildBillText(bill) {
  var lines = [
    '→ ' + (bill.customerName || '客户'),
    '----------------',
    bill.billDate + '  ' + (bill.direction === 'purchase' ? '进货' : '出货'),
    '----------------'
  ]
  ;(bill.items || []).forEach(function (item) {
    lines.push(
      item.productName + '：' + number(item.quantity) + (item.unit || '') +
      ' × ' + number(item.unitPrice) + ' = ' + number(item.subtotal)
    )
  })
  lines.push('----------------')
  lines.push('共：' + number(bill.totalAmount) + ' 元')
  if (bill.remark) lines.push('备注：' + bill.remark)
  return lines.join('\n')
}

Page({
  data: { id: '', text: '', loading: true, copying: false },

  onLoad: function (options) {
    var id = options && options.id ? options.id : ''
    this.setData({ id: id })
    if (!id) {
      console.warn('[账单文字加载失败]', {
        feature: '账单发字',
        reason: '缺少账单ID',
        targetPage: 'pages/book/text/text'
      })
      this.setData({ loading: false })
      return
    }
    this.loadBill()
  },

  loadBill: function () {
    var that = this
    get(config.api.ledgerBillDetail(this.data.id), {}).then(function (bill) {
      that.setData({ text: buildBillText(bill), loading: false })
    }).catch(function (err) {
      console.warn('[账单文字加载失败]', {
        feature: '账单发字',
        reason: err && err.message ? err.message : '请求失败',
        billId: that.data.id
      })
      that.setData({ loading: false })
    })
  },

  onTextInput: function (e) {
    this.setData({ text: e.detail.value })
  },

  copyText: function () {
    if (!this.data.text || this.data.copying) return
    var that = this
    this.setData({ copying: true })
    wx.setClipboardData({
      data: this.data.text,
      success: function () {
        wx.showToast({ title: '文字已复制', icon: 'success' })
      },
      fail: function (err) {
        console.error('[账单文字复制失败]', {
          feature: '账单发字',
          reason: err && err.errMsg ? err.errMsg : '剪贴板写入失败',
          billId: that.data.id,
          textLength: that.data.text.length
        })
        wx.showToast({ title: '复制失败', icon: 'none' })
      },
      complete: function () { that.setData({ copying: false }) }
    })
  }
})
