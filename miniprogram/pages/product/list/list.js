var { get, post, del } = require('../../../utils/request')
var config = require('../../../utils/config')

Page({
  data: {
    products: [], categories: [], keyword: '', loading: false,
    showCategory: false, categoryName: '', saving: false, editMode: false
  },
  onLoad: function (options) {
    this.setData({
      showCategory: options && options.category === '1',
      selectMode: options && options.select === '1',
      selectRowIndex: options && options.row !== undefined ? Number(options.row) : -1
    })
  },
  onShow: function () { this.loadData() },
  loadData: function () {
    var that = this
    this.setData({ loading: true })
    Promise.all([
      get(config.api.ledgerProductList, { pageSize: 100, keyword: this.data.keyword }),
      get(config.api.ledgerCategoryList, {})
    ]).then(function (results) {
      var categories = results[1] || []
      that.setData({ products: (results[0] && results[0].list) || [], categories: categories, loading: false })
    }).catch(function () { that.setData({ products: [], loading: false }) })
  },
  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadData() },
  selectProduct: function (e) {
    if (!this.data.selectMode) return
    var product = this.data.products[e.currentTarget.dataset.index]
    var pages = getCurrentPages()
    var previousPage = pages.length > 1 ? pages[pages.length - 2] : null
    if (!product || !previousPage || typeof previousPage.onProductSelected !== 'function') {
      console.warn('[商品选择失败]', {
        feature: '开单商品库选择',
        reason: '未找到商品或来源页面回调',
        productId: product && product.id,
        rowIndex: this.data.selectRowIndex,
        pageCount: pages.length
      })
      wx.showToast({ title: '选择商品失败，请重试', icon: 'none' })
      return
    }
    previousPage.onProductSelected(product, this.data.selectRowIndex)
    wx.navigateBack()
  },
  openProduct: function () { wx.navigateTo({ url: '/pages/product/manage/manage' }) },
  toggleEdit: function () { this.setData({ editMode: !this.data.editMode }) },
  openCategory: function () { this.setData({ showCategory: true, categoryName: '', saving: false }) },
  closeCategory: function () { if (!this.data.saving) this.setData({ showCategory: false }) },
  onCategoryName: function (e) { this.setData({ categoryName: e.detail.value }) },
  saveCategory: function () {
    var name = this.data.categoryName.trim()
    if (!name || this.data.saving) { if (!name) wx.showToast({ title: '请输入分类名称', icon: 'none' }); return }
    var that = this
    this.setData({ saving: true })
    post(config.api.ledgerCategoryAdd, { name: name }).then(function () { that.setData({ categoryName: '', saving: false }); that.loadData() }).catch(function () { that.setData({ saving: false }) })
  },
  removeCategory: function (e) {
    var id = e.currentTarget.dataset.id; var that = this
    wx.showModal({ title: '删除分类', content: '仅空分类可以删除，确定继续吗？', success: function (res) { if (res.confirm) del(config.api.ledgerCategoryDelete(id), {}).then(function () { that.loadData() }) } })
  },
  removeProduct: function (e) {
    var id = e.currentTarget.dataset.id; var that = this
    wx.showModal({ title: '归档商品', content: '归档后不能再用于开单，历史账单不受影响。确定继续吗？', confirmText: '归档', success: function (res) { if (res.confirm) del(config.api.ledgerProductDelete(id), {}).then(function () { that.loadData() }) } })
  },
  noop: function () {}
})
