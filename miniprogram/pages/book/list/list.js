var { get, del } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var { formatPrice, formatNumber } = require('../../../utils/format')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

function roundMoney(value) {
  return Math.round(value * 100) / 100
}

function collectExpansionState(months) {
  var state = { months: {}, days: {}, bills: {} }
  ;(months || []).forEach(function (month) {
    state.months[month.key] = month.expanded
    ;(month.days || []).forEach(function (day) {
      state.days[day.key] = day.expanded
      ;(day.bills || []).forEach(function (bill) {
        state.bills[String(bill.id)] = bill.detailExpanded
      })
    })
  })
  return state
}

function mapDetailItems(items) {
  return (items || []).map(function (line) {
    return {
      id: line.id,
      productName: line.productName || '未命名商品',
      quantityDisplay: formatNumber(line.quantity),
      unitPriceDisplay: formatNumber(line.unitPrice),
      subtotalDisplay: formatNumber(line.subtotal)
    }
  })
}

function mapBill(item, expansionState) {
  var amount = roundMoney(parseFloat(item.totalAmount) || 0)
  var billId = String(item.id)
  return {
    id: item.id,
    customerName: item.customerName || '未命名往来对象',
    billDate: item.billDate || '',
    direction: item.direction,
    directionText: item.direction === 'purchase' ? '进货' : '出货',
    directionClass: item.direction === 'purchase' ? 'purchase' : 'sale',
    totalAmount: amount,
    totalDisplay: formatPrice(amount),
    itemCount: parseInt(item.itemCount, 10) || 0,
    detailExpanded: expansionState.bills[billId] === undefined ? false : expansionState.bills[billId],
    detailLoading: false,
    itemsLoaded: Boolean(item.itemsLoaded),
    items: mapDetailItems(item.items)
  }
}

function applySummary(group) {
  group.saleTotal = roundMoney(group.saleTotal)
  group.purchaseTotal = roundMoney(group.purchaseTotal)
  group.netTotal = roundMoney(group.saleTotal - group.purchaseTotal)
  group.saleDisplay = formatPrice(group.saleTotal)
  group.purchaseDisplay = formatPrice(group.purchaseTotal)
  group.netDisplay = formatPrice(group.netTotal)
  group.netClass = group.netTotal < 0 ? 'negative' : 'positive'
  return group
}

function buildMonthGroups(rawBills, previousMonths) {
  var expansionState = collectExpansionState(previousMonths)
  var monthMap = {}

  ;(rawBills || []).forEach(function (rawBill) {
    if (!rawBill.billDate || rawBill.billDate.length < 10) {
      console.warn('[总账本账单分组失败]', {
        feature: '总账本月份日期分组',
        reason: '账单日期为空或格式不正确',
        billId: rawBill.id,
        billDate: rawBill.billDate || ''
      })
      return
    }
    var bill = mapBill(rawBill, expansionState)
    var monthKey = bill.billDate.slice(0, 7)
    var dayKey = bill.billDate.slice(0, 10)
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = {
        key: monthKey,
        label: monthKey,
        saleTotal: 0,
        purchaseTotal: 0,
        expanded: expansionState.months[monthKey] || false,
        dayMap: {}
      }
    }
    var month = monthMap[monthKey]
    if (!month.dayMap[dayKey]) {
      month.dayMap[dayKey] = {
        key: dayKey,
        label: dayKey.slice(5),
        saleTotal: 0,
        purchaseTotal: 0,
        billCount: 0,
        expanded: expansionState.days[dayKey] || false,
        bills: []
      }
    }
    var day = month.dayMap[dayKey]
    if (bill.direction === 'purchase') {
      month.purchaseTotal += bill.totalAmount
      day.purchaseTotal += bill.totalAmount
    } else {
      month.saleTotal += bill.totalAmount
      day.saleTotal += bill.totalAmount
    }
    day.billCount += 1
    day.bills.push(bill)
  })

  return Object.keys(monthMap).sort().reverse().map(function (monthKey) {
    var month = monthMap[monthKey]
    month.days = Object.keys(month.dayMap).sort().reverse().map(function (dayKey) {
      return applySummary(month.dayMap[dayKey])
    })
    delete month.dayMap
    return applySummary(month)
  })
}

