const { post } = require('../../utils/request')
const { setLoginInfo } = require('../../utils/auth')
const config = require('../../utils/config')

Page({
  data: {
    loading: false
  },

  onGetUserInfo: function (e) {
    if (e.detail.errMsg !== 'getUserInfo:ok') {
      wx.showToast({
        title: '需要授权才能登录',
        icon: 'none',
        duration: 2000
      })
      return
    }

    var that = this
    that.setData({ loading: true })

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          wx.showToast({
            title: '微信登录失败',
            icon: 'none',
            duration: 2000
          })
          that.setData({ loading: false })
          return
        }

        post(config.api.login, { code: loginRes.code }).then(function (data) {
          setLoginInfo(data.token, data.merchant)
          if (data.isNew) {
            that.setData({ loading: false })
            that.setupProfile()
          } else {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }).catch(function () {
          that.setData({ loading: false })
        })
      },
      fail: function () {
        wx.showToast({
          title: '微信登录失败',
          icon: 'none',
          duration: 2000
        })
        that.setData({ loading: false })
      }
    })
  },

  setupProfile: function () {
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})
