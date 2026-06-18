var { get } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function formatDateInput(d) {
  var y = d.getFullYear()
  var m = d.getMonth() + 1
  var day = d.getDate()
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}

Page({
  data: {
    startDate: '',
    endDate: '',
    list: [],
    totalAmountDisplay: '¥0.00',
    totalWeightDisplay: '0.00',
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
    this.loadData()
  },

  onPullDownRefresh: function () {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  loadData: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    get(config.api.statsProductAnalysis, {
      startDate: this.data.startDate,
      endDate: this.data.endDate
    }).then(function (list) {
      var arr = list || []
      var totalAmount = 0
      var totalWeight = 0
      arr.forEach(function (item) {
        totalAmount += parseFloat(item.totalAmount) || 0
        totalWeight += parseFloat(item.totalWeight) || 0
      })

      var processed = arr.map(function (item) {
        var ratio = parseFloat(item.ratio) || 0
        return {
          lobsterSize: item.lobsterSize || '未指定',
          orderCount: item.orderCount || 0,
          totalWeightDisplay: (parseFloat(item.totalWeight) || 0).toFixed(2),
          totalAmountDisplay: formatPrice(item.totalAmount),
          ratioDisplay: (ratio * 100).toFixed(1) + '%',
          ratioPercent: Math.round(ratio * 100)
        }
      })

      that.setData({
        list: processed,
        totalAmountDisplay: formatPrice(totalAmount),
        totalWeightDisplay: totalWeight.toFixed(2),
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value })
    this.loadData()
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value })
    this.loadData()
  }
})
