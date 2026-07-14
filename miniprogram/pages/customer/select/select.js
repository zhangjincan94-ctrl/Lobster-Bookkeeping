var { get, post } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function amount(value) { return (parseFloat(value) || 0).toFixed(2) }

Page({
  data: {
    keyword: '',
    customers: [],
    loading: false,
    showAdd: false,
    newName: '',
    newPhone: '',
    creating: false
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadCustomers()
  },

  loadCustomers: function () {
    var that = this
    this.setData({ loading: true })
    get(config.api.ledgerCustomerList, {
      pageSize: 100,
      keyword: this.data.keyword
    }).then(function (data) {
      var customers = ((data && data.list) || []).map(function (item) {
        var balance = parseFloat(item.balance) || 0
        item.balanceDisplay = '¥' + amount(Math.abs(balance))
        item.balanceLabel = balance > 0 ? '待收' : (balance < 0 ? '待付' : '已平')
        item.balanceClass = balance > 0 ? 'receivable' : (balance < 0 ? 'payable' : 'settled')
        return item
      })
      that.setData({ customers: customers, loading: false })
    }).catch(function (err) {
      console.warn('[客户选择列表加载失败]', {
        feature: '开单选择客户',
        reason: err && err.message ? err.message : '请求失败',
        keyword: that.data.keyword
      })
      that.setData({ customers: [], loading: false })
    })
  },

  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadCustomers() },
  openAdd: function () { this.setData({ showAdd: true, newName: '', newPhone: '', creating: false }) },
  closeAdd: function () { if (!this.data.creating) this.setData({ showAdd: false }) },
  onNameInput: function (e) { this.setData({ newName: e.detail.value }) },
  onPhoneInput: function (e) { this.setData({ newPhone: e.detail.value }) },

  createCustomer: function () {
    var name = this.data.newName.trim()
    if (!name || this.data.creating) {
      if (!name) wx.showToast({ title: '请输入客户名称', icon: 'none' })
      return
    }
    var that = this
    this.setData({ creating: true })
    post(config.api.ledgerCustomerAdd, {
      name: name,
      phone: this.data.newPhone.trim()
    }).then(function (customer) {
      that.setData({ showAdd: false, creating: false })
      that.returnCustomer(customer)
    }).catch(function (err) {
      console.warn('[客户新增失败]', {
        feature: '开单选择客户',
        reason: err && err.message ? err.message : '请求失败',
        customerName: name
      })
      that.setData({ creating: false })
    })
  },

  selectCustomer: function (e) {
    var customer = this.data.customers[e.currentTarget.dataset.index]
    this.returnCustomer(customer)
  },

  returnCustomer: function (customer) {
    var pages = getCurrentPages()
    var previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    if (!customer || !previousPage || typeof previousPage.onCustomerSelected !== 'function') {
      console.warn('[客户选择失败]', {
        feature: '开单选择客户',
        reason: '未找到客户或来源页面回调',
        customerId: customer && customer.id,
        pageCount: pages.length
      })
      wx.showToast({ title: '选择客户失败，请重试', icon: 'none' })
      return
    }
    previousPage.onCustomerSelected(customer)
    wx.navigateBack({
      fail: function (err) {
        console.error('[客户选择返回失败]', {
          feature: '开单选择客户',
          reason: err && err.errMsg ? err.errMsg : '页面返回失败',
          customerId: customer.id
        })
      }
    })
  },

  onPullDownRefresh: function () {
    this.loadCustomers()
    setTimeout(function () { wx.stopPullDownRefresh() }, 300)
  },

  noop: function () {}
})
