var { get, del } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function numberText(value) {
  return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function money(value) {
  return '¥' + numberText(value)
}

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
    totalDisplay: money(amount),
    itemCount: item.itemCount || (item.items || []).length,
    detailExpanded: expansionState.bills[billId] === undefined ? true : expansionState.bills[billId],
    items: (item.items || []).map(function (line) {
      return {
        id: line.id,
        productName: line.productName || '未命名商品',
        quantityDisplay: numberText(line.quantity),
        unitPriceDisplay: numberText(line.unitPrice),
        subtotalDisplay: numberText(line.subtotal)
      }
    })
  }
}

function applySummary(group) {
  group.saleTotal = roundMoney(group.saleTotal)
  group.purchaseTotal = roundMoney(group.purchaseTotal)
  group.netTotal = roundMoney(group.saleTotal - group.purchaseTotal)
  group.saleDisplay = money(group.saleTotal)
  group.purchaseDisplay = money(group.purchaseTotal)
  group.netDisplay = money(group.netTotal)
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

function fetchAllBills(direction, page, collected) {
  return get(config.api.ledgerBillList, { page: page, pageSize: 100, direction: direction }).then(function (data) {
    var list = (data && data.list) || []
    var all = collected.concat(list)
    var total = parseInt(data && data.total, 10) || all.length
    if (list.length && all.length < total) return fetchAllBills(direction, page + 1, all)
    return all
  })
}

Page({
  data: {
    direction: '',
    months: [],
    loading: false,
    hasLoaded: false,
    deletingBillId: ''
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadBills()
  },

  loadBills: function () {
    var that = this
    var requestId = (this._loadRequestId || 0) + 1
    this._loadRequestId = requestId
    this.setData({ loading: true })
    return fetchAllBills(this.data.direction, 1, []).then(function (bills) {
      if (requestId !== that._loadRequestId) return
      that.setData({
        months: buildMonthGroups(bills, that.data.months),
        loading: false,
        hasLoaded: true,
        deletingBillId: ''
      })
    }).catch(function (err) {
      if (requestId !== that._loadRequestId) return
      console.warn('[总账本加载失败]', {
        feature: '总账本月份日期分组',
        reason: err && err.message ? err.message : '请求失败',
        direction: that.data.direction
      })
      that.setData({ loading: false, hasLoaded: true, months: [], deletingBillId: '' })
    })
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
    var path = 'months[' + monthIndex + '].days[' + dayIndex + '].bills[' + billIndex + '].detailExpanded'
    var bill = this.data.months[monthIndex].days[dayIndex].bills[billIndex]
    this.setData({ [path]: !bill.detailExpanded })
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
    this.loadBills().then(function () { wx.stopPullDownRefresh() })
  }
})
