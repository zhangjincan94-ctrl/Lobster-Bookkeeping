var { get, post, del } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function amount(value) { return (parseFloat(value) || 0).toFixed(2) }

Page({
  data: {
    keyword: '',
    customers: [],
    archived: false,
    loading: false,
    showAdd: false,
    newName: '',
    newPhone: '',
    creating: false,
    deletingCustomer: false
  },
  onShow: function () {
    if (!checkLogin()) return
    this.loadCustomers()
  },
  loadCustomers: function () {
    var that = this
    var archived = this.data.archived
    var keyword = this.data.keyword
    this.setData({ loading: true })
    get(config.api.ledgerCustomerList, { pageSize: 100, keyword: keyword, archived: archived ? '1' : '0' }).then(function (data) {
      if (that.data.archived !== archived || that.data.keyword !== keyword) return
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
      if (that.data.archived !== archived || that.data.keyword !== keyword) return
      console.warn('[往来对象列表加载失败]', {
        feature: '往来对象列表',
        reason: err && err.message ? err.message : '请求失败',
        keyword: keyword,
        archived: archived
      })
      that.setData({ customers: [], loading: false })
    })
  },
  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadCustomers() },
  switchStatus: function (e) {
    var archived = e.currentTarget.dataset.archived === '1'
    if (archived === this.data.archived) return
    this.setData({ archived: archived, customers: [] })
    this.loadCustomers()
  },
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
    if (this.suppressNextTap) { this.suppressNextTap = false; return }
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/customer/detail/detail?id=' + id })
  },
  onCustomerLongPress: function (e) {
    this.suppressNextTap = true
    var that = this
    setTimeout(function () { that.suppressNextTap = false }, 500)
    if (this.data.archived || this.data.deletingCustomer) return
    var id = e.currentTarget.dataset.id
    var customer = this.data.customers.find(function (item) { return String(item.id) === String(id) })
    if (!customer) {
      console.warn('[往来对象删除失败]', { feature: '往来对象列表删除', reason: '找不到所选对象', customerId: id })
      return
    }
    wx.showActionSheet({
      itemList: ['删除往来对象'],
      success: function (result) { if (result.tapIndex === 0) that.confirmDeleteCustomer(customer) },
      fail: function (err) {
        if (err && /cancel/i.test(err.errMsg || '')) return
        console.warn('[往来对象操作菜单失败]', { feature: '往来对象列表删除', reason: err && err.errMsg ? err.errMsg : '菜单失败', customerId: id })
      }
    })
  },
  confirmDeleteCustomer: function (customer) {
    if (customer.receivableBalance > 0 || customer.payableBalance > 0) {
      console.warn('[往来对象删除失败]', { feature: '往来对象列表删除', reason: '往来余额未结清', customerId: customer.id, receivableBalance: customer.receivableBalance, payableBalance: customer.payableBalance })
      wx.showToast({ title: '请先结清待收和待付款', icon: 'none' })
      return
    }
    var that = this
    wx.showModal({
      title: '删除往来对象',
      content: '删除后将移至已归档，可查看原账单和收付款记录。确定删除“' + customer.name + '”吗？',
      confirmText: '删除', confirmColor: '#ff6868',
      success: function (result) {
        if (!result.confirm || that.data.deletingCustomer) return
        that.setData({ deletingCustomer: true })
        del(config.api.ledgerCustomerDelete(customer.id), {}).then(function () {
          that.setData({ deletingCustomer: false })
          that.loadCustomers()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function (err) {
          console.warn('[往来对象删除失败]', { feature: '往来对象列表删除', reason: err && err.message ? err.message : '请求失败', customerId: customer.id })
          that.setData({ deletingCustomer: false })
        })
      },
      fail: function (err) {
        console.warn('[往来对象删除确认失败]', { feature: '往来对象列表删除', reason: err && err.errMsg ? err.errMsg : '弹窗失败', customerId: customer.id })
      }
    })
  },
  onPullDownRefresh: function () {
    this.loadCustomers()
    setTimeout(function () { wx.stopPullDownRefresh() }, 300)
  },
  noop: function () {}
})
