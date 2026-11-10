var config = require('./config')
var authRedirecting = false
var REQUEST_TIMEOUT = 10000
var TIMEOUT_MESSAGE = '请求超时，请稍后重试'

function showToast(options, message) {
  if (options && options.silent) return
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  })
}

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

function handleResponse(options, statusCode, payload, resolve, reject) {
  if (statusCode === 401) {
    console.warn('[小程序请求失败]', {
      feature: options.url,
      reason: '登录已过期',
      status: statusCode
    })
    clearAuthAndRedirect()
    reject({ code: 401, message: '登录已过期' })
    return
  }
  if (statusCode >= 200 && statusCode < 300) {
    var hasDataField = payload && Object.prototype.hasOwnProperty.call(payload, 'data')
    var data = hasDataField ? payload.data : payload
    resolve(keysToCamelCase(data))
    return
  }
  var msg = (payload && payload.message) || '请求失败'
  console.warn('[小程序请求失败]', {
    feature: options.url,
    reason: msg,
    status: statusCode
  })
  showToast(options, msg)
  reject({ code: statusCode, message: msg })
}

function handleNetworkError(options, err, reject) {
  var errMsg = err && err.errMsg ? err.errMsg : ''
  var isTimeout = /timeout/i.test(errMsg)
  var message = isTimeout ? TIMEOUT_MESSAGE : '网络异常'
  console.error('[小程序请求失败]', {
    feature: options.url,
    reason: isTimeout ? '请求超时' : (errMsg || '网络异常'),
    status: -1
  })
  showToast(options, message)
  reject({ code: -1, message: message })
}

function cloudRequest(options) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      showToast(options, '云开发未初始化')
      reject({ code: -1, message: '云开发未初始化' })
      return
    }
    var forwardHeader = {}
    Object.keys(options.header || {}).forEach(function (name) {
      forwardHeader[String(name).toLowerCase()] = options.header[name]
    })
    var timer = null
    var settled = false
    var timeoutPromise = new Promise(function (_, timeoutReject) {
      timer = setTimeout(function () {
        timeoutReject({ code: -1, message: TIMEOUT_MESSAGE })
      }, options.timeout || REQUEST_TIMEOUT)
    })
    var callPromise = new Promise(function (callResolve, callReject) {
      wx.cloud.callFunction({
        name: config.cloudFunctionName || 'api',
        data: {
          path: options.url,
          method: options.method,
          data: options.data,
          header: forwardHeader
        },
        success: function (res) {
          if (settled) return
          var result = (res && res.result) || {}
          handleResponse(options, result.statusCode || 500, result.data, callResolve, callReject)
        },
        fail: function (err) {
          if (settled) return
          handleNetworkError(options, err, callReject)
        }
      })
    })
    Promise.race([callPromise, timeoutPromise]).then(function (value) {
      settled = true
      clearTimeout(timer)
      resolve(value)
    }, function (err) {
      settled = true
      clearTimeout(timer)
      if (err && err.code === -1 && err.message === TIMEOUT_MESSAGE) {
        console.warn('[小程序请求失败]', {
          feature: options.url,
          reason: '请求超时',
          status: -1
        })
        showToast(options, TIMEOUT_MESSAGE)
      }
      reject(err)
    })
  })
}

function httpRequest(options, sendData, header) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: config.baseUrl + options.url,
      method: options.method,
      data: sendData,
      header: header,
      timeout: options.timeout || REQUEST_TIMEOUT,
      success: function (res) {
        handleResponse(options, res.statusCode, res.data, resolve, reject)
      },
      fail: function (err) {
        handleNetworkError(options, err, reject)
      }
    })
  })
}

function request(options) {
  var app = getApp()
  var header = options.header || {}
  if (app.globalData.token) {
    header['Authorization'] = 'Bearer ' + app.globalData.token
  }
  header['Content-Type'] = header['Content-Type'] || 'application/json'

  var sendData = options.data ? keysToSnakeCase(options.data) : {}
  var normalized = {
    url: options.url,
    method: options.method || 'GET',
    header: header,
    data: sendData,
    timeout: options.timeout,
    silent: Boolean(options.silent)
  }

  if (config.apiMode === 'cloud') {
    return cloudRequest(normalized)
  }
  return httpRequest(normalized, sendData, header)
}

function clearAuthAndRedirect() {
  var app = getApp()
  app.globalData.token = ''
  app.globalData.merchantInfo = null
  wx.removeStorageSync('token')
  wx.removeStorageSync('merchantInfo')
  if (authRedirecting) return
  authRedirecting = true
  wx.reLaunch({
    url: '/pages/login/login',
    complete: function () {
      setTimeout(function () {
        authRedirecting = false
      }, 300)
    }
  })
}

function get(url, data, options) {
  var opts = options || {}
  return request({
    url: url,
    method: 'GET',
    data: data,
    header: opts.header,
    timeout: opts.timeout,
    silent: opts.silent
  })
}

// 第四个参数用于向后兼容地传递 silent 等选项，不影响原有 (url, data, header) 调用
function post(url, data, header, options) {
  var opts = options || {}
  return request({
    url: url,
    method: 'POST',
    data: data,
    header: opts.header || header,
    silent: opts.silent
  })
}

function put(url, data, options) {
  var opts = options || {}
  return request({ url: url, method: 'PUT', data: data, header: opts.header, silent: opts.silent })
}

function del(url, data, options) {
  var opts = options || {}
  return request({ url: url, method: 'DELETE', data: data, header: opts.header, silent: opts.silent })
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del
}
