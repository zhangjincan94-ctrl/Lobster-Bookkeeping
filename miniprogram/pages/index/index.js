var { get, post } = require('../../utils/request')
var { getMerchantInfo, checkLogin } = require('../../utils/auth')
var { formatPrice } = require('../../utils/format')
var config = require('../../utils/config')

function formatDateInput(d) {
  var y = d.getFullYear()
  var m = d.getMonth() + 1
  var day = d.getDate()
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
}

Page({
  data: {
    merchantName: '',
    today: {
      sales_amount: '0.00',
      sales_count: 0,
      sales_unpaid: '0.00',
      purchase_cost: '0.00',
      purchase_count: 0,
      purchase_weight: '0',
      other_cost: '0.00',
      net_income: '0.00'
    },
    showOtherCostModal: false,
    otherCostTypes: [
      { key: 'labor', label: '人工费' },
      { key: 'packaging', label: '包装耗材' }
    ],
    otherCostForm: {
      costType: 'labor',
      amount: '',
      remark: '',
      costDate: ''
    },
    savingOtherCost: false,
    reminders: {
      receivable_amount: '¥0.00',
      payable_amount: '¥0.00',
      stock_weight: '0',
      stock_count: 0
    }
  },

  onShow: function () {
    if (!checkLogin()) return
    this.loadMerchantInfo()
    this.loadDashboard()
  },

  loadMerchantInfo: function () {
    var merchant = getMerchantInfo()
    if (merchant) {
      this.setData({
        merchantName: merchant.shopName || merchant.name || '商家'
      })
    }
  },

  loadDashboard: function () {
    var that = this
    get(config.api.statsDashboard, {}).then(function (data) {
      if (!data) return
      var t = data.today || {}
      var reminders = data.reminders || {}

      that.setData({
        today: {
          sales_amount: formatPrice(t.salesAmount),
          sales_count: t.salesCount || 0,
          sales_unpaid: formatPrice(t.salesUnpaid),
          purchase_cost: formatPrice(t.purchaseCost),
          purchase_count: t.purchaseCount || 0,
          purchase_weight: t.purchaseWeight || '0',
          other_cost: formatPrice(t.otherCost),
          net_income: formatPrice(t.netIncome)
        },
        reminders: {
          receivable_amount: formatPrice(reminders.receivableAmount),
          payable_amount: formatPrice(reminders.payableAmount),
          stock_weight: reminders.stockWeight || '0',
          stock_count: reminders.stockCount || 0
        }
      })
    }).catch(function () {})
  },

  goAddTransaction: function () {
    wx.navigateTo({ url: '/pages/transaction/add/add' })
  },

  goAddPurchase: function () {
    wx.navigateTo({ url: '/pages/purchase/add/add' })
  },

  goTransactionList: function () {
    wx.switchTab({ url: '/pages/transaction/list/list' })
  },

  goPurchaseList: function () {
    wx.switchTab({ url: '/pages/purchase/list/list' })
  },

  showOtherCostModal: function () {
    this.setData({
      showOtherCostModal: true,
      otherCostForm: {
        costType: 'labor',
        amount: '',
        remark: '',
        costDate: formatDateInput(new Date())
      }
    })
  },

  hideOtherCostModal: function () {
    if (this.data.savingOtherCost) return
    this.setData({ showOtherCostModal: false })
  },

  stopBubble: function () {},

  onOtherCostTypeTap: function (e) {
    this.setData({ 'otherCostForm.costType': e.currentTarget.dataset.type })
  },

  onOtherCostAmountInput: function (e) {
    this.setData({ 'otherCostForm.amount': e.detail.value })
  },

  onOtherCostRemarkInput: function (e) {
    this.setData({ 'otherCostForm.remark': e.detail.value })
  },

  onOtherCostDateChange: function (e) {
    this.setData({ 'otherCostForm.costDate': e.detail.value })
  },

  saveOtherCost: function () {
    var form = this.data.otherCostForm
    var amount = parseFloat(form.amount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' })
      return
    }
    if (this.data.savingOtherCost) return

    var that = this
    this.setData({ savingOtherCost: true })
    post(config.api.otherCostAdd, {
      costType: form.costType,
      amount: amount,
      costDate: form.costDate,
      remark: form.remark
    }).then(function () {
      wx.showToast({ title: '已记录', icon: 'success' })
      that.setData({ savingOtherCost: false, showOtherCostModal: false })
      that.loadDashboard()
    }).catch(function () {
      that.setData({ savingOtherCost: false })
    })
  },

  goTransactionDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/transaction/detail/detail?id=' + id })
  },

  goPurchaseDetail: function (e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/purchase/detail/detail?id=' + id })
  }
})
