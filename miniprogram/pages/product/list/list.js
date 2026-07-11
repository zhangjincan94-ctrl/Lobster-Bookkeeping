var { get, post, del } = require('../../../utils/request')
var config = require('../../../utils/config')

Page({
  data: {
    products: [], categories: [], keyword: '', loading: false,
    showProduct: false, showCategory: false, productName: '', productUnit: '件', productPrice: '', categoryIndex: 0, categoryNames: ['未分类'], categoryName: '', saving: false
  },
  onLoad: function (options) { if (options && options.category === '1') this.setData({ showCategory: true }) },
  onShow: function () { this.loadData() },
  loadData: function () {
    var that = this
    this.setData({ loading: true })
    Promise.all([
      get(config.api.ledgerProductList, { pageSize: 100, keyword: this.data.keyword }),
      get(config.api.ledgerCategoryList, {})
    ]).then(function (results) {
      var categories = results[1] || []
      that.setData({ products: (results[0] && results[0].list) || [], categories: categories, categoryNames: ['未分类'].concat(categories.map(function (item) { return item.name })), loading: false })
    }).catch(function () { that.setData({ products: [], loading: false }) })
  },
  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadData() },
  openProduct: function () { this.setData({ showProduct: true, productName: '', productUnit: '件', productPrice: '', categoryIndex: 0, saving: false }) },
  closeProduct: function () { if (!this.data.saving) this.setData({ showProduct: false }) },
  onProductName: function (e) { this.setData({ productName: e.detail.value }) },
  onProductUnit: function (e) { this.setData({ productUnit: e.detail.value }) },
  onProductPrice: function (e) { this.setData({ productPrice: e.detail.value }) },
  onCategoryChange: function (e) { this.setData({ categoryIndex: Number(e.detail.value) }) },
  saveProduct: function () {
    var name = this.data.productName.trim()
    if (!name || this.data.saving) { if (!name) wx.showToast({ title: '请输入商品名称', icon: 'none' }); return }
    var category = this.data.categoryIndex > 0 ? this.data.categories[this.data.categoryIndex - 1] : null
    var that = this
    this.setData({ saving: true })
    post(config.api.ledgerProductAdd, { name: name, unit: this.data.productUnit.trim() || '件', defaultUnitPrice: this.data.productPrice, categoryId: category ? category.id : '' }).then(function () {
      that.setData({ showProduct: false, saving: false })
      that.loadData()
    }).catch(function () { that.setData({ saving: false }) })
  },
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
