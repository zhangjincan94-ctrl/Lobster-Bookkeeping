App({
  onLaunch: function () {
    var token = wx.getStorageSync('token')
    if (!token) {
      wx.redirectTo({
        url: '/pages/login/login'
      })
    } else {
      this.globalData.token = token
      var merchantInfo = wx.getStorageSync('merchantInfo')
      if (merchantInfo) {
        this.globalData.merchantInfo = merchantInfo
      }
    }
  },
  globalData: {
    baseUrl: '',
    token: '',
    merchantInfo: null
  }
})