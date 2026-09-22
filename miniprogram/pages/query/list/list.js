var { fetchAllBills } = require('../../../services/ledger')
var { checkLogin } = require('../../../utils/auth')
var { formatPrice } = require('../../../utils/format')

function dateText(date) {
  return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2)
}

Page({
  data: {
    direction: '', startDate: '', endDate: '', period: '', bills: [],
    totalCount: 0, saleAmount: '¥0.00', purchaseAmount: '¥0.00',
    loading: false, error: '', visibleCount: 30, hasMore: false
  },
  onShow: function () { if (checkLogin()) return this.loadBills() },
  onUnload: function () { this._requestId = (this._requestId || 0) + 1 },
  loadBills: function () {
    var that = this
    var requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    var filters = { direction: this.data.direction, startDate: this.data.startDate, endDate: this.data.endDate }
    this._bills = []
    this.setData({ loading: true, error: '', bills: [], totalCount: 0, hasMore: false, visibleCount: 30 })
    return fetchAllBills(filters, function () { return requestId === that._requestId }).then(function (bills) {
      if (requestId !== that._requestId || bills === null) return
      var saleCents = 0
      var purchaseCents = 0
      that._bills = bills.map(function (bill) {
        var amount = Number(bill.totalAmount)
        if (bill.totalAmount == null || !Number.isFinite(amount) || (bill.direction !== 'sale' && bill.direction !== 'purchase')) {
          console.warn('[查询账单格式异常]', { feature: '查询统计', reason: '金额或方向无效', billId: bill.id })
          throw new Error('账单数据异常，请重试')
        }
        if (bill.direction === 'purchase') purchaseCents += Math.round(amount * 100)
        else saleCents += Math.round(amount * 100)
        return Object.assign({}, bill, {
          customerName: bill.customerName || '未命名往来对象',
          totalDisplay: formatPrice(amount),
          directionText: bill.direction === 'purchase' ? '进货' : '出货', directionClass: bill.direction
        })
      })
      that.setData({
        bills: that._bills.slice(0, 30), totalCount: bills.length,
        saleAmount: formatPrice(saleCents / 100), purchaseAmount: formatPrice(purchaseCents / 100),
        loading: false, hasMore: bills.length > 30
      })
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[查询统计加载失败]', { feature: '查询统计', reason: err.message || '请求失败', filters: filters })
      that._bills = []
      that.setData({ loading: false, error: '查询失败，请检查网络后重试', bills: [], hasMore: false })
    })
  },
  chooseDirection: function (e) {
    this.setData({ direction: e.currentTarget.dataset.direction })
    return this.loadBills()
  },
  setDateRange: function (startDate, endDate, period) {
    if (startDate && endDate && startDate > endDate) {
      console.warn('[查询日期校验失败]', { feature: '查询统计', reason: '开始日期晚于结束日期', startDate: startDate, endDate: endDate })
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }
    this.setData({ startDate: startDate, endDate: endDate, period: period || '' })
    return this.loadBills()
  },
  onStartDate: function (e) { return this.setDateRange(e.detail.value, this.data.endDate) },
  onEndDate: function (e) { return this.setDateRange(this.data.startDate, e.detail.value) },
  choosePeriod: function (e) {
    var period = e.currentTarget.dataset.period
    var end = new Date()
    var start = new Date(end.getTime())
    if (period === 'week') start.setDate(start.getDate() - 6)
    if (period === 'month') start.setDate(1)
    return this.setDateRange(dateText(start), dateText(end), period)
  },
  clear: function () {
    this.setData({ direction: '', startDate: '', endDate: '', period: '' })
    return this.loadBills()
  },
  loadMore: function () {
    if (this.data.loading || !this.data.hasMore) return
    var count = this.data.visibleCount + 30
    this.setData({ visibleCount: count, bills: this._bills.slice(0, count), hasMore: this._bills.length > count })
  },
  onReachBottom: function () { this.loadMore() },
  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id) {
      console.warn('[查询账单打开失败]', { feature: '查询统计', reason: '缺少账单ID' })
      return
    }
    wx.navigateTo({ url: '/pages/book/detail/detail?id=' + id, fail: function (err) {
      console.warn('[查询账单打开失败]', { feature: '查询统计', reason: err.errMsg, billId: id })
      wx.showToast({ title: '账单打开失败，请重试', icon: 'none' })
    } })
  },
  onPullDownRefresh: function () { return this.loadBills().then(function () { wx.stopPullDownRefresh() }) }
})
