var { get, post } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')

var debounceTimer = null

Page({
  data: {
    buyerKeywords: '',
    buyerList: [],
    showBuyerDropdown: false,
    selectedBuyerId: '',
    buyerName: '',
    buyerPhone: '',
    lobsterSizes: ['小青(2-4钱)', '中青(4-6钱)', '大青(6-8钱)', '炮头青(>9钱)', '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红(>9钱)'],
    lobsterSizeIndex: 0,
    weight: '',
    unitPrice: '',
    totalAmount: '¥0.00',
    paymentStatusOptions: ['未付款', '已付款', '部分付款'],
    paymentStatusIndex: 0,
    paidAmount: '',
    sourceOptions: [],
    selectedSources: [],
    showSourceModal: false,
    sourceLoading: false,
    sourceTotalWeight: '0.00',
    sourceUnallocatedWeight: '0.00',
    deliveryAddress: '',
    deliveryStatusOptions: ['待配送', '配送中', '已送达'],
    deliveryStatusIndex: 0,
    deliveryTime: '',
    remark: '',
    transactionDate: '',
    transactionTime: '',
    submitting: false
  },

  onLoad: function (options) {
    var now = new Date()
    var dateStr = this.formatDatePart(now)
    var timeStr = this.formatTimePart(now)
    this.setData({
      transactionDate: dateStr,
      transactionTime: timeStr
    })

    if (options && options.buyer_id) {
      this.loadBuyerInfo(options.buyer_id)
    }
  },

  formatDatePart: function (d) {
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
  },

  formatTimePart: function (d) {
    var h = d.getHours()
    var min = d.getMinutes()
    return (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min)
  },

  loadBuyerInfo: function (buyerId) {
    var that = this
    get(config.api.buyerDetail(buyerId)).then(function (data) {
      if (data) {
        that.setData({
          selectedBuyerId: data.id,
          buyerName: data.name || '',
          buyerPhone: data.phone || ''
        })
      }
    }).catch(function () {})
  },

  onBuyerInput: function (e) {
    var value = e.detail.value
    this.setData({
      buyerName: value,
      selectedBuyerId: '',
      buyerKeywords: value
    })

    var that = this
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(function () {
      if (value.trim()) {
        that.searchBuyers(value.trim())
      } else {
        that.setData({ buyerList: [], showBuyerDropdown: false })
      }
    }, 300)
  },

  onBuyerFocus: function () {
    if (this.data.buyerList.length > 0) {
      this.setData({ showBuyerDropdown: true })
    }
  },

  onBuyerBlur: function () {
    var that = this
    setTimeout(function () {
      that.setData({ showBuyerDropdown: false })
    }, 150)
  },

  searchBuyers: function (keyword) {
    var that = this
    get(config.api.buyerList, { keyword: keyword, pageSize: 10 }).then(function (data) {
      var list = (data && data.list) || []
      that.setData({
        buyerList: list,
        showBuyerDropdown: list.length > 0
      })
    }).catch(function () {
      that.setData({ buyerList: [], showBuyerDropdown: false })
    })
  },

  onSelectBuyer: function (e) {
    var index = e.currentTarget.dataset.index
    var buyer = this.data.buyerList[index]
    this.setData({
      selectedBuyerId: buyer.id,
      buyerName: buyer.name || '',
      buyerPhone: buyer.phone || '',
      showBuyerDropdown: false,
      buyerList: []
    })
  },

  onBuyerPhoneInput: function (e) {
    this.setData({ buyerPhone: e.detail.value })
  },

  onLobsterSizeChange: function (e) {
    this.setData({
      lobsterSizeIndex: Number(e.detail.value),
      sourceOptions: [],
      selectedSources: [],
      sourceTotalWeight: '0.00',
      sourceUnallocatedWeight: this.getSaleWeight().toFixed(2)
    })
  },

  onWeightInput: function (e) {
    this.setData({ weight: e.detail.value })
    this.calculateTotal()
    this.updateSourceTotals()
  },

  onUnitPriceInput: function (e) {
    this.setData({ unitPrice: e.detail.value })
    this.calculateTotal()
  },

  calculateTotal: function () {
    var w = parseFloat(this.data.weight) || 0
    var p = parseFloat(this.data.unitPrice) || 0
    var total = w * p
    this.setData({ totalAmount: formatPrice(total) })
  },

  getSaleWeight: function () {
    return parseFloat(this.data.weight) || 0
  },

  getSelectedSourceWeight: function () {
    var total = 0
    for (var i = 0; i < this.data.selectedSources.length; i++) {
      total += parseFloat(this.data.selectedSources[i].weight) || 0
    }
    return total
  },

  updateSourceTotals: function () {
    var sourceTotal = this.getSelectedSourceWeight()
    var unallocated = this.getSaleWeight() - sourceTotal
    this.setData({
      sourceTotalWeight: sourceTotal.toFixed(2),
      sourceUnallocatedWeight: unallocated.toFixed(2)
    })
  },

  onOpenSourceModal: function () {
    if (this.getSaleWeight() <= 0) {
      wx.showToast({ title: '请先输入销售重量', icon: 'none' })
      return
    }
    this.setData({ showSourceModal: true })
    this.loadSourceOptions()
  },

  onCloseSourceModal: function () {
    this.setData({ showSourceModal: false })
  },

  noop: function () {},

  loadSourceOptions: function () {
    var that = this
    this.setData({ sourceLoading: true })
    get(config.api.purchaseAvailable, {
      lobsterSize: this.data.lobsterSizes[this.data.lobsterSizeIndex],
      pageSize: 50
    }).then(function (data) {
      var list = (data && data.list) || []
      var options = list.map(function (item) {
        return {
          id: item.id,
          supplierName: item.supplierName || '未知供应商',
          lobsterSize: item.lobsterSize || '',
          remainingWeight: parseFloat(item.remainingWeight) || 0,
          remainingWeightDisplay: (parseFloat(item.remainingWeight) || 0).toFixed(2),
          unitCost: item.unitCost || '',
          receivedAt: item.receivedAt || ''
        }
      })
      that.setData({
        sourceOptions: options,
        sourceLoading: false
      })
    }).catch(function () {
      that.setData({ sourceOptions: [], sourceLoading: false })
    })
  },

  onSelectSource: function (e) {
    var index = e.currentTarget.dataset.index
    var source = this.data.sourceOptions[index]
    if (!source) return

    for (var i = 0; i < this.data.selectedSources.length; i++) {
      if (String(this.data.selectedSources[i].purchaseRecordId) === String(source.id)) {
        wx.showToast({ title: '该货源已选择', icon: 'none' })
        return
      }
    }

    var needed = this.getSaleWeight() - this.getSelectedSourceWeight()
    var weight = Math.min(needed > 0 ? needed : source.remainingWeight, source.remainingWeight)
    if (weight <= 0) {
      wx.showToast({ title: '销售重量已分配完', icon: 'none' })
      return
    }

    var selected = this.data.selectedSources.concat([{
      purchaseRecordId: source.id,
      supplierName: source.supplierName,
      remainingWeight: source.remainingWeight,
      remainingWeightDisplay: source.remainingWeightDisplay,
      unitCost: source.unitCost,
      weight: weight.toFixed(2)
    }])
    this.setData({ selectedSources: selected })
    this.updateSourceTotals()
  },

  onSourceWeightInput: function (e) {
    var index = e.currentTarget.dataset.index
    var selected = this.data.selectedSources.slice()
    if (!selected[index]) return
    selected[index].weight = e.detail.value
    this.setData({ selectedSources: selected })
    this.updateSourceTotals()
  },

  onRemoveSource: function (e) {
    var index = e.currentTarget.dataset.index
    var selected = this.data.selectedSources.slice()
    selected.splice(index, 1)
    this.setData({ selectedSources: selected })
    this.updateSourceTotals()
  },

  onPaymentStatusChange: function (e) {
    this.setData({ paymentStatusIndex: Number(e.detail.value) })
  },

  onPaidAmountInput: function (e) {
    this.setData({ paidAmount: e.detail.value })
  },

  onDeliveryAddressInput: function (e) {
    this.setData({ deliveryAddress: e.detail.value })
  },

  onDeliveryStatusChange: function (e) {
    this.setData({ deliveryStatusIndex: Number(e.detail.value) })
  },

  onDeliveryTimeChange: function (e) {
    this.setData({ deliveryTime: e.detail.value })
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  onTransactionDateChange: function (e) {
    this.setData({ transactionDate: e.detail.value })
  },

  onTransactionTimeChange: function (e) {
    this.setData({ transactionTime: e.detail.value })
  },

  onSubmit: function () {
    if (this.data.submitting) return

    var buyerName = this.data.buyerName.trim()
    if (!buyerName) {
      wx.showToast({ title: '请输入买家姓名', icon: 'none' })
      return
    }

    var w = parseFloat(this.data.weight) || 0
    var p = parseFloat(this.data.unitPrice) || 0
    if (w <= 0) {
      wx.showToast({ title: '请输入重量', icon: 'none' })
      return
    }
    if (p <= 0) {
      wx.showToast({ title: '请输入单价', icon: 'none' })
      return
    }

    if (!this.validateSourceAllocations(w)) return

    this.setData({ submitting: true })

    var that = this
    var submitData = this.buildSubmitData()

    if (this.data.selectedBuyerId) {
      submitData.buyerId = this.data.selectedBuyerId
      that.doSubmit(submitData)
    } else {
      post(config.api.buyerAdd, {
        name: buyerName,
        phone: this.data.buyerPhone.trim()
      }).then(function (data) {
        submitData.buyerId = (data && data.id) || ''
        that.doSubmit(submitData)
      }).catch(function () {
        that.setData({ submitting: false })
      })
    }
  },

  buildSubmitData: function () {
    var w = parseFloat(this.data.weight) || 0
    var p = parseFloat(this.data.unitPrice) || 0
    var total = w * p
    var lobsterSize = this.data.lobsterSizes[this.data.lobsterSizeIndex]

    var submitData = {
      lobsterSize: lobsterSize,
      weight: this.data.weight,
      unitPrice: this.data.unitPrice,
      totalAmount: total.toFixed(2),
      paymentStatus: this.data.paymentStatusIndex,
      paidAmount: this.data.paymentStatusIndex === 2 ? this.data.paidAmount : (this.data.paymentStatusIndex === 1 ? total.toFixed(2) : '0'),
      deliveryAddress: this.data.deliveryAddress.trim(),
      deliveryStatus: this.data.deliveryStatusIndex,
      deliveryTime: this.data.deliveryTime,
      remark: this.data.remark.trim(),
      transactionTime: this.data.transactionDate + ' ' + this.data.transactionTime + ':00'
    }
    if (this.data.selectedSources.length > 0) {
      submitData.sourceAllocations = this.data.selectedSources.map(function (item) {
        return {
          purchaseRecordId: item.purchaseRecordId,
          weight: item.weight
        }
      })
    }
    return submitData
  },

  validateSourceAllocations: function (saleWeight) {
    if (this.data.selectedSources.length === 0) return true

    var total = 0
    for (var i = 0; i < this.data.selectedSources.length; i++) {
      var item = this.data.selectedSources[i]
      var weight = parseFloat(item.weight) || 0
      if (weight <= 0) {
        wx.showToast({ title: '货源分摊重量必须大于0', icon: 'none' })
        return false
      }
      if (weight - item.remainingWeight > 0.0001) {
        wx.showToast({ title: '货源分摊不能超过剩余库存', icon: 'none' })
        return false
      }
      total += weight
    }

    if (Math.abs(total - saleWeight) > 0.01) {
      wx.showToast({ title: '货源分摊重量需等于销售重量', icon: 'none' })
      return false
    }
    return true
  },

  doSubmit: function (data) {
    var that = this
    post(config.api.transactionAdd, data).then(function () {
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 1500)
    }).catch(function () {
      that.setData({ submitting: false })
    })
  }
})
