var { get } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function money(value) { return '¥' + (parseFloat(value) || 0).toFixed(2) }

Page({
  data: { direction: '', startDate: '', endDate: '', bills: [], totalAmount: '¥0.00', totalCount: 0, loading: false },
  onShow: function () { if (checkLogin()) this.loadBills() },
  loadBills: function () {
    var that = this
    this.setData({ loading: true })
    get(config.api.ledgerBillList, { pageSize: 100, direction: this.data.direction, startDate: this.data.startDate, endDate: this.data.endDate }).then(function (data) {
      var bills = (data && data.list) || []
      var total = bills.reduce(function (sum, item) { return sum + (parseFloat(item.totalAmount) || 0) }, 0)
      that.setData({ bills: bills.map(function (item) { item.totalDisplay = money(item.totalAmount); item.directionText = item.direction === 'purchase' ? '进货' : '出货'; item.directionClass = item.direction === 'purchase' ? 'purchase' : 'sale'; return item }), totalCount: bills.length, totalAmount: money(total), loading: false })
    }).catch(function () { that.setData({ bills: [], totalCount: 0, totalAmount: '¥0.00', loading: false }) })
  },
  chooseDirection: function (e) { this.setData({ direction: e.currentTarget.dataset.direction }); this.loadBills() },
  onStartDate: function (e) { this.setData({ startDate: e.detail.value }); this.loadBills() },
  onEndDate: function (e) { this.setData({ endDate: e.detail.value }); this.loadBills() },
  clear: function () { this.setData({ direction: '', startDate: '', endDate: '' }); this.loadBills() },
  goDetail: function (e) { wx.navigateTo({ url: '/pages/book/detail/detail?id=' + e.currentTarget.dataset.id }) },
  onPullDownRefresh: function () { this.loadBills(); setTimeout(function () { wx.stopPullDownRefresh() }, 300) }
})
