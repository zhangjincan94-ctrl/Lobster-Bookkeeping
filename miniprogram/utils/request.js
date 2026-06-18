var config = require('./config')

function toCamelCase(str) {
  return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase() })
}

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, function (_, c) { return '_' + c.toLowerCase() })
}

function keysToCamelCase(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(keysToCamelCase)
  if (typeof obj !== 'object' || obj instanceof Date) return obj
  var result = {}
  var keys = Object.keys(obj)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    result[toCamelCase(key)] = keysToCamelCase(obj[key])
  }
  return result
}

function keysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(keysToSnakeCase)
  if (typeof obj !== 'object' || obj instanceof Date) return obj
  var result = {}
  var keys = Object.keys(obj)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    result[toSnakeCase(key)] = keysToSnakeCase(obj[key])
  }
  return result
}

function request(options) {
  return new Promise(function (resolve, reject) {
    var app = getApp()
    var header = options.header || {}
    if (app.globalData.token) {
      header['Authorization'] = 'Bearer ' + app.globalData.token
    }
    header['Content-Type'] = header['Content-Type'] || 'application/json'

    var sendData = options.data ? keysToSnakeCase(options.data) : {}

    wx.request({
      url: config.baseUrl + options.url,
      method: options.method || 'GET',
      data: sendData,
      header: header,
      success: function (res) {
        if (res.statusCode === 401) {
          clearAuthAndRedirect()
          reject({ code: 401, message: '登录已过期' })
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          var data = res.data && res.data.data ? res.data.data : res.data
          resolve(keysToCamelCase(data))
        } else {
          var msg = (res.data && res.data.message) || '请求失败'
          wx.showToast({
            title: msg,
            icon: 'none',
            duration: 2000
          })
          reject({ code: res.statusCode, message: msg })
        }
      },
      fail: function (err) {
        wx.showToast({
          title: '网络异常',
          icon: 'none',
          duration: 2000
        })
        reject({ code: -1, message: '网络异常' })
      }
    })
  })
}

function clearAuthAndRedirect() {
  var app = getApp()
  app.globalData.token = ''
  app.globalData.merchantInfo = null
  wx.removeStorageSync('token')
  wx.removeStorageSync('merchantInfo')
  wx.redirectTo({
    url: '/pages/login/login'
  })
}

function get(url, data) {
  return request({ url: url, method: 'GET', data: data })
}

function post(url, data) {
  return request({ url: url, method: 'POST', data: data })
}

function put(url, data) {
  return request({ url: url, method: 'PUT', data: data })
}

function del(url, data) {
  return request({ url: url, method: 'DELETE', data: data })
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del
}