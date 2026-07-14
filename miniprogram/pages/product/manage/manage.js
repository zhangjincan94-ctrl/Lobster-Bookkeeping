var { get, post } = require('../../../utils/request')
var config = require('../../../utils/config')

Page({
  data: {
    name: '',
    unit: '斤',
    defaultUnitPrice: '',
    categories: [],
    categoryNames: ['未分类'],
    categoryIndex: 0,
    saving: false
  },

  onLoad: function () {
    this.loadCategories()
  },

  loadCategories: function () {
    var that = this
    get(config.api.ledgerCategoryList, {}).then(function (categories) {
      categories = categories || []
      that.setData({
        categories: categories,
        categoryNames: ['未分类'].concat(categories.map(function (item) { return item.name }))
      })
    }).catch(function () {
      that.setData({ categories: [], categoryNames: ['未分类'] })
    })
  },

  onNameInput: function (e) { this.setData({ name: e.detail.value }) },
  onUnitInput: function (e) { this.setData({ unit: e.detail.value }) },
  onPriceInput: function (e) { this.setData({ defaultUnitPrice: e.detail.value }) },
  onCategoryChange: function (e) { this.setData({ categoryIndex: Number(e.detail.value) }) },

  save: function () {
    var name = this.data.name.trim()
    if (!name || this.data.saving) {
      if (!name) wx.showToast({ title: '请输入商品名称', icon: 'none' })
      return
    }
    var category = this.data.categoryIndex > 0 ? this.data.categories[this.data.categoryIndex - 1] : null
    var that = this
    this.setData({ saving: true })
    post(config.api.ledgerProductAdd, {
      name: name,
      unit: this.data.unit.trim() || '斤',
      defaultUnitPrice: this.data.defaultUnitPrice,
      categoryId: category ? category.id : ''
    }).then(function () {
      wx.showToast({ title: '商品已添加', icon: 'success' })
      that.setData({ saving: false })
      setTimeout(function () { wx.navigateBack() }, 500)
    }).catch(function () {
      that.setData({ saving: false })
    })
  }
})
