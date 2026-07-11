var { get } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function price(value) {
  return '¥' + (parseFloat(value) || 0).toFixed(2)
}

Page({
  data: {
    direction: '',
    bills: [],
    loading: false,
    hasLoaded: false
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadBills()
  },

  loadBills: function () {
    if (this.data.loading) return
    var that = this
    this.setData({ loading: true })
    get(config.api.ledgerBillList, { pageSize: 100, direction: this.data.direction }).then(function (data) {
      var bills = ((data && data.list) || []).map(function (item) {
        return {
          id: item.id,
          customerName: item.customerName || '未命名客户',
          billDate: item.billDate || '',
          direction: item.direction,
          directionText: item.direction === 'purchase' ? '进货' : '出货',
          directionClass: item.direction === 'purchase' ? 'purchase' : 'sale',
          totalDisplay: price(item.totalAmount),
          itemCount: item.itemCount || 0,
          items: item.items || []
        }
      })
      that.setData({ bills: bills, loading: false, hasLoaded: true })
    }).catch(function () {
      that.setData({ loading: false, hasLoaded: true, bills: [] })
    })
  },

  chooseDirection: function (e) {
    this.setData({ direction: e.currentTarget.dataset.direction })
    this.loadBills()
  },

  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/book/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  goAdd: function () {
    wx.switchTab({ url: '/pages/book/add/add' })
  },

  onPullDownRefresh: function () {
    var that = this
    this.loadBills()
    setTimeout(function () { wx.stopPullDownRefresh() }, 300)
  }
})
