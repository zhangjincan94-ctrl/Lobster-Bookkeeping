var auth = require('../../utils/auth')
var { get, put } = require('../../utils/request')
var config = require('../../utils/config')

Page({
  data: {
    shopName: '',
    phone: '',
    showEditModal: false,
    editType: '',
    editTitle: '',
    editPlaceholder: '',
    editValue: '',
    submitting: false
  },

  onShow: function () {
    this.loadProfile()
  },

  loadProfile: function () {
    var that = this
    get(config.api.merchantProfile, {}).then(function (data) {
      if (!data) return
      var info = {
        id: data.id,
        shopName: data.shopName || '我的店铺',
        phone: data.phone || '',
        openid: data.openid
      }
      auth.setLoginInfo(wx.getStorageSync('token'), info)
      that.setData({
        shopName: info.shopName,
        phone: info.phone
      })
    }).catch(function () {
      var info = auth.getMerchantInfo() || {}
      that.setData({
        shopName: info.shopName || info.shop_name || '我的店铺',
        phone: info.phone || ''
      })
    })
  },

  noop: function () {},

  onEditShop: function () {
    this.setData({
      showEditModal: true,
      editType: 'shopName',
      editTitle: '修改店铺名称',
      editPlaceholder: '输入店铺名称',
      editValue: this.data.shopName === '我的店铺' ? '' : this.data.shopName,
      submitting: false
    })
  },

  onEditPhone: function () {
    this.setData({
      showEditModal: true,
      editType: 'phone',
      editTitle: '修改联系电话',
      editPlaceholder: '输入联系电话',
      editValue: this.data.phone,
      submitting: false
    })
  },

  onCloseEditModal: function () {
    this.setData({ showEditModal: false })
  },

  onEditInput: function (e) {
    this.setData({ editValue: e.detail.value })
  },

  onEditSubmit: function () {
    if (this.data.submitting) return
    var value = (this.data.editValue || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    var payload = {}
    payload[this.data.editType] = value

    var that = this
    this.setData({ submitting: true })
    put(config.api.merchantProfile, payload).then(function () {
      wx.showToast({ title: '已保存', icon: 'success' })
      that.setData({ showEditModal: false, submitting: false })
      that.loadProfile()
    }).catch(function () {
      that.setData({ submitting: false })
    })
  },

  goBuyer: function () {
    wx.navigateTo({ url: '/pages/buyer/list/list' })
  },

  goSupplier: function () {
    wx.navigateTo({ url: '/pages/supplier/list/list' })
  },

  goStatsOverview: function () {
    wx.navigateTo({ url: '/pages/stats/overview/overview' })
  },

  goStatsDebt: function () {
    wx.navigateTo({ url: '/pages/stats/debt/debt' })
  },

  goStatsProduct: function () {
    wx.navigateTo({ url: '/pages/stats/product/product' })
  },

  onLogout: function () {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: function (res) {
        if (!res.confirm) return
        auth.clearLoginInfo()
        wx.reLaunch({ url: '/pages/login/login' })
      }
    })
  }
})
