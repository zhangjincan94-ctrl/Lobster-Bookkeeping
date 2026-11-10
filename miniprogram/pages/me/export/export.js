var config = require('../../../utils/config')
var theme = require('../../../utils/theme')
var request = require('../../../utils/request')
var format = require('../../../utils/format')

// 云函数返回结果有 1MB 上限，云模式下主动限制导出体积；HTTP 模式可用更大的上限。
var CLOUD_MAX_BYTES = 900 * 1000
var HTTP_MAX_BYTES = 4000 * 1000

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function dateStr(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

function shiftMonths(date, months) {
  var year = date.getFullYear()
  var month = date.getMonth() + months
  var lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(date.getDate(), lastDay))
}

function computeRange(key, now) {
  var end = dateStr(now)
  if (key === 'month') {
    return { start: dateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end: end }
  }
  if (key === 'year') {
    return { start: dateStr(new Date(now.getFullYear(), 0, 1)), end: end }
  }
  return { start: dateStr(shiftMonths(now, -3)), end: end }
}

function writeFile(fileName, base64) {
  return new Promise(function (resolve, reject) {
    var filePath = wx.env.USER_DATA_PATH + '/' + fileName
    wx.getFileSystemManager().writeFile({
      filePath: filePath,
      data: base64,
      encoding: 'base64',
      success: function () {
        resolve(filePath)
      },
      fail: function (err) {
        reject({
          step: '写入文件',
          message: '文件写入失败，请清理小程序缓存后重试',
          reason: (err && err.errMsg) || 'writeFile fail',
          fileName: fileName
        })
      }
    })
  })
}

Page({
  data: {
    theme: '',
    ranges: [
      { key: 'month', label: '本月' },
      { key: 'quarter', label: '近3个月' },
      { key: 'year', label: '今年' },
      { key: 'custom', label: '自定义' }
    ],
    rangeKey: 'quarter',
    startDate: '',
    endDate: '',
    today: '',
    rangeText: '',
    includeItems: true,
    generating: false,
    generated: false,
    filePath: '',
    shareName: '',
    summary: null
  },

  onLoad: function () {
    var now = new Date()
    var range = computeRange('quarter', now)
    this.setData({
      today: dateStr(now),
      startDate: range.start,
      endDate: range.end,
      rangeText: range.start + ' 至 ' + range.end
    })
  },

  onShow: function () {
    this.setData({ theme: theme.get() })
  },

  chooseRange: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.data.rangeKey) return
    var patch = { rangeKey: key }
    if (key !== 'custom') {
      var range = computeRange(key, new Date())
      patch.startDate = range.start
      patch.endDate = range.end
      patch.rangeText = range.start + ' 至 ' + range.end
    }
    this.setData(patch)
  },

  syncRangeText: function () {
    var start = this.data.startDate
    var end = this.data.endDate
    if (!start || !end) {
      this.setData({ rangeText: '请选择时间范围' })
      return
    }
    this.setData({ rangeText: start > end ? '开始日期晚于结束日期' : start + ' 至 ' + end })
  },

  onStartChange: function (e) {
    this.setData({ startDate: e.detail.value })
    this.syncRangeText()
  },

  onEndChange: function (e) {
    this.setData({ endDate: e.detail.value })
    this.syncRangeText()
  },

  chooseMode: function (e) {
    var mode = e.currentTarget.dataset.mode
    if (mode === 'items') this.setData({ includeItems: true })
    if (mode === 'summary') this.setData({ includeItems: false })
  },

  onGenerate: function () {
    if (this.data.generating) return
    var start = this.data.startDate
    var end = this.data.endDate
    if (!start || !end) {
      wx.showToast({ title: '请选择时间范围', icon: 'none' })
      return
    }
    if (start > end) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' })
      return
    }

    var that = this
    this.setData({ generating: true, generated: false })
    request.get(config.api.ledgerBillExport, {
      start_date: start,
      end_date: end,
      include_items: this.data.includeItems ? 1 : 0,
      max_bytes: config.apiMode === 'cloud' ? CLOUD_MAX_BYTES : HTTP_MAX_BYTES
    }, { timeout: 30000, silent: true }).then(function (data) {
      if (!data || !data.content) {
        throw { message: '导出失败，请稍后重试' }
      }
      var fileName = data.fileName || ('bills_' + start + '_' + end + '.xlsx')
      var shareName = data.displayName || ('龙虾记账账单_' + start + '_' + end + '.xlsx')
      return writeFile(fileName, data.content).then(function (filePath) {
        var sizeKb = Math.max(1, Math.round(data.content.length * 0.75 / 1024))
        that.setData({
          generating: false,
          generated: true,
          filePath: filePath,
          shareName: shareName,
          summary: {
            billCount: data.billCount || 0,
            itemCount: data.itemCount || 0,
            rangeText: (data.startDate || start) + ' 至 ' + (data.endDate || end),
            saleText: format.formatSignedPrice(data.saleAmount),
            purchaseText: format.formatSignedPrice(-(data.purchaseAmount || 0)),
            netText: format.formatSignedPrice(data.netAmount),
            sizeText: sizeKb >= 1024 ? (sizeKb / 1024).toFixed(1) + ' MB' : sizeKb + ' KB'
          }
        })
        that.openFile()
      })
    }).catch(function (err) {
      that.setData({ generating: false })
      console.error('[账单导出失败]', {
        feature: '导出账单',
        step: (err && err.step) || '生成文件',
        reason: (err && (err.reason || err.message)) || '未知错误',
        code: err && err.code,
        startDate: start,
        endDate: end,
        mode: that.data.includeItems ? '汇总+明细' : '仅汇总',
        fileName: err && err.fileName
      })
      wx.showToast({
        title: (err && err.message) || '导出失败，请稍后重试',
        icon: 'none',
        duration: 2500
      })
    })
  },

  openFile: function () {
    if (!this.data.filePath) return
    var filePath = this.data.filePath
    wx.openDocument({
      filePath: filePath,
      fileType: 'xlsx',
      showMenu: true,
      fail: function (err) {
        console.error('[账单导出失败]', {
          feature: '导出账单',
          step: '打开文件',
          reason: (err && err.errMsg) || 'openDocument fail',
          filePath: filePath
        })
        wx.showToast({ title: '打开失败，可点「发送到微信」查看', icon: 'none', duration: 2500 })
      }
    })
  },

  onOpenFile: function () {
    this.openFile()
  },

  onShareFile: function () {
    if (!this.data.filePath) return
    var that = this
    if (typeof wx.shareFileMessage !== 'function') {
      wx.showToast({ title: '当前微信版本不支持转发文件', icon: 'none' })
      return
    }
    wx.shareFileMessage({
      filePath: this.data.filePath,
      fileName: this.data.shareName,
      fail: function (err) {
        var msg = (err && err.errMsg) || ''
        if (/cancel/i.test(msg)) return
        console.error('[账单导出失败]', {
          feature: '导出账单',
          step: '转发文件',
          reason: msg || 'shareFileMessage fail',
          filePath: that.data.filePath,
          fileName: that.data.shareName
        })
        wx.showToast({ title: '转发失败，可先点「打开文件」', icon: 'none', duration: 2500 })
      }
    })
  }
})
