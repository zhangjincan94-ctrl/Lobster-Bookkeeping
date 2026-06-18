var { get, post } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    keyword: '',
    buyers: [],
    page: 1,
    hasMore: true,
    loading: false,
    showAddModal: false,
    newName: '',
    newPhone: ''
  },

  onShow: function () {
    if (!checkLogin()) return
    this.resetAndReload()
  },

  resetAndReload: function () {
    this.setData({
      page: 1,
      buyers: [],
      hasMore: true
    })
    this.loadBuyers(1)
  },

  loadBuyers: function (page) {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    var params = {
      page: page,
      pageSize: 20
    }
    if (this.data.keyword) {
      params.keyword = this.data.keyword
    }

    get(config.api.buyerList, params).then(function (data) {
      var list = (data && data.list) || []
      var total = (data && data.total) || 0
      var processed = list.map(function (item) {
        var totalDebt = parseFloat(item.totalDebt) || 0
        return {
          id: item.id,
          name: item.name || '未知买家',
          phone: item.phone || '',
          totalSpentDisplay: formatPrice(item.totalSpent),
          totalDebtDisplay: formatPrice(totalDebt),
          totalDebt: totalDebt
        }
      })

      var newBuyers = page === 1 ? processed : that.data.buyers.concat(processed)
      that.setData({
        buyers: newBuyers,
        page: page,
        hasMore: newBuyers.length < total,
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
      this.loadBuyers(this.data.page + 1)
    }
  },

  goDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/buyer/detail/detail?id=' + id
    })
  },

  goAddBuyer: function () {
    this.setData({
      showAddModal: true,
      newName: '',
      newPhone: ''
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

  onSubmitAdd: function () {
    var name = this.data.newName.trim()
    if (!name) {
      wx.showToast({ title: '请输入买家姓名', icon: 'none' })
      return
    }

    var that = this
    post(config.api.buyerAdd, {
      name: name,
      phone: this.data.newPhone.trim()
    }).then(function () {
      wx.showToast({ title: '添加成功', icon: 'success' })
      that.setData({ showAddModal: false })
      that.resetAndReload()
    }).catch(function () {})
  }
})
