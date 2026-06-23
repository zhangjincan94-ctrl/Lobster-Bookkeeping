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
    bestProduct: null,
    totalAmountDisplay: '¥0.00',
    totalCostDisplay: '¥0.00',
    totalProfitDisplay: '¥0.00',
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

  buildProductList: function (arr) {
    var maxProfit = 0
    arr.forEach(function (item) {
      var profit = parseFloat(item.profitAmount) || 0
      if (profit > maxProfit) maxProfit = profit
    })

    return arr.map(function (item) {
      var amount = parseFloat(item.totalAmount) || 0
      var cost = parseFloat(item.totalCost) || 0
      var profit = parseFloat(item.profitAmount) || 0
      var weight = parseFloat(item.totalWeight) || 0
      var orders = parseInt(item.orderCount, 10) || 0
      var margin = amount > 0 ? profit / amount : 0

      return {
        lobsterSize: item.lobsterSize || '未指定',
        orderCount: orders,
        totalWeightDisplay: weight.toFixed(2),
        totalAmountDisplay: formatPrice(amount),
        totalCostDisplay: formatPrice(cost),
        profitAmount: profit,
        profitAmountDisplay: formatPrice(profit),
        profitRatioDisplay: ((parseFloat(item.profitRatio) || 0) * 100).toFixed(1) + '%',
        marginDisplay: (margin * 100).toFixed(1) + '%',
        barPercent: maxProfit > 0 ? Math.max(4, Math.round(profit / maxProfit * 100)) : 0,
        costMissing: item.costStatus === 'missing'
      }
    }).sort(function (a, b) {
      return b.profitAmount - a.profitAmount
    })
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
      var totalCost = 0
      var totalProfit = 0
      arr.forEach(function (item) {
        totalAmount += parseFloat(item.totalAmount) || 0
        totalCost += parseFloat(item.totalCost) || 0
        totalProfit += parseFloat(item.profitAmount) || 0
      })

      var processed = that.buildProductList(arr)
      that.setData({
        list: processed,
        bestProduct: processed.length > 0 ? processed[0] : null,
        totalAmountDisplay: formatPrice(totalAmount),
        totalCostDisplay: formatPrice(totalCost),
        totalProfitDisplay: formatPrice(totalProfit),
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
