var { get } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

function dateText(date) {
  var month = date.getMonth() + 1
  var day = date.getDate()
  return date.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day
}

// 占比保留一位小数，避免 25 元 / 5700 元被四舍五入成 0% 这种失真
function percentValue(value, total) {
  if (!total) return 0
  return Math.round(value / total * 1000) / 10
}

function percentText(value, total) {
  if (!total) return '0%'
  var ratio = value / total * 100
  if (ratio > 0 && ratio < 0.1) return '<0.1%'
  if (ratio < 100 && ratio > 99.9) return '>99.9%'
  return (Math.round(ratio * 10) / 10) + '%'
}

function change(current, previous) {
  if (!previous) return current ? '上期无交易' : '与上期持平'
  var rate = Math.round((current - previous) / previous * 100)
  return rate > 0 ? '较上期 +' + rate + '%' : rate < 0 ? '较上期 ' + rate + '%' : '与上期持平'
}

// 非零柱至少保留 1% 高度，保证极小金额也能被看到，同时不高估量级
function barHeight(amount, max) {
  if (!amount || !max) return 0
  return Math.max(1, Math.round(amount / max * 1000) / 10)
}

function buildBars(data) {
  var start = new Date(data.startDate + 'T12:00:00')
  var byDate = {}
  ;(data.daily || []).forEach(function (row) { byDate[row.date] = row })
  var bars = []
  var groupSize = data.days === 30 ? 5 : 1
  for (var i = 0; i < data.days; i++) {
    var current = new Date(start)
    current.setDate(start.getDate() + i)
    var key = dateText(current)
    var row = byDate[key] || {}
    var group = Math.floor(i / groupSize)
    if (!bars[group]) bars[group] = { label: key.slice(5), sale: 0, purchase: 0, count: 0 }
    bars[group].sale += Number(row.saleAmount) || 0
    bars[group].purchase += Number(row.purchaseAmount) || 0
    bars[group].count += Number(row.orderCount) || 0
  }
  var max = Math.max.apply(null, bars.map(function (bar) {
    return Math.max(bar.sale, bar.purchase)
  }).concat([0]))
  var result = bars.map(function (bar, index) {
    var last = new Date(start)
    last.setDate(start.getDate() + Math.min((index + 1) * groupSize, data.days) - 1)
    return {
      label: groupSize === 1 ? bar.label : bar.label + '—' + dateText(last).slice(5),
      sale: bar.sale,
      purchase: bar.purchase,
      saleDisplay: formatPrice(bar.sale),
      purchaseDisplay: formatPrice(bar.purchase),
      saleHeight: barHeight(bar.sale, max),
      purchaseHeight: barHeight(bar.purchase, max),
      count: bar.count
    }
  })
  return { bars: result, max: max }
}

function lastActiveIndex(bars) {
  for (var i = bars.length - 1; i >= 0; i--) {
    if (bars[i].count > 0) return i
  }
  return bars.length - 1
}

Page({
  data: {
    theme: '',
    days: 7,
    loading: false,
    error: false,
    empty: true,
    range: '',
    totalDisplay: '¥0.00',
    saleDisplay: '¥0.00',
    purchaseDisplay: '¥0.00',
    salePercent: 0,
    purchasePercent: 0,
    salePercentText: '0%',
    purchasePercentText: '0%',
    count: 0,
    saleChange: '',
    purchaseChange: '',
    insight: '',
    bars: [],
    axisMaxDisplay: '¥0.00',
    selectedIndex: 0,
    selectedBar: null
  },
  onShow: function () {
    this.setData({ theme: theme.get() })
    if (checkLogin()) this.loadStats()
  },
  onPullDownRefresh: function () {
    this.loadStats()
  },
  switchDays: function (e) {
    var days = Number(e.currentTarget.dataset.days)
    if (days === this.data.days) return
    this.setData({ days: days })
    this.loadStats()
  },
  selectBar: function (e) {
    var index = Number(e.currentTarget.dataset.index)
    if (!this.data.bars[index]) return
    this.setData({ selectedIndex: index, selectedBar: this.data.bars[index] })
  },
  loadStats: function () {
    var that = this
    var days = this.data.days
    var requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: false })
    get(config.api.ledgerTradeStats, { days: days, endDate: dateText(new Date()) }).then(function (data) {
      if (requestId !== that.requestId) return
      if (!data || !data.startDate || !Array.isArray(data.daily)) {
        console.warn('[交易统计加载失败]', { feature: '交易统计', reason: '响应缺少日期或趋势数据', days: days })
        that.setData({ loading: false, error: true })
        return
      }
      var sale = Number(data.saleAmount) || 0
      var purchase = Number(data.purchaseAmount) || 0
      var total = sale + purchase
      var built = buildBars(data)
      var bars = built.bars
      var priorSale = Number(data.previousSaleAmount) || 0
      var priorPurchase = Number(data.previousPurchaseAmount) || 0
      var selectedIndex = lastActiveIndex(bars)
      var insight = !total ? '本期暂无账单，切换周期可查看更长时间的交易。'
        : sale > purchase ? '出货额高于进货额；两者按账单日期汇总，不代表利润。'
          : purchase > sale ? '进货额高于出货额；留意库存与后续出货节奏。'
            : '出货与进货金额接近；可结合下方时间分布看交易节奏。'
      that.setData({
        loading: false,
        error: false,
        empty: !total,
        range: data.startDate + ' 至 ' + data.endDate,
        totalDisplay: formatPrice(total),
        saleDisplay: formatPrice(sale),
        purchaseDisplay: formatPrice(purchase),
        salePercent: percentValue(sale, total),
        purchasePercent: percentValue(purchase, total),
        salePercentText: percentText(sale, total),
        purchasePercentText: percentText(purchase, total),
        count: Number(data.orderCount) || 0,
        saleChange: change(sale, priorSale),
        purchaseChange: change(purchase, priorPurchase),
        insight: insight,
        bars: bars,
        axisMaxDisplay: formatPrice(built.max),
        selectedIndex: selectedIndex,
        selectedBar: bars[selectedIndex] || null
      })
      wx.nextTick(function () { that.drawRing(sale, purchase) })
    }).catch(function (err) {
      if (requestId !== that.requestId) return
      console.warn('[交易统计加载失败]', { feature: '交易统计', reason: err && err.message ? err.message : '请求失败', days: days })
      that.setData({ loading: false, error: true })
    }).then(function () { wx.stopPullDownRefresh() })
  },
  drawRing: function (sale, purchase) {
    var ctx = wx.createCanvasContext('tradeRing', this)
    var colors = theme.palette(this.data.theme)
    var total = sale + purchase
    var center = 92
    var radius = 66
    var lineWidth = 18
    ctx.setLineWidth(lineWidth)
    // 平头端点更贴近真实占比，圆头会把极小金额画成一个圆点，反而误导
    ctx.setLineCap('butt')
    ctx.setStrokeStyle(colors.track)
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.stroke()
    if (total > 0) {
      var start = -Math.PI / 2
      var segments = [
        { amount: sale, color: colors.sale },
        { amount: purchase, color: colors.purchase }
      ]
      segments.forEach(function (item) {
        if (!item.amount) return
        var end = start + Math.PI * 2 * item.amount / total
        ctx.setStrokeStyle(item.color)
        ctx.beginPath()
        ctx.arc(center, center, radius, start, end)
        ctx.stroke()
        start = end
      })
    }
    ctx.draw()
  }
})
