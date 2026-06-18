function checkLogin() {
  var token = wx.getStorageSync('token')
  return !!token
}

function setLoginInfo(token, merchant) {
  var app = getApp()
  app.globalData.token = token
  app.globalData.merchantInfo = merchant
  wx.setStorageSync('token', token)
  wx.setStorageSync('merchantInfo', merchant)
}

function clearLoginInfo() {
  var app = getApp()
  app.globalData.token = ''
  app.globalData.merchantInfo = null
  wx.removeStorageSync('token')
  wx.removeStorageSync('merchantInfo')
}

function getMerchantInfo() {
  var app = getApp()
  if (app.globalData.merchantInfo) {
    return app.globalData.merchantInfo
  }
  var stored = wx.getStorageSync('merchantInfo')
  if (stored) {
    app.globalData.merchantInfo = stored
    return stored
  }
  return null
}

module.exports = {
  checkLogin: checkLogin,
  setLoginInfo: setLoginInfo,
  clearLoginInfo: clearLoginInfo,
  getMerchantInfo: getMerchantInfo
}