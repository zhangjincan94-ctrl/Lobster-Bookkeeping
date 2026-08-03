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
    get(config.api.ledgerCustomerList, { pageSize: 100, keyword: this.data.keyword }).then(function (data) {
      var customers = ((data && data.list) || []).map(function (item) {
        var hasSeparateBalances = item.receivableBalance !== undefined && item.payableBalance !== undefined
        var legacyBalance = parseFloat(item.balance) || 0
        item.receivableBalance = hasSeparateBalances ? parseFloat(item.receivableBalance) || 0 : Math.max(legacyBalance, 0)
        item.payableBalance = hasSeparateBalances ? parseFloat(item.payableBalance) || 0 : Math.max(-legacyBalance, 0)
        item.receivableDisplay = '¥' + amount(item.receivableBalance)
        item.payableDisplay = '¥' + amount(item.payableBalance)
        return item
      })
      that.setData({ customers: customers, loading: false })
    }).catch(function (err) {
      console.warn('[往来对象列表加载失败]', {
        feature: '往来对象列表',
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
      if (!name) wx.showToast({ title: '请输入往来对象名称', icon: 'none' })
      return
    }
    var that = this
    this.setData({ creating: true })
    post(config.api.ledgerCustomerAdd, { name: name, phone: this.data.newPhone.trim() }).then(function (customer) {
      that.setData({ showAdd: false, creating: false })
      that.loadCustomers()
      wx.navigateTo({ url: '/pages/customer/detail/detail?id=' + customer.id })
    }).catch(function () { that.setData({ creating: false }) })
  },
  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/customer/detail/detail?id=' + id })
  },
  onPullDownRefresh: function () {
    this.loadCustomers()
    setTimeout(function () { wx.stopPullDownRefresh() }, 300)
  },
  noop: function () {}
})
