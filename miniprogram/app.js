App({
  onLaunch: function (options) {
    var token = wx.getStorageSync('token')
    var launchPath = options && options.path ? options.path : ''
    var isPublicPage = launchPath === 'pages/share/records/records'
    if (!token && !isPublicPage) {
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
