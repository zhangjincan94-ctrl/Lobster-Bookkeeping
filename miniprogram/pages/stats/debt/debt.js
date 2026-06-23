var { get } = require('../../../utils/request')
var { formatPrice, formatDate } = require('../../../utils/format')
var { checkLogin } = require('../../../utils/auth')
var config = require('../../../utils/config')

Page({
  data: {
    list: [],
    totalDebtDisplay: '¥0.00',
    loading: false
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadData()
  },

  onPullDownRefresh: function () {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  loadData: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    var that = this
    get(config.api.statsDebtRanking, { limit: 50 }).then(function (list) {
      var arr = list || []
      var totalDebt = 0
      var processed = arr.map(function (item, index) {
        var debt = parseFloat(item.debtAmount) || 0
        totalDebt += debt
        return {
          rank: index + 1,
          buyerId: item.buyerId,
          buyerName: item.buyerName || '未知买家',
          buyerPhone: item.buyerPhone || '',
          shareToken: item.shareToken || '',
          orderCount: item.orderCount || 0,
          totalAmountDisplay: formatPrice(item.totalAmount),
          paidAmountDisplay: formatPrice(item.paidAmount),
          debtAmountDisplay: formatPrice(debt),
          debtAmount: debt,
          lastTimeDisplay: formatDate(item.lastTransactionTime)
        }
      })
      that.setData({
        list: processed,
        totalDebtDisplay: formatPrice(totalDebt),
        loading: false
      })
    }).catch(function () {
      that.setData({ loading: false })
    })
  },

  goBuyerDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/buyer/detail/detail?id=' + id })
  },

  callPhone: function (e) {
    var phone = e.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({ title: '未填写电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  onShareAppMessage: function (res) {
    if (res.from === 'button') {
      var item = res.target.dataset.item
      if (item && item.shareToken) {
        return {
          title: item.buyerName + ' 您还有 ' + item.debtAmountDisplay + ' 待付款',
          path: '/pages/share/records/records?token=' + encodeURIComponent(item.shareToken)
        }
      }
      wx.showToast({ title: '分享链接未生成，请刷新后重试', icon: 'none' })
    }
    return {
      title: '龙虾记账 - 欠款查询',
      path: '/pages/index/index'
    }
  }
})