function fetchBillPage(direction, page) {
  return get(config.api.ledgerBillList, { page: page, pageSize: 30, direction: direction }, { silent: true })
}

function findBillPath(months, billId) {
  for (var monthIndex = 0; monthIndex < months.length; monthIndex++) {
    var days = months[monthIndex].days || []
    for (var dayIndex = 0; dayIndex < days.length; dayIndex++) {
      var bills = days[dayIndex].bills || []
      for (var billIndex = 0; billIndex < bills.length; billIndex++) {
        if (String(bills[billIndex].id) === String(billId)) {
          return {
            bill: bills[billIndex],
            base: 'months[' + monthIndex + '].days[' + dayIndex + '].bills[' + billIndex + ']'
          }
        }
      }
    }
  }
  return null
}

Page({
  data: {
    theme: '',
    direction: '',
    months: [],
    loading: false,
    loadingMore: false,
    hasLoaded: false,
    error: '',
    deletingBillId: '',
    loadedCount: 0,
    totalCount: 0,
    hasMore: false
  },

  onShow: function () {
    this.setData({ theme: theme.get() })
    if (!checkLogin()) return
    this.loadBills()
  },

  applyBillPage: function (requestId, page, list, total) {
    if (requestId !== this._loadRequestId) return
    this._bills = page === 1 ? list : this._bills.concat(list)
    this._page = page
    var loadedCount = this._bills.length
    this.setData({
      months: buildMonthGroups(this._bills, this.data.months),
      loading: false,
      loadingMore: false,
      hasLoaded: true,
      error: '',
      deletingBillId: '',
      loadedCount: loadedCount,
      totalCount: total,
      hasMore: loadedCount < total && list.length > 0
    })
  },

  loadBills: function () {
    var that = this
    var requestId = (this._loadRequestId || 0) + 1
    this._loadRequestId = requestId
    this.setData({ loading: true, loadingMore: false })
    return fetchBillPage(this.data.direction, 1).then(function (data) {
      if (requestId !== that._loadRequestId) return
      var list = (data && data.list) || []
      that.applyBillPage(requestId, 1, list, parseInt(data && data.total, 10) || 0)
    }).catch(function (err) {
      if (requestId !== that._loadRequestId) return
      console.warn('[总账本加载失败]', {
        feature: '总账本月份日期分组',
        reason: err && err.message ? err.message : '请求失败',
        direction: that.data.direction
      })
      var hasLoaded = that.data.hasLoaded
      that.setData({
        loading: false,
        loadingMore: false,
        deletingBillId: '',
        error: hasLoaded ? '刷新失败，正在显示上次数据' : '加载失败，请检查网络后重试',
        months: hasLoaded ? that.data.months : [],
        loadedCount: hasLoaded ? that.data.loadedCount : 0,
        totalCount: hasLoaded ? that.data.totalCount : 0,
        hasMore: hasLoaded ? that.data.hasMore : false
      })
      if (!hasLoaded) that._bills = []
    })
  },

  retry: function () {
    return this.loadBills()
  },

  loadMore: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return Promise.resolve()
    var that = this
    var requestId = this._loadRequestId
    var nextPage = (this._page || 1) + 1
    this.setData({ loadingMore: true })
    return fetchBillPage(this.data.direction, nextPage).then(function (data) {
      if (requestId !== that._loadRequestId) return
      var list = (data && data.list) || []
      that.applyBillPage(requestId, nextPage, list, parseInt(data && data.total, 10) || 0)
    }).catch(function (err) {
      if (requestId !== that._loadRequestId) return
      console.warn('[总账本加载更多失败]', {
        feature: '总账本月份日期分组',
        reason: err && err.message ? err.message : '请求失败',
        direction: that.data.direction
      })
      that.setData({ loadingMore: false, error: '加载更多失败，正在显示已有数据' })
    })
  },

  onReachBottom: function () {
    return this.loadMore()
  },

  chooseDirection: function (e) {
    var that = this
    this.setData({ direction: e.currentTarget.dataset.direction }, function () {
      that.loadBills()
    })
  },

  toggleMonth: function (e) {
    var index = e.currentTarget.dataset.monthIndex
    var path = 'months[' + index + '].expanded'
    this.setData({ [path]: !this.data.months[index].expanded })
  },

  toggleDay: function (e) {
    var monthIndex = e.currentTarget.dataset.monthIndex
    var dayIndex = e.currentTarget.dataset.dayIndex
    var path = 'months[' + monthIndex + '].days[' + dayIndex + '].expanded'
    this.setData({ [path]: !this.data.months[monthIndex].days[dayIndex].expanded })
  },

  toggleBillDetail: function (e) {
    var monthIndex = e.currentTarget.dataset.monthIndex
    var dayIndex = e.currentTarget.dataset.dayIndex
    var billIndex = e.currentTarget.dataset.billIndex
    var bill = this.data.months[monthIndex].days[dayIndex].bills[billIndex]
    if (!bill) return
    var base = 'months[' + monthIndex + '].days[' + dayIndex + '].bills[' + billIndex + ']'
    if (bill.detailExpanded || bill.detailLoading) {
      this.setData({ [base + '.detailExpanded']: false })
      return
    }
    if (bill.itemsLoaded) {
      this.setData({ [base + '.detailExpanded']: true })
      return
    }
    var that = this
    this.setData({ [base + '.detailExpanded']: true, [base + '.detailLoading']: true })
    get(config.api.ledgerBillDetail(bill.id), {}, { silent: true }).then(function (detail) {
      var items = (detail && detail.items) || []
      that._bills.forEach(function (rawBill) {
        if (String(rawBill.id) === String(bill.id)) {
          rawBill.items = items
          rawBill.itemCount = items.length
          rawBill.itemsLoaded = true
        }
      })
      var located = findBillPath(that.data.months, bill.id)
      if (!located) return
      var updates = {}
      updates[located.base + '.items'] = mapDetailItems(items)
      updates[located.base + '.itemCount'] = items.length
      updates[located.base + '.itemsLoaded'] = true
      updates[located.base + '.detailLoading'] = false
      that.setData(updates)
    }).catch(function (err) {
      console.warn('[账单明细加载失败]', {
        feature: '总账本查看账单明细',
        reason: err && err.message ? err.message : '请求失败',
        billId: bill.id
      })
      var located = findBillPath(that.data.months, bill.id)
      if (located) {
        var updates = {}
        updates[located.base + '.detailLoading'] = false
        updates[located.base + '.detailExpanded'] = false
        that.setData(updates)
      }
      wx.showToast({ title: '明细加载失败，请重试', icon: 'none' })
    })
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id) {
      console.warn('[账单详情打开失败]', { feature: '总账本查看账单', reason: '缺少账单ID' })
      return
    }
    wx.navigateTo({
      url: '/pages/book/detail/detail?id=' + id,
      fail: function (err) {
        console.error('[账单详情打开失败]', {
          feature: '总账本查看账单',
          reason: err && err.errMsg ? err.errMsg : '页面跳转失败',
          billId: id
        })
      }
    })
  },

  deleteBill: function (e) {
    var id = e.currentTarget.dataset.id
    if (!id || this.data.deletingBillId) return
    var that = this
    wx.showModal({
      title: '删除账单',
      content: '删除后该账单不会再计入总账本，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#ff6868',
      success: function (result) {
        if (!result.confirm) return
        that.setData({ deletingBillId: String(id) })
        del(config.api.ledgerBillDelete(id), {}).then(function () {
          wx.showToast({ title: '账单已删除', icon: 'success' })
          that.loadBills()
        }).catch(function (err) {
          console.warn('[账单删除失败]', {
            feature: '总账本删除账单',
            reason: err && err.message ? err.message : '请求失败',
            billId: id
          })
          that.setData({ deletingBillId: '' })
        })
      },
      fail: function (err) {
        console.warn('[删除确认框打开失败]', {
          feature: '总账本删除账单',
          reason: err && err.errMsg ? err.errMsg : '弹窗打开失败',
          billId: id
        })
      }
    })
  },

  goAdd: function () {
    wx.switchTab({ url: '/pages/book/add/add' })
  },

  onPullDownRefresh: function () {
    return this.loadBills().then(function () { wx.stopPullDownRefresh() }, function () { wx.stopPullDownRefresh() })
  }
})
