var { get, post, del } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

var SWIPE_THRESHOLD = -30
var DELETE_OFFSET = -120
var touchStartX = 0
var touchStartY = 0
var touchStartOffset = 0
var swipeLocked = false

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
          totalDebt: totalDebt,
          swipeOffset: 0
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

  resetAllSwipe: function (exceptIndex) {
    var buyers = this.data.buyers
    var changed = false
    var update = {}
    for (var i = 0; i < buyers.length; i++) {
      if (i === exceptIndex) continue
      if (buyers[i].swipeOffset !== 0) {
        update['buyers[' + i + '].swipeOffset'] = 0
        changed = true
      }
    }
    if (changed) this.setData(update)
  },

  onTouchStart: function (e) {
    var index = e.currentTarget.dataset.index
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    touchStartOffset = this.data.buyers[index].swipeOffset || 0
    swipeLocked = false
  },

  onTouchMove: function (e) {
    var index = e.currentTarget.dataset.index
    var dx = e.touches[0].clientX - touchStartX
    var dy = e.touches[0].clientY - touchStartY
    if (!swipeLocked && Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    if (!swipeLocked) {
      // 锁定方向：横向才进入滑动
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeLocked = 'vertical'
        return
      }
      swipeLocked = 'horizontal'
      this.resetAllSwipe(index)
    }
    if (swipeLocked !== 'horizontal') return
    var offset = touchStartOffset + dx
    if (offset > 0) offset = 0
    if (offset < DELETE_OFFSET) offset = DELETE_OFFSET
    var update = {}
    update['buyers[' + index + '].swipeOffset'] = offset
    this.setData(update)
  },

  onTouchEnd: function (e) {
    var index = e.currentTarget.dataset.index
    var offset = this.data.buyers[index].swipeOffset || 0
    var update = {}
    update['buyers[' + index + '].swipeOffset'] = offset < SWIPE_THRESHOLD ? DELETE_OFFSET : 0
    this.setData(update)
  },

  onItemTap: function (e) {
    var index = e.currentTarget.dataset.index
    var item = this.data.buyers[index]
    if (item.swipeOffset && item.swipeOffset !== 0) {
      // 当前是滑出状态，点击只关闭
      var update = {}
      update['buyers[' + index + '].swipeOffset'] = 0
      this.setData(update)
      return
    }
    wx.navigateTo({
      url: '/pages/buyer/detail/detail?id=' + item.id
    })
  },

  onDelete: function (e) {
    var index = e.currentTarget.dataset.index
    var item = this.data.buyers[index]
    if (!item) return
    var that = this
    wx.showModal({
      title: '删除买家',
      content: '确定删除"' + item.name + '"吗？该操作不可撤销',
      confirmText: '删除',
      confirmColor: '#E74C3C',
      success: function (res) {
        if (!res.confirm) return
        del(config.api.buyerDelete(item.id), {}).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          var newList = that.data.buyers.slice()
          newList.splice(index, 1)
          that.setData({ buyers: newList })
        }).catch(function () {})
      }
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
