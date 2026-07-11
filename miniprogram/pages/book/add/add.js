var { get, post } = require('../../../utils/request')
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
    billDate: '',
    direction: 'sale',
    customerId: '',
    customerName: '',
    customers: [],
    products: [],
    items: [],
    remark: '',
    totalAmount: '0.00',
    showCustomerModal: false,
    showProductModal: false,
    showCustomerCreate: false,
    customerKeyword: '',
    productKeyword: '',
    newCustomerName: '',
    newCustomerPhone: '',
    submitting: false,
    creatingCustomer: false,
    rowSeed: 0
  },

  onLoad: function () {
    this.setData({ billDate: today() })
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadCustomers()
    this.loadProducts()
  },

  loadCustomers: function () {
    var that = this
    get(config.api.ledgerCustomerList, { pageSize: 100, keyword: this.data.customerKeyword }).then(function (data) {
      that.setData({ customers: (data && data.list) || [] })
    }).catch(function () {
      that.setData({ customers: [] })
    })
  },

  loadProducts: function () {
    var that = this
    get(config.api.ledgerProductList, { pageSize: 100, keyword: this.data.productKeyword }).then(function (data) {
      that.setData({ products: (data && data.list) || [] })
    }).catch(function () {
      that.setData({ products: [] })
    })
  },

  setDirection: function (e) {
    this.setData({ direction: e.currentTarget.dataset.direction })
  },

  onDateChange: function (e) {
    this.setData({ billDate: e.detail.value })
  },

  chooseToday: function () {
    this.setData({ billDate: today() })
  },

  chooseYesterday: function () {
    var date = new Date()
    date.setDate(date.getDate() - 1)
    var month = date.getMonth() + 1
    var day = date.getDate()
    this.setData({ billDate: date.getFullYear() + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day) })
  },

  openCustomerModal: function () {
    this.setData({ showCustomerModal: true, customerKeyword: '' })
    this.loadCustomers()
  },

  closeCustomerModal: function () {
    this.setData({ showCustomerModal: false })
  },

  onCustomerSearch: function (e) {
    this.setData({ customerKeyword: e.detail.value })
    this.loadCustomers()
  },

  selectCustomer: function (e) {
    var customer = this.data.customers[e.currentTarget.dataset.index]
    if (!customer) return
    this.setData({ customerId: customer.id, customerName: customer.name, showCustomerModal: false })
  },

  openCustomerCreate: function () {
    this.setData({ showCustomerCreate: true, newCustomerName: '', newCustomerPhone: '' })
  },

  closeCustomerCreate: function () {
    if (!this.data.creatingCustomer) this.setData({ showCustomerCreate: false })
  },

  onNewCustomerNameInput: function (e) {
    this.setData({ newCustomerName: e.detail.value })
  },

  onNewCustomerPhoneInput: function (e) {
    this.setData({ newCustomerPhone: e.detail.value })
  },

  createCustomer: function () {
    var name = this.data.newCustomerName.trim()
    if (!name || this.data.creatingCustomer) {
      if (!name) wx.showToast({ title: '请输入客户名称', icon: 'none' })
      return
    }
    var that = this
    this.setData({ creatingCustomer: true })
    post(config.api.ledgerCustomerAdd, { name: name, phone: this.data.newCustomerPhone.trim() }).then(function (customer) {
      that.setData({
        customerId: customer.id,
        customerName: customer.name,
        showCustomerCreate: false,
        showCustomerModal: false,
        creatingCustomer: false
      })
      that.loadCustomers()
    }).catch(function () {
      that.setData({ creatingCustomer: false })
    })
  },

  openProductModal: function () {
    this.setData({ showProductModal: true, productKeyword: '' })
    this.loadProducts()
  },

  closeProductModal: function () {
    this.setData({ showProductModal: false })
  },

  onProductSearch: function (e) {
    this.setData({ productKeyword: e.detail.value })
    this.loadProducts()
  },

  selectProduct: function (e) {
    var product = this.data.products[e.currentTarget.dataset.index]
    if (!product) return
    var rowId = this.data.rowSeed + 1
    var items = this.data.items.concat([{
      rowId: rowId,
      productId: product.id,
      productName: product.name,
      unit: product.unit || '件',
      quantity: '1',
      unitPrice: product.defaultUnitPrice === null || product.defaultUnitPrice === undefined ? '' : String(product.defaultUnitPrice),
      subtotal: money(product.defaultUnitPrice)
    }])
    this.setData({ items: items, rowSeed: rowId, showProductModal: false })
    this.refreshTotal()
  },

  goProductLibrary: function () {
    this.setData({ showProductModal: false })
    wx.navigateTo({ url: '/pages/product/list/list' })
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
    var index = e.currentTarget.dataset.index
    var items = this.data.items.slice()
    items.splice(index, 1)
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
        if (res.confirm) {
          that.setData({ items: [], totalAmount: '0.00' })
        }
      }
    })
  },

  refreshTotal: function () {
    var total = this.data.items.reduce(function (sum, item) {
      return sum + (parseFloat(item.subtotal) || 0)
    }, 0)
    this.setData({ totalAmount: money(total) })
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  submit: function () {
    if (this.data.submitting) return
    if (!this.data.customerId) {
      wx.showToast({ title: '请选择客户', icon: 'none' })
      return
    }
    if (!this.data.items.length) {
      wx.showToast({ title: '请添加商品', icon: 'none' })
      return
    }
    var items = this.data.items.map(function (item) {
      return { productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice }
    })
    var invalid = items.some(function (item) {
      return !(parseFloat(item.quantity) > 0) || parseFloat(item.unitPrice) < 0 || item.unitPrice === ''
    })
    if (invalid) {
      wx.showToast({ title: '请检查商品数量和单价', icon: 'none' })
      return
    }
    var that = this
    this.setData({ submitting: true })
    post(config.api.ledgerBillAdd, {
      customerId: this.data.customerId,
      direction: this.data.direction,
      billDate: this.data.billDate,
      items: items,
      remark: this.data.remark.trim()
    }).then(function () {
      wx.showToast({ title: '账单已保存', icon: 'success' })
      that.setData({ customerId: '', customerName: '', items: [], remark: '', totalAmount: '0.00', submitting: false })
      wx.switchTab({ url: '/pages/book/list/list' })
    }).catch(function () {
      that.setData({ submitting: false })
    })
  },

  noop: function () {}
})
