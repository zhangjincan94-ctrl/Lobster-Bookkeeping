var { get, put } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function today() {
  var date = new Date()
  var month = date.getMonth() + 1
  var day = date.getDate()
  return date.getFullYear() + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day)
}

function money(value) {
  return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2)
}

Page({
  data: {
    billId: '',
    editing: true,
    loadingBill: true,
    billDate: '',
    direction: 'sale',
    customerId: '',
    customerName: '',
    products: [],
    items: [],
    remark: '',
    totalAmount: '0.00',
    submitting: false,
    rowSeed: 0,
    activeProductRowIndex: -1
  },

  onLoad: function (options) {
    var billId = options && options.id ? options.id : ''
    this.setData({ billId: billId })
    if (!billId) {
      console.warn('[账单修改页面打开失败]', {
        feature: '修改账单',
        reason: '缺少账单ID',
        targetPage: 'pages/book/edit/edit'
      })
      this.setData({ loadingBill: false })
      wx.showToast({ title: '缺少账单信息', icon: 'none' })
      return
    }
    var app = getApp()
    var snapshot = app.globalData.pendingBillEdit
    app.globalData.pendingBillEdit = null
    if (snapshot && this.applyBill(snapshot, 'detail-page')) {
      this._hasBillSnapshot = true
      wx.hideLoading()
      return
    }
    this.loadBill()
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadProducts()
  },

  loadBill: function () {
    var that = this
    get(config.api.ledgerBillDetail(this.data.billId), {}).then(function (bill) {
      if (!that._hasBillSnapshot) that.applyBill(bill, 'server')
      wx.hideLoading()
    }).catch(function (err) {
      console.warn('[账单修改数据加载失败]', {
        feature: '修改账单',
        reason: err && err.message ? err.message : '请求失败',
        billId: that.data.billId
      })
      if (!that._hasBillSnapshot) that.setData({ loadingBill: false })
      wx.hideLoading()
    })
  },

  applyBill: function (bill, source) {
    if (!bill) {
      console.warn('[账单修改数据填充失败]', {
        feature: '修改账单',
        reason: '账单数据为空',
        billId: this.data.billId,
        source: source
      })
      return false
    }
    if (bill.id && String(bill.id) !== String(this.data.billId)) {
      console.warn('[账单修改数据填充失败]', {
        feature: '修改账单',
        reason: '账单ID不匹配',
        billId: this.data.billId,
        receivedBillId: bill.id,
        source: source
      })
      return false
    }
    var items = (bill.items || []).map(function (item, index) {
      return {
        rowId: 'row-' + (index + 1),
        productId: item.productId || '',
        productName: item.productName || '',
        unit: item.unit || '斤',
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        subtotal: money(item.subtotal)
      }
    })
    this.setData({
      billDate: bill.billDate,
      direction: bill.direction,
      customerId: bill.customerId,
      customerName: bill.customerName,
      items: items,
      remark: bill.remark || '',
      totalAmount: money(bill.totalAmount),
      rowSeed: items.length,
      loadingBill: false
    })
    return true
  },

  loadProducts: function () {
    var that = this
    get(config.api.ledgerProductList, { pageSize: 100 }).then(function (data) {
      that.setData({ products: (data && data.list) || [] })
    }).catch(function (err) {
      console.warn('[账单修改商品库加载失败]', {
        feature: '修改账单',
        reason: err && err.message ? err.message : '请求失败',
        billId: that.data.billId
      })
      that.setData({ products: [] })
    })
  },

  setDirection: function (e) { this.setData({ direction: e.currentTarget.dataset.direction }) },
  onDateChange: function (e) { this.setData({ billDate: e.detail.value }) },
  chooseToday: function () { this.setData({ billDate: today() }) },

  chooseYesterday: function () {
    var date = new Date()
    date.setDate(date.getDate() - 1)
    var month = date.getMonth() + 1
    var day = date.getDate()
    this.setData({ billDate: date.getFullYear() + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day) })
  },

  openCustomerModal: function () {
    wx.navigateTo({
      url: '/pages/customer/select/select',
      fail: function (err) {
        console.error('[客户选择页面打开失败]', {
          feature: '修改账单选择客户',
          reason: err && err.errMsg ? err.errMsg : '页面跳转失败',
          targetPage: 'pages/customer/select/select'
        })
        wx.showToast({ title: '客户页面打开失败', icon: 'none' })
      }
    })
  },

  onCustomerSelected: function (customer) {
    if (!customer || !customer.id) return
    this.setData({ customerId: customer.id, customerName: customer.name || '' })
  },

  onProductSelected: function (product, rowIndex) {
    if (!product || rowIndex < 0 || !this.data.items[rowIndex]) return
    var items = this.data.items.slice()
    items[rowIndex].productId = product.id
    items[rowIndex].productName = product.name
    items[rowIndex].unit = product.unit || '斤'
    items[rowIndex].unitPrice = product.defaultUnitPrice === null || product.defaultUnitPrice === undefined ? '' : String(product.defaultUnitPrice)
    items[rowIndex].subtotal = money((parseFloat(items[rowIndex].quantity) || 0) * (parseFloat(items[rowIndex].unitPrice) || 0))
    this.setData({ items: items, activeProductRowIndex: rowIndex })
    this.refreshTotal()
  },

  addEmptyItem: function () {
    var rowId = this.data.rowSeed + 1
    var items = this.data.items.concat([{
      rowId: 'row-' + rowId,
      productId: '',
      productName: '',
      unit: '斤',
      quantity: '',
      unitPrice: '',
      subtotal: '0.00'
    }])
    this.setData({ items: items, rowSeed: rowId })
  },

  onProductNameFocus: function (e) {
    this.setData({ activeProductRowIndex: Number(e.currentTarget.dataset.index) })
  },

  onProductNameInput: function (e) {
    var index = Number(e.currentTarget.dataset.index)
    var items = this.data.items.slice()
    if (!items[index]) return
    var name = e.detail.value
    var matched = this.data.products.filter(function (product) { return product.name === name.trim() })[0]
    items[index].productName = name
    items[index].productId = matched ? matched.id : ''
    items[index].unit = matched ? (matched.unit || '斤') : '斤'
    this.setData({ items: items, activeProductRowIndex: index })
  },

  goProductLibrary: function () {
    var rowIndex = this.data.activeProductRowIndex
    if (rowIndex < 0 || !this.data.items[rowIndex]) {
      rowIndex = this.data.items.length
      this.addEmptyItem()
      this.setData({ activeProductRowIndex: rowIndex })
    }
    wx.navigateTo({ url: '/pages/product/list/list?select=1&row=' + rowIndex })
  },

  onItemInput: function (e) {
    var index = e.currentTarget.dataset.index
    var field = e.currentTarget.dataset.field
    var items = this.data.items.slice()
    if (!items[index]) return
    items[index][field] = e.detail.value
    items[index].subtotal = money((parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].unitPrice) || 0))
    this.setData({ items: items })
    this.refreshTotal()
  },

  removeItem: function (e) {
    var items = this.data.items.slice()
    items.splice(e.currentTarget.dataset.index, 1)
    this.setData({ items: items })
    this.refreshTotal()
  },

  clearItems: function () {
    if (!this.data.items.length) return
    var that = this
    wx.showModal({
      title: '清空商品',
      content: '确定清空当前账单的全部商品吗？',
      success: function (res) {
        if (res.confirm) that.setData({ items: [], totalAmount: '0.00' })
      }
    })
  },

  refreshTotal: function () {
    var total = this.data.items.reduce(function (sum, item) {
      return sum + (parseFloat(item.subtotal) || 0)
    }, 0)
    this.setData({ totalAmount: money(total) })
  },

  onRemarkInput: function (e) { this.setData({ remark: e.detail.value }) },

  submit: function () {
    if (this.data.submitting) return
    if (!this.data.customerId) {
      console.warn('[账单保存校验失败]', { feature: '修改账单', reason: '未选择客户', billId: this.data.billId })
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return
    }
    if (!this.data.items.length) {
      console.warn('[账单保存校验失败]', { feature: '修改账单', reason: '没有商品明细', billId: this.data.billId })
      wx.showToast({ title: '请添加商品', icon: 'none' })
      return
    }
    var items = this.data.items.map(function (item) {
      return {
        productId: item.productId,
        productName: String(item.productName || '').trim(),
        unit: item.unit || '斤',
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }
    })
    var emptyProductIndex = items.findIndex(function (item) { return !item.productName })
    if (emptyProductIndex >= 0) {
      console.warn('[账单保存校验失败]', {
        feature: '修改账单', reason: '商品名称为空', billId: this.data.billId,
        rowIndex: emptyProductIndex, rowId: this.data.items[emptyProductIndex].rowId
      })
      wx.showModal({ title: '商品未填写', content: '请填写第 ' + (emptyProductIndex + 1) + ' 行的商品名称', showCancel: false })
      return
    }
    var invalidIndex = items.findIndex(function (item) {
      return !(parseFloat(item.quantity) > 0) || parseFloat(item.unitPrice) < 0 || item.unitPrice === ''
    })
    if (invalidIndex >= 0) {
      console.warn('[账单保存校验失败]', {
        feature: '修改账单', reason: '商品数量或单价无效', billId: this.data.billId,
        rowIndex: invalidIndex, quantity: items[invalidIndex].quantity, unitPrice: items[invalidIndex].unitPrice
      })
      wx.showToast({ title: '请检查数量和单价', icon: 'none' })
      return
    }

    var that = this
    this.setData({ submitting: true })
    put(config.api.ledgerBillUpdate(this.data.billId), {
      customerId: this.data.customerId,
      direction: this.data.direction,
      billDate: this.data.billDate,
      items: items,
      remark: this.data.remark.trim()
    }).then(function () {
      that.setData({ submitting: false })
      wx.showToast({ title: '账单已修改', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack({
          fail: function (err) {
            console.error('[账单修改返回失败]', {
              feature: '修改账单',
              reason: err && err.errMsg ? err.errMsg : '页面返回失败',
              billId: that.data.billId
            })
          }
        })
      }, 400)
    }).catch(function () { that.setData({ submitting: false }) })
  },

  noop: function () {}
})
