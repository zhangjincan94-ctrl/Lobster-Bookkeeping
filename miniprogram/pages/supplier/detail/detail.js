var { get, put } = require('../../../utils/request')
var { formatPrice, formatDate } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

function settlementStatusText(status) {
  var map = { 0: '未结清', 1: '已结清', 2: '部分付款' }
  return map[status] !== undefined ? map[status] : '未知'
}

function settlementStatusClass(status) {
  var map = { 0: 'tag-unpaid', 1: 'tag-paid', 2: 'tag-partial' }
  return map[status] || 'tag-unpaid'
}

Page({
  data: {
    id: '',
    supplier: null,
    purchases: [],
    page: 1,
    hasMore: true,
    loading: false,
    showEditModal: false,
    editName: '',
    editPhone: '',
    editRemark: ''
  },

  onLoad: function (options) {
    if (!checkLogin()) return
    if (options && options.id) {
      this.setData({ id: options.id })
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    if (this.data.id) {
      this.loadSupplierDetail()
      this.resetAndReloadPurchases()
    }
  },

  loadSupplierDetail: function () {
    var that = this
    get(config.api.supplierDetail(this.data.id)).then(function (data) {
      if (!data) return
      var totalCost = parseFloat(data.totalCost) || 0
      var totalDebt = parseFloat(data.totalDebt) || 0
      var paidAmount = totalCost - totalDebt
      that.setData({
        supplier: {
          id: data.id,
          name: data.name || '未知供应商',
          phone: data.phone || '',
          remark: data.remark || '',
          totalWeightDisplay: (parseFloat(data.totalWeight) || 0).toFixed(2),
          totalCostDisplay: formatPrice(totalCost),
          paidAmountDisplay: formatPrice(paidAmount),
          totalDebtDisplay: formatPrice(totalDebt),
          totalDebt: totalDebt,
          purchaseCount: data.purchaseCount || 0
        }
      })
    }).catch(function () {})
  },

  resetAndReloadPurchases: function () {
    this.setData({
      page: 1,
      purchases: [],
      hasMore: true
    })
    this.loadPurchases(1)
  },

  loadPurchases: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = {
      supplierId: this.data.id,
      page: page,
      pageSize: 20
    }

    get(config.api.purchaseList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        var orderStatus = Number(item.orderStatus) || 0
        var isCancelled = orderStatus === 1
        var status = Number(item.settlementStatus) || 0
        return {
          id: item.id,
          lobsterSize: item.lobsterSize || '',
          netWeightDisplay: item.netWeight ? item.netWeight + '斤' : '',
          totalCostDisplay: formatPrice(item.totalCost),
          timeDisplay: formatDate(item.receivedAt || item.createdAt),
          settlementStatusText: isCancelled ? '已取消' : settlementStatusText(status),
          settlementStatusClass: isCancelled ? 'tag-cancelled' : settlementStatusClass(status)
        }
      })

      var newPurchases = page === 1 ? processed : that.data.purchases.concat(processed)
      that.setData({
        purchases: newPurchases,
        page: page,
        hasMore: newPurchases.length < total,
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  onPullDownRefresh: function () {
    this.loadSupplierDetail()
    this.resetAndReloadPurchases()
    wx.stopPullDownRefresh()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPurchases(this.data.page + 1)
    }
  },

  goAddPurchase: function () {
    wx.navigateTo({
      url: '/pages/purchase/add/add?supplier_id=' + this.data.id
    })
  },

  goPurchaseDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/purchase/detail/detail?id=' + id
    })
  },

  callPhone: function () {
    var phone = this.data.supplier && this.data.supplier.phone
    if (!phone) {
      wx.showToast({ title: '未填写电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onEditSupplier: function () {
    var s = this.data.supplier || {}
    this.setData({
      showEditModal: true,
      editName: s.name || '',
      editPhone: s.phone || '',
      editRemark: s.remark || ''
    })
  },

  onCloseEditModal: function () {
    this.setData({ showEditModal: false })
  },

  noop: function () {},

  onEditNameInput: function (e) {
    this.setData({ editName: e.detail.value })
  },

  onEditPhoneInput: function (e) {
    this.setData({ editPhone: e.detail.value })
  },

  onEditRemarkInput: function (e) {
    this.setData({ editRemark: e.detail.value })
  },

  onSubmitEdit: function () {
    var name = (this.data.editName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' })
      return
    }

    var that = this
    put(config.api.supplierUpdate(this.data.id), {
      name: name,
      phone: (this.data.editPhone || '').trim(),
      remark: (this.data.editRemark || '').trim()
    }).then(function () {
      wx.showToast({ title: '保存成功', icon: 'success' })
      that.setData({ showEditModal: false })
      that.loadSupplierDetail()
    }).catch(function () {})
  }
})
