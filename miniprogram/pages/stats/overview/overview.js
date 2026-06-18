var { get } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

var DIMENSIONS = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' }
]

function formatDateInput(d) {
  var y = d.getFullYear()
  var m = d.getMonth() + 1
  var day = d.getDate()
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}

Page({
  data: {
    dimensions: DIMENSIONS,
    activeDimension: 'day',
    startDate: '',
    endDate: '',
    overview: {
      orderCount: 0,
      totalAmountDisplay: '¥0.00',
      paidAmountDisplay: '¥0.00',
      unpaidAmountDisplay: '¥0.00'
    },
    trendList: [],
    maxAmount: 0,
    loading: false
  },

  onLoad: function () {
    var today = new Date()
    var start = new Date()
    start.setDate(today.getDate() - 29)
    this.setData({
      startDate: formatDateInput(start),
      endDate: formatDateInput(today)
    })
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadAll()
  },

  onPullDownRefresh: function () {
    this.loadAll()
    wx.stopPullDownRefresh()
  },

  loadAll: function () {
    this.loadOverview()
    this.loadTrend()
  },

  loadOverview: function () {
    var that = this
    get(config.api.statsOverview, {
      startDate: this.data.startDate,
      endDate: this.data.endDate
    }).then(function (data) {
      var d = data || {}
      that.setData({
        overview: {
          orderCount: d.orderCount || 0,
          totalAmountDisplay: formatPrice(d.totalAmount),
          paidAmountDisplay: formatPrice(d.paidAmount),
          unpaidAmountDisplay: formatPrice(d.unpaidAmount)
        }
      })
    }).catch(function () {})
  },

  loadTrend: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    get(config.api.statsTrend, {
      dimension: this.data.activeDimension,
      startDate: this.data.startDate,
      endDate: this.data.endDate
    }).then(function (list) {
      var arr = list || []
      var max = 0
      arr.forEach(function (item) {
        var amt = parseFloat(item.totalAmount) || 0
        if (amt > max) max = amt
      })

      var processed = arr.map(function (item) {
        var amt = parseFloat(item.totalAmount) || 0
        return {
          period: item.period,
          totalAmountDisplay: formatPrice(amt),
          paidAmountDisplay: formatPrice(item.paidAmount),
          unpaidAmountDisplay: formatPrice(item.unpaidAmount),
          orderCount: item.orderCount || 0,
          ratio: max > 0 ? Math.round((amt / max) * 100) : 0
        }
      })

      that.setData({
        trendList: processed,
        maxAmount: max,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onDimensionTap: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ activeDimension: key })
    this.loadTrend()
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value })
    this.loadAll()
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value })
    this.loadAll()
  },

  goDebtRanking: function () {
    wx.navigateTo({ url: '/pages/stats/debt/debt' })
  },

  goProductAnalysis: function () {
    wx.navigateTo({ url: '/pages/stats/product/product' })
  }
})
