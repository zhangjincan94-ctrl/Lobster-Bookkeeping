var { get, post, put, del } = require('../../../utils/request')
var { checkLogin } = require('../../../utils/auth')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

var PAGE_SIZE = 20

function mapCustomer(item) {
  var hasSeparateBalances = item.receivableBalance !== undefined && item.payableBalance !== undefined
  var legacyBalance = parseFloat(item.balance) || 0
  item.receivableBalance = hasSeparateBalances ? parseFloat(item.receivableBalance) || 0 : Math.max(legacyBalance, 0)
  item.payableBalance = hasSeparateBalances ? parseFloat(item.payableBalance) || 0 : Math.max(-legacyBalance, 0)
  item.receivableDisplay = formatPrice(item.receivableBalance)
  item.payableDisplay = formatPrice(item.payableBalance)
  return item
}

Page({
  data: {
    theme: '',
    keyword: '',
    customers: [],
    archived: false,
    loading: false,
    loadingMore: false,
    hasLoaded: false,
    error: '',
    loadedCount: 0,
    totalCount: 0,
    hasMore: false,
    showAdd: false,
    newName: '',
    newPhone: '',
    creating: false,
    deletingCustomer: false,
    showEditCustomer: false,
    editCustomerId: '',
    editCustomerName: '',
    editPhone: '',
    savingEditCustomer: false
  },
  onShow: function () {
    this.setData({ theme: theme.get() })
    if (!checkLogin()) return
    this.loadCustomers()
  },
  fetchPage: function (page) {
    return get(config.api.ledgerCustomerList, {
      page: page,
      pageSize: PAGE_SIZE,
      keyword: this.data.keyword,
      archived: this.data.archived ? '1' : '0'
    }, { silent: true })
  },
  loadCustomers: function () {
    var that = this
    var requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this._page = 1
    this.setData({ loading: true, loadingMore: false })
    return this.fetchPage(1).then(function (data) {
      if (requestId !== that._requestId) return
      var list = ((data && data.list) || []).map(mapCustomer)
      var total = parseInt(data && data.total, 10) || 0
      that._customers = list
      that.setData({
        customers: list,
        loading: false,
        hasLoaded: true,
        error: '',
        loadedCount: list.length,
        totalCount: total,
        hasMore: list.length < total
      })
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[往来对象列表加载失败]', {
        feature: '往来对象列表',
        reason: err && err.message ? err.message : '请求失败',
        archived: that.data.archived
      })
      var hasLoaded = that.data.hasLoaded
      that.setData({
        loading: false,
        loadingMore: false,
        error: hasLoaded ? '刷新失败，正在显示上次数据' : '加载失败，请检查网络后重试',
        customers: hasLoaded ? that.data.customers : [],
        loadedCount: hasLoaded ? that.data.loadedCount : 0,
        totalCount: hasLoaded ? that.data.totalCount : 0,
        hasMore: hasLoaded ? that.data.hasMore : false
      })
      if (!hasLoaded) that._customers = []
    })
  },
  loadMore: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return Promise.resolve()
    var that = this
    var requestId = this._requestId
    var nextPage = (this._page || 1) + 1
    this.setData({ loadingMore: true })
    return this.fetchPage(nextPage).then(function (data) {
      if (requestId !== that._requestId) return
      var list = ((data && data.list) || []).map(mapCustomer)
      var total = parseInt(data && data.total, 10) || 0
      that._page = nextPage
      that._customers = (that._customers || []).concat(list)
      that.setData({
        customers: that._customers,
        loadingMore: false,
        error: '',
        loadedCount: that._customers.length,
        totalCount: total,
        hasMore: that._customers.length < total && list.length > 0
      })
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[往来对象列表加载更多失败]', {
        feature: '往来对象列表',
        reason: err && err.message ? err.message : '请求失败',
        page: nextPage
      })
      that.setData({ loadingMore: false, error: '加载更多失败，正在显示已有数据' })
    })
  },
  retry: function () {
    return this.loadCustomers()
  },
  onReachBottom: function () {
    return this.loadMore()
  },
  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadCustomers() },
  switchStatus: function (e) {
    var archived = e.currentTarget.dataset.archived === '1'
    if (archived === this.data.archived) return
    this._customers = []
    this.setData({ archived: archived, customers: [], loadedCount: 0, totalCount: 0, hasMore: false, error: '' })
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
  openEditCustomer: function (e) {
    var id = e.currentTarget.dataset.id
    var customer = this.data.customers.find(function (item) { return String(item.id) === String(id) })
    if (!customer) {
      console.warn('[往来对象编辑失败]', { feature: '编辑往来对象', reason: '找不到所选对象', customerId: id })
      return
    }
    this.setData({
      showEditCustomer: true,
      editCustomerId: customer.id,
      editCustomerName: customer.name,
      editPhone: customer.phone || '',
      savingEditCustomer: false
    })
  },
  closeEditCustomer: function () { if (!this.data.savingEditCustomer) this.setData({ showEditCustomer: false }) },
  onEditNameInput: function (e) { this.setData({ editCustomerName: e.detail.value }) },
  onEditPhoneInput: function (e) { this.setData({ editPhone: e.detail.value }) },
  saveCustomer: function () {
    var name = this.data.editCustomerName.trim()
    var phone = this.data.editPhone.trim()
    if (!name || this.data.savingEditCustomer) {
      if (!name) wx.showToast({ title: '请输入名称', icon: 'none' })
      return
    }
    var that = this
    var customerId = this.data.editCustomerId
    this.setData({ savingEditCustomer: true })
    put(config.api.ledgerCustomerUpdate(customerId), { name: name, phone: phone }).then(function (customer) {
      var savedName = (customer && customer.name) || name
      var savedPhone = customer && customer.phone !== undefined ? customer.phone : phone
      var list = that.data.customers.map(function (item) {
        if (String(item.id) === String(customerId)) {
          item.name = savedName
          item.phone = savedPhone
        }
        return item
      })
      that.setData({ customers: list, showEditCustomer: false, savingEditCustomer: false })
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(function (err) {
      console.warn('[往来对象编辑保存失败]', {
        feature: '编辑往来对象',
        reason: err && err.message ? err.message : '请求失败',
        customerId: customerId
      })
      that.setData({ savingEditCustomer: false })
    })
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
      console.warn('[往来对象删除失败]', { feature: '往来对象列表删除', reason: '往来余额未结清', customerId: customer.id })
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
    return this.loadCustomers().then(function () { wx.stopPullDownRefresh() }, function () { wx.stopPullDownRefresh() })
  },
  noop: function () {}
})
