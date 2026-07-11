App({
  onLaunch: function (options) {
    var token = wx.getStorageSync('token')
    var launchPath = options && options.path ? options.path : ''
    var publicPages = [
      'pages/share/records/records',
      'pages/share/purchase-record/purchase-record',
      'pages/share/supplier-records/supplier-records',
      'pages/share/statement/statement'
    ]
    var isPublicPage = publicPages.indexOf(launchPath) >= 0
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
