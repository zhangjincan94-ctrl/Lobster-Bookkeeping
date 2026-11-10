var { get, post, del } = require('../../../utils/request')
var config = require('../../../utils/config')
var theme = require('../../../utils/theme')

var PAGE_SIZE = 20

// scroll-view 需要确定高度才能滚动，按分类数量给出 1~5 行的高度。
function categoryListHeight(count) {
  return count ? Math.min(count, 5) * 84 : 120
}

Page({
  data: {
    theme: '',
    products: [], categories: [], keyword: '', loading: false,
    loadingMore: false, hasLoaded: false, error: '',
    loadedCount: 0, totalCount: 0, hasMore: false,
    showCategory: false, categoryName: '', saving: false, editMode: false,
    categoryListHeight: 0
  },
  onLoad: function (options) {
    this.setData({
      showCategory: options && options.category === '1',
      selectMode: options && options.select === '1',
      selectRowIndex: options && options.row !== undefined ? Number(options.row) : -1
    })
  },
  onShow: function () { this.setData({ theme: theme.get() }); this.loadData() },
  fetchProducts: function (page) {
    return get(config.api.ledgerProductList, {
      page: page, pageSize: PAGE_SIZE, keyword: this.data.keyword
    }, { silent: true })
  },
  loadCategories: function () {
    var that = this
    get(config.api.ledgerCategoryList, {}, { silent: true }).then(function (categories) {
      var list = categories || []
      that.setData({ categories: list, categoryListHeight: categoryListHeight(list.length) })
    }).catch(function (err) {
      console.warn('[商品分类加载失败]', {
        feature: '商品库分类',
        reason: err && err.message ? err.message : '请求失败'
      })
      that.setData({ categories: [], categoryListHeight: categoryListHeight(0) })
    })
  },
  loadData: function () {
    this.loadCategories()
    return this.loadProducts()
  },
  loadProducts: function () {
    var that = this
    var requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this._page = 1
    this.setData({ loading: true, loadingMore: false })
    return this.fetchProducts(1).then(function (data) {
      if (requestId !== that._requestId) return
      var list = (data && data.list) || []
      var total = parseInt(data && data.total, 10) || 0
      that._products = list
      that.setData({
        products: list,
        loading: false,
        hasLoaded: true,
        error: '',
        loadedCount: list.length,
        totalCount: total,
        hasMore: list.length < total
      })
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[商品列表加载失败]', {
        feature: '商品库',
        reason: err && err.message ? err.message : '请求失败'
      })
      var hasLoaded = that.data.hasLoaded
      that.setData({
        loading: false,
        loadingMore: false,
        error: hasLoaded ? '刷新失败，正在显示上次数据' : '加载失败，请检查网络后重试',
        products: hasLoaded ? that.data.products : [],
        loadedCount: hasLoaded ? that.data.loadedCount : 0,
        totalCount: hasLoaded ? that.data.totalCount : 0,
        hasMore: hasLoaded ? that.data.hasMore : false
      })
      if (!hasLoaded) that._products = []
    })
  },
  loadMore: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return Promise.resolve()
    var that = this
    var requestId = this._requestId
    var nextPage = (this._page || 1) + 1
    this.setData({ loadingMore: true })
    return this.fetchProducts(nextPage).then(function (data) {
      if (requestId !== that._requestId) return
      var list = (data && data.list) || []
      var total = parseInt(data && data.total, 10) || 0
      that._page = nextPage
      that._products = (that._products || []).concat(list)
      that.setData({
        products: that._products,
        loadingMore: false,
        error: '',
        loadedCount: that._products.length,
        totalCount: total,
        hasMore: that._products.length < total && list.length > 0
      })
    }).catch(function (err) {
      if (requestId !== that._requestId) return
      console.warn('[商品列表加载更多失败]', {
        feature: '商品库',
        reason: err && err.message ? err.message : '请求失败',
        page: nextPage
      })
      that.setData({ loadingMore: false, error: '加载更多失败，正在显示已有数据' })
    })
  },
  retry: function () {
    return this.loadData()
  },
  onReachBottom: function () {
    return this.loadMore()
  },
  onSearchInput: function (e) { this.setData({ keyword: e.detail.value }) },
  onSearch: function () { this.loadData() },
  selectProduct: function (e) {
    if (!this.data.selectMode || this.data.editMode) return
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
    var id = e.currentTarget.dataset.id
    var name = e.currentTarget.dataset.name
    var that = this
    wx.showModal({
      title: '删除分类',
      content: '确定删除分类「' + name + '」吗？',
      success: function (res) {
        if (res.confirm) del(config.api.ledgerCategoryDelete(id), {}).then(function () { that.loadData() })
      }
    })
  },
  removeProduct: function (e) {
    var id = e.currentTarget.dataset.id; var that = this
    wx.showModal({ title: '归档商品', content: '归档后不能再用于开单，历史账单不受影响。确定继续吗？', confirmText: '归档', success: function (res) { if (res.confirm) del(config.api.ledgerProductDelete(id), {}).then(function () { that.loadData() }) } })
  },
  noop: function () {}
})
