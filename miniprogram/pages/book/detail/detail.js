var { get, del } = require('../../../utils/request')
var config = require('../../../utils/config')

function price(value) { return '¥' + (parseFloat(value) || 0).toFixed(2) }

Page({
  data: { id: '', bill: null, loading: true },
  onLoad: function (options) {
    this.setData({ id: options.id || '' })
    this.loadBill()
  },
  loadBill: function () {
    var that = this
    get(config.api.ledgerBillDetail(this.data.id), {}).then(function (bill) {
      bill.totalDisplay = price(bill.totalAmount)
      bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'
      bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'
      bill.items = (bill.items || []).map(function (item) {
        item.subtotalDisplay = price(item.subtotal)
        return item
      })
      that.setData({ bill: bill, loading: false })
    }).catch(function () { that.setData({ loading: false }) })
  },
  removeBill: function () {
    var that = this
    wx.showModal({ title: '删除账单', content: '删除后不会显示在总账本中，确定继续吗？', confirmText: '删除', confirmColor: '#ff6868', success: function (res) {
      if (!res.confirm) return
      del(config.api.ledgerBillDelete(that.data.id), {}).then(function () {
        wx.showToast({ title: '已删除', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 500)
      })
    } })
  }
})
