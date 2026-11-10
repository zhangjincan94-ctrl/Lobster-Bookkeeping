var { get } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

var PAGE_SIZE = 30

function dateText(date) {
  return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2)
}

function mapBills(bills) {
  return (bills || []).map(function (bill) {
    var amount = Number(bill.totalAmount)
    if (bill.totalAmount == null || !Number.isFinite(amount) || (bill.direction !== 'sale' && bill.direction !== 'purchase')) {
      console.warn('[查询账单格式异常]', { feature: '查询统计', reason: '金额或方向无效', billId: bill.id })
      throw new Error('账单数据异常，请重试')
    }
    return Object.assign({}, bill, {
      customerName: bill.customerName || '未命名往来对象',
      totalDisplay: formatPrice(amount),
      directionText: bill.direction === 'purchase' ? '进货' : '出货', directionClass: bill.direction
    })
  })
}

Page({
  data: {
    theme: '',
    direction: '', startDate: '', endDate: '', period: '', bills: [],
    totalCount: 0, saleAmount: '¥0.00', purchaseAmount: '¥0.00',
    loading: false, loadingMore: false, error: '', hasMore: false
  },
  onShow: function () { this.setData({ theme: theme.get() }); if (checkLogin()) return this.loadBills() },
  onUnload: function () { this._requestId = (this._requestId || 0) + 1 },
  fetchPage: function (page) {
    return get(config.api.ledgerBillList, {
      page: page, pageSize: PAGE_SIZE, direction: this.data.direction,
      startDate: this.data.startDate, endDate: this.data.endDate
    })
  },
  applyPage: function (requestId, page, data) {
    if (requestId !== this._requestId) return
    var list = mapBills(data && data.list)
    var total = parseInt(data && data.total, 10)
    if (!Number.isFinite(total) || total < 0) throw new Error('账单分页数据格式异常')
    var totals = (data && data.totals) || {}
    this._page = page
    this._bills = page === 1 ? list : this._bills.concat(list)
    this.setData({
      bills: this._bills, totalCount: total,
      saleAmount: formatPrice(totals.saleAmount), purchaseAmount: formatPrice(totals.purchaseAmount),
      loading: false, loadingMore: false,
      hasMore: this._bills.length < total && list.length > 0
    })
  },
  loadBills: function () {
    var that = this
    var requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this._page = 1
    this._bills = []
    this.setData({
      loading: true, loadingMore: false, error: '', bills: [], totalCount: 0,
      saleAmount: '¥0.00', purchaseAmount: '¥0.00', hasMore: false
    })
    return this.fetchPage(1).then(function (data) {
      that.applyPage(requestId, 1, data)
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[查询统计加载失败]', { feature: '查询统计', reason: err.message || '请求失败', filters: that.data.direction })
      that._bills = []
      that.setData({ loading: false, loadingMore: false, error: '查询失败，请检查网络后重试', bills: [], totalCount: 0, hasMore: false })
    })
  },
  loadMore: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return Promise.resolve()
    var that = this
    var requestId = this._requestId
    var nextPage = (this._page || 1) + 1
    this.setData({ loadingMore: true })
    return this.fetchPage(nextPage).then(function (data) {
      that.applyPage(requestId, nextPage, data)
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[查询统计加载更多失败]', { feature: '查询统计', reason: err.message || '请求失败', page: nextPage })
      that.setData({ loadingMore: false })
      wx.showToast({ title: '加载更多失败，请重试', icon: 'none' })
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
  onReachBottom: function () { return this.loadMore() },
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
