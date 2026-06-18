var { get, post } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    keyword: '',
    suppliers: [],
    page: 1,
    hasMore: true,
    loading: false,
    showAddModal: false,
    newName: '',
    newPhone: '',
    newRemark: ''
  },

  onShow: function () {
    if (!checkLogin()) return
    this.resetAndReload()
  },

  resetAndReload: function () {
    this.setData({
      page: 1,
      suppliers: [],
      hasMore: true
    })
    this.loadSuppliers(1)
  },

  loadSuppliers: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = { page: page, pageSize: 20 }
    if (this.data.keyword) params.keyword = this.data.keyword

    get(config.api.supplierList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        return {
          id: item.id,
          name: item.name || '未知供应商',
          phone: item.phone || '',
          totalCostDisplay: formatPrice(item.totalCost),
          totalDebtDisplay: formatPrice(item.totalDebt),
          totalDebt: parseFloat(item.totalDebt) || 0,
          purchaseCount: item.purchaseCount || 0
        }
      })

      var newSuppliers = page === 1 ? processed : that.data.suppliers.concat(processed)
      that.setData({
        suppliers: newSuppliers,
        page: page,
        hasMore: newSuppliers.length < total,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch: function () {
    this.resetAndReload()
  },

  onPullDownRefresh: function () {
    this.resetAndReload()
    wx.stopPullDownRefresh()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadSuppliers(this.data.page + 1)
    }
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/supplier/detail/detail?id=' + id
    })
  },

  goPurchases: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/purchase/list/list?supplier_id=' + id
    })
  },

  goAddSupplier: function () {
    this.setData({
      showAddModal: true,
      newName: '',
      newPhone: '',
      newRemark: ''
    })
  },

  onCloseAddModal: function () {
    this.setData({ showAddModal: false })
  },

  noop: function () {},

  onNameInput: function (e) {
    this.setData({ newName: e.detail.value })
  },

  onPhoneInput: function (e) {
    this.setData({ newPhone: e.detail.value })
  },

  onRemarkInput: function (e) {
    this.setData({ newRemark: e.detail.value })
  },

  onSubmitAdd: function () {
    var name = this.data.newName.trim()
    if (!name) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' })
      return
    }

    var that = this
    post(config.api.supplierAdd, {
      name: name,
      phone: this.data.newPhone.trim(),
      remark: this.data.newRemark.trim()
    }).then(function () {
      wx.showToast({ title: '添加成功', icon: 'success' })
      that.setData({ showAddModal: false })
      that.resetAndReload()
    }).catch(function () {})
  }
})
