var { get } = require('../../../utils/request')
var config = require('../../../utils/config')

function number(value) {
  var parsed = parseFloat(value)
  if (!isFinite(parsed)) return '0'
  return parsed.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function money(value) {
  return (Math.round((parseFloat(value) || 0) * 100) / 100).toFixed(2)
}

function truncate(value, length) {
  var text = String(value || '')
  return text.length > length ? text.slice(0, length - 1) + '…' : text
}

Page({
  data: {
    id: '',
    readOnly: false,
    bill: null,
    loading: true,
    generatingPoster: false,
    posterHeight: 500
  },

  onLoad: function (options) {
    var id = options && options.id ? options.id : ''
    this.setData({ id: id, readOnly: options && options.readonly === '1' })
    if (!id) {
      console.warn('[账单详情加载失败]', {
        feature: '账单详情',
        reason: '缺少账单ID',
        targetPage: 'pages/book/detail/detail'
      })
      this.setData({ loading: false })
    }
  },

  onShow: function () {
    if (this.data.id) this.loadBill()
  },

  loadBill: function () {
    var that = this
    if (!this.data.bill) this.setData({ loading: true })
    get(config.api.ledgerBillDetail(this.data.id), {}).then(function (bill) {
      bill.totalDisplay = '¥' + money(bill.totalAmount)
      bill.directionText = bill.direction === 'purchase' ? '进货' : '出货'
      bill.directionClass = bill.direction === 'purchase' ? 'purchase' : 'sale'
      bill.itemCount = (bill.items || []).length
      bill.items = (bill.items || []).map(function (item) {
        item.quantityDisplay = number(item.quantity) + (item.unit || '')
        item.unitPriceDisplay = money(item.unitPrice)
        item.subtotalDisplay = money(item.subtotal)
        return item
      })
      that.setData({ bill: bill, loading: false })
    }).catch(function (err) {
      console.warn('[账单详情加载失败]', {
        feature: '账单详情',
        reason: err && err.message ? err.message : '请求失败',
        billId: that.data.id
      })
      that.setData({ loading: false })
    })
  },

  sendImage: function () {
    if (!this.data.bill || this.data.generatingPoster) return
    var itemCount = this.data.bill.items.length
    var height = 214 + itemCount * 78 + 144 + (this.data.bill.remark ? 64 : 0)
    var that = this
    this.setData({ generatingPoster: true, posterHeight: height })
    wx.showLoading({ title: '正在生成' })
    wx.nextTick(function () { that.drawPoster(height) })
  },

  drawPoster: function (height) {
    var bill = this.data.bill
    var ctx = wx.createCanvasContext('billPoster', this)
    var directionColor = bill.direction === 'purchase' ? '#b58418' : '#e85a43'

    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, 750, height)
    ctx.setTextBaseline('middle')

    ctx.setFillStyle('#111817')
    ctx.setFontSize(34)
    ctx.setTextAlign('left')
    ctx.fillText('账单明细', 42, 48)

    ctx.setFillStyle('#00a9a5')
    ctx.setFontSize(30)
    ctx.fillText(bill.billDate, 42, 104)
    ctx.setFillStyle(directionColor)
    ctx.setTextAlign('right')
    ctx.fillText(truncate(bill.customerName, 12), 708, 104)

    ctx.setStrokeStyle('#d9e2e0')
    ctx.setLineWidth(2)
    ctx.beginPath()
    ctx.moveTo(36, 140)
    ctx.lineTo(714, 140)
    ctx.stroke()

    ctx.setFillStyle('#111817')
    ctx.setFontSize(28)
    ctx.setTextAlign('left')
    ctx.fillText('商品(' + bill.items.length + ')', 48, 184)
    ctx.setTextAlign('center')
    ctx.fillText('数量', 330, 184)
    ctx.fillText('单价', 490, 184)
    ctx.setTextAlign('right')
    ctx.fillText('总额', 702, 184)

    ctx.setStrokeStyle('#d9e2e0')
    ctx.beginPath()
    ctx.moveTo(36, 214)
    ctx.lineTo(714, 214)
    ctx.stroke()

    bill.items.forEach(function (item, index) {
      var rowTop = 214 + index * 78
      var centerY = rowTop + 39
      ctx.setFillStyle('#3b4745')
      ctx.setFontSize(27)
      ctx.setTextAlign('left')
      ctx.fillText(truncate(item.productName, 10), 48, centerY)
      ctx.setTextAlign('center')
      ctx.fillText(item.quantityDisplay, 330, centerY)
      ctx.fillText(item.unitPriceDisplay, 490, centerY)
      ctx.setTextAlign('right')
      ctx.fillText(item.subtotalDisplay, 702, centerY)
      ctx.setStrokeStyle('#e7eceb')
      ctx.beginPath()
      ctx.moveTo(36, rowTop + 78)
      ctx.lineTo(714, rowTop + 78)
      ctx.stroke()
    })

    var tableBottom = 214 + bill.items.length * 78
    ctx.setFillStyle('#71817e')
    ctx.setFontSize(24)
    ctx.setTextAlign('left')
    ctx.fillText('合计', 48, tableBottom + 54)
    ctx.setFillStyle(directionColor)
    ctx.setFontSize(38)
    ctx.setTextAlign('right')
    ctx.fillText('¥ ' + money(bill.totalAmount), 702, tableBottom + 54)

    var footerY = tableBottom + 105
    if (bill.remark) {
      ctx.setFillStyle('#71817e')
      ctx.setFontSize(22)
      ctx.setTextAlign('left')
      ctx.fillText('备注：' + truncate(bill.remark, 26), 48, footerY)
      footerY += 54
    }
    ctx.setFillStyle('#a6b2af')
    ctx.setFontSize(20)
    ctx.setTextAlign('center')
    ctx.fillText('龙虾记账', 375, footerY)

    var that = this
    ctx.draw(false, function () {
      wx.canvasToTempFilePath({
        canvasId: 'billPoster',
        x: 0,
        y: 0,
        width: 750,
        height: height,
        destWidth: 1500,
        destHeight: height * 2,
        fileType: 'png',
        success: function (result) {
          that.setData({ generatingPoster: false })
          wx.hideLoading()
          wx.previewImage({
            current: result.tempFilePath,
            urls: [result.tempFilePath],
            fail: function (err) {
              console.error('[账单图片预览失败]', {
                feature: '账单发图',
                reason: err && err.errMsg ? err.errMsg : '图片预览失败',
                billId: that.data.id
              })
              wx.showToast({ title: '图片预览失败', icon: 'none' })
            }
          })
        },
        fail: function (err) {
          console.error('[账单图片生成失败]', {
            feature: '账单发图',
            reason: err && err.errMsg ? err.errMsg : 'Canvas导出失败',
            billId: that.data.id,
            itemCount: bill.items.length,
            posterHeight: height
          })
          that.setData({ generatingPoster: false })
          wx.hideLoading()
          wx.showToast({ title: '图片生成失败', icon: 'none' })
        }
      }, that)
    })
  },

  sendText: function () {
    var id = this.data.id
    wx.navigateTo({
      url: '/pages/book/text/text?id=' + id,
      fail: function (err) {
        console.error('[账单文字页面打开失败]', {
          feature: '账单发字',
          reason: err && err.errMsg ? err.errMsg : '页面跳转失败',
          billId: id
        })
        wx.showToast({ title: '文字页面打开失败', icon: 'none' })
      }
    })
  },

  editBill: function () {
    var id = this.data.id
    var bill = this.data.bill
    var app = getApp()
    console.info('[账单修改入口]', {
      feature: '修改账单',
      billId: id,
      targetPage: 'pages/book/edit/edit'
    })
    app.globalData.pendingBillEdit = bill
    wx.showLoading({ title: '正在打开', mask: true })
    wx.navigateTo({
      url: '/pages/book/edit/edit?id=' + id,
      success: function (result) {
        var pages = getCurrentPages()
        var currentPage = pages.length ? pages[pages.length - 1] : null
        console.info('[账单修改页面打开成功]', {
          feature: '修改账单',
          billId: id,
          currentPage: currentPage ? currentPage.route : '',
          pageCount: pages.length
        })
      },
      fail: function (err) {
        app.globalData.pendingBillEdit = null
        wx.hideLoading()
        console.error('[账单修改页面打开失败]', {
          feature: '修改账单',
          reason: err && err.errMsg ? err.errMsg : '页面跳转失败',
          billId: id
        })
        wx.showToast({ title: '修改页面打开失败', icon: 'none' })
      }
    })
  },

  goBack: function () {
    wx.navigateBack({
      fail: function (err) {
        console.warn('[账单详情返回失败]', {
          feature: '账单详情返回',
          reason: err && err.errMsg ? err.errMsg : '页面栈没有上一页',
          fallbackPage: 'pages/book/list/list'
        })
        wx.switchTab({ url: '/pages/book/list/list' })
      }
    })
  }
})
