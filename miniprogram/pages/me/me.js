var auth = require('../../utils/auth')
var { get, put } = require('../../utils/request')
var config = require('../../utils/config')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: '',
    themeName: '',
    shopName: '',
    phone: '',
    avatar: '',
    uploadingAvatar: false,
    showEditModal: false,
    editType: '',
    editTitle: '',
    editPlaceholder: '',
    editValue: '',
    submitting: false
  },

  onShow: function () {
    var key = theme.get()
    var name = ''
    theme.list().forEach(function (item) {
      if (item.key === key) name = item.name
    })
    this.setData({ theme: key, themeName: name })
    theme.apply(key)
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
        avatar: data.avatar || '',
        openid: data.openid
      }
      auth.setLoginInfo(wx.getStorageSync('token'), info)
      that.setData({
        shopName: info.shopName,
        phone: info.phone,
        avatar: info.avatar
      })
    }).catch(function () {
      var info = auth.getMerchantInfo() || {}
      that.setData({
        shopName: info.shopName || info.shop_name || '我的店铺',
        phone: info.phone || '',
        avatar: info.avatar || ''
      })
    })
  },

  noop: function () {},

  // 头像链路任意一步失败都把步骤和原始错误抛出来，方便定位（不输出图片内容）
  avatarFail: function (step, err) {
    var reason = (err && (err.errMsg || err.message)) || String(err || '未知错误')
    console.warn('[店铺头像设置失败]', { feature: '设置店铺头像', step: step, reason: reason })
    if (/cancel/i.test(reason)) return
    wx.showModal({
      title: '头像设置失败',
      content: step + '\n' + reason,
      showCancel: false
    })
  },

  onChooseAvatar: function () {
    if (this.data.uploadingAvatar) return
    var that = this
    if (typeof wx.chooseMedia !== 'function') {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          if (res.tempFilePaths && res.tempFilePaths[0]) that.cropAvatar(res.tempFilePaths[0])
        },
        fail: function (err) { that.avatarFail('选择图片失败', err) }
      })
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          that.avatarFail('选择图片失败', { errMsg: '未获取到图片路径' })
          return
        }
        that.cropAvatar(file.tempFilePath)
      },
      fail: function (err) { that.avatarFail('选择图片失败', err) }
    })
  },

  // 居中裁成正方形并缩到 240px，控制存储体积（目标 30KB 以内）
  cropAvatar: function (filePath, quality) {
    var that = this
    var SIZE = 240
    var outputQuality = typeof quality === 'number' ? quality : 0.8
    wx.createSelectorQuery().in(this).select('#avatarCanvas').fields({ node: true, size: true }).exec(function (res) {
      var canvas = res && res[0] && res[0].node
      if (!canvas || typeof canvas.getContext !== 'function') {
        that.avatarFail('准备画布失败', { errMsg: '当前基础库不支持 Canvas 2D' })
        return
      }
      canvas.width = SIZE
      canvas.height = SIZE
      var ctx = canvas.getContext('2d')
      var img = canvas.createImage()
      img.onload = function () {
        var edge = Math.min(img.width, img.height)
        var sx = (img.width - edge) / 2
        var sy = (img.height - edge) / 2
        ctx.clearRect(0, 0, SIZE, SIZE)
        ctx.drawImage(img, sx, sy, edge, edge, 0, 0, SIZE, SIZE)
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0,
          y: 0,
          width: SIZE,
          height: SIZE,
          destWidth: SIZE,
          destHeight: SIZE,
          fileType: 'jpg',
          quality: outputQuality,
          success: function (output) { that.saveAvatar(output.tempFilePath, outputQuality) },
          fail: function (err) { that.avatarFail('裁剪图片失败', err) }
        }, that)
      }
      img.onerror = function (err) { that.avatarFail('读取图片失败', err) }
      img.src = filePath
    })
  },

  saveAvatar: function (tempFilePath, quality) {
    var that = this
    var currentQuality = typeof quality === 'number' ? quality : 0.8
    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      encoding: 'base64',
      success: function (res) {
        var dataUrl = 'data:image/jpeg;base64,' + res.data
        if (dataUrl.length > 300000) {
          // 仍偏大时降低质量重新裁剪一次，避免直接失败
          if (currentQuality > 0.6) {
            that.cropAvatar(tempFilePath, 0.6)
            return
          }
          that.avatarFail('保存头像失败', { errMsg: '图片仍然过大（' + Math.round(dataUrl.length / 1024) + 'KB），请换一张' })
          return
        }
        that.setData({ uploadingAvatar: true })
        wx.showLoading({ title: '正在保存', mask: true })
        // silent：错误统一用弹窗展示，避免 toast 关掉 loading 后重复 hideLoading
        put(config.api.merchantProfile, { avatar: dataUrl }, { silent: true }).then(function () {
          wx.hideLoading()
          var info = auth.getMerchantInfo() || {}
          info.avatar = dataUrl
          auth.setLoginInfo(wx.getStorageSync('token'), info)
          that.setData({ avatar: dataUrl, uploadingAvatar: false })
          wx.showToast({ title: '头像已更新', icon: 'success' })
        }).catch(function (err) {
          wx.hideLoading()
          that.setData({ uploadingAvatar: false })
          that.avatarFail('上传头像失败', err)
        })
      },
      fail: function (err) { that.avatarFail('读取图片失败', err) }
    })
  },

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

  goProductLibrary: function () {
    wx.navigateTo({ url: '/pages/product/list/list' })
  },

  goTradeStats: function () {
    wx.navigateTo({ url: '/pages/stats/trade/trade' })
  },

  goExport: function () {
    wx.navigateTo({ url: '/pages/me/export/export' })
  },

  goTheme: function () {
    wx.navigateTo({ url: '/pages/me/theme/theme' })
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
