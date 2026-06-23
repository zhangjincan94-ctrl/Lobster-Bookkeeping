var { get } = require('../../../utils/request')
var { formatPrice, formatDate } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function settlementStatusText(status) {
  var map = {
    0: '未结清',
    1: '已结清',
    2: '部分付款'
  }
  return map[status] !== undefined ? map[status] : '未知'
}

function settlementStatusClass(status) {
  var map = {
    0: 'tag-unpaid',
    1: 'tag-paid',
    2: 'tag-partial'
  }
  return map[status] || 'tag-unpaid'
}

Page({
  data: {
    supplierId: '',
    activeStatus: '',
    activeRange: 'all',
    startDate: '',
    endDate: '',
    purchases: [],
    page: 1,
    hasMore: true,
    loading: false
  },

  onLoad: function (options) {
    if (options && options.supplier_id) {
      this.setData({ supplierId: options.supplier_id })
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    this.resetAndReload()
  },

  resetAndReload: function () {
    this.setData({
      page: 1,
      purchases: [],
      hasMore: true
    })
    this.loadPurchases(1)
  },

  formatDatePart: function (d) {
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
  },

  setQuickRange: function (range) {
    if (range === 'all') {
      this.setData({ activeRange: range, startDate: '', endDate: '' })
      this.resetAndReload()
      return
    }

    var end = new Date()
    var start = new Date()
    if (range === 'week') start.setDate(end.getDate() - 6)
    if (range === 'month') start.setDate(end.getDate() - 29)

    this.setData({
      activeRange: range,
      startDate: this.formatDatePart(start),
      endDate: this.formatDatePart(end)
    })
    this.resetAndReload()
  },

  loadPurchases: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = {
      page: page,
      pageSize: 20
    }
    if (this.data.supplierId) params.supplierId = this.data.supplierId
    if (this.data.activeStatus !== '') params.settlementStatus = this.data.activeStatus
    if (this.data.startDate) params.startDate = this.data.startDate
    if (this.data.endDate) params.endDate = this.data.endDate

    get(config.api.purchaseList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        var status = Number(item.settlementStatus) || 0
        return {
          id: item.id,
          supplierName: item.supplierName || '未知供应商',
          lobsterSize: item.lobsterSize || '',
          netWeight: item.netWeight || '',
          remainingWeight: item.remainingWeight || '',
          totalCostDisplay: formatPrice(item.totalCost),
          timeDisplay: formatDate(item.receivedAt || item.createdAt),
          settlementStatusText: isCancelled ? '已取消' : settlementStatusText(status),
          settlementStatusClass: isCancelled ? 'tag-cancelled' : settlementStatusClass(status)
        }
      })

      var newPurchases = page === 1 ? processed : that.data.purchases.concat(processed)
      that.setData({
        purchases: newPurchases,
        page: page,
        hasMore: newPurchases.length < total,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onStatusTap: function (e) {
    this.setData({ activeStatus: e.currentTarget.dataset.status })
    this.resetAndReload()
  },

  onRangeTap: function (e) {
    this.setQuickRange(e.currentTarget.dataset.range)
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value, activeRange: 'custom' })
    this.resetAndReload()
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value, activeRange: 'custom' })
    this.resetAndReload()
  },

  onPullDownRefresh: function () {
    this.resetAndReload()
    wx.stopPullDownRefresh()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPurchases(this.data.page + 1)
    }
  },

  goAddPurchase: function () {
    var url = '/pages/purchase/add/add'
    if (this.data.supplierId) url += '?supplier_id=' + this.data.supplierId
    wx.navigateTo({ url: url })
  },

  goDetail: function (e) {
    wx.navigateTo({
      url: '/pages/purchase/detail/detail?id=' + e.currentTarget.dataset.id
    })
  }
})
