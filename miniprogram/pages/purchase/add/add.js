var { get, post } = require('../../../utils/request')
var { formatPrice } = require('../../../utils/format')
var config = require('../../../utils/config')

var debounceTimer = null

Page({
  data: {
    supplierKeywords: '',
    supplierList: [],
    showSupplierDropdown: false,
    selectedSupplierId: '',
    supplierName: '',
    supplierPhone: '',
    lobsterSizes: ['小青(2-4钱)', '中青(4-6钱)', '大青(6-8钱)', '炮头青>9钱', '小红(2-4钱)', '中红(4-6钱)', '大红(6-8钱)', '炮头红>9钱', '统货'],
    lobsterSizeIndex: 0,
    grossWeight: '',
    tareWeight: '',
    deductWeight: '',
    netWeight: '',
    unitCost: '',
    totalCost: '¥0.00',
    settlementStatusOptions: ['未结清', '已结清', '部分付款'],
    settlementStatusIndex: 0,
    paidAmount: '',
    receivedDate: '',
    receivedTime: '',
    remark: '',
    submitting: false
  },

  onLoad: function (options) {
    var now = new Date()
    this.setData({
      receivedDate: this.formatDatePart(now),
      receivedTime: this.formatTimePart(now)
    })

    if (options && options.supplier_id) {
      this.loadSupplierInfo(options.supplier_id)
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

  loadSupplierInfo: function (supplierId) {
    var that = this
    get(config.api.supplierDetail(supplierId)).then(function (data) {
      if (!data) return
      that.setData({
        selectedSupplierId: data.id,
        supplierName: data.name || '',
        supplierPhone: data.phone || ''
      })
    }).catch(function () {})
  },

  onSupplierInput: function (e) {
    var value = e.detail.value
    this.setData({
      supplierName: value,
      selectedSupplierId: '',
      supplierKeywords: value
    })

    var that = this
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(function () {
      that.loadSupplierOptions(value.trim())
    }, 300)
  },

  onSupplierFocus: function () {
    this.loadSupplierOptions(this.data.supplierName.trim())
  },

  onSupplierBlur: function () {
    var that = this
    setTimeout(function () {
      that.setData({ showSupplierDropdown: false })
    }, 150)
  },

  loadSupplierOptions: function (keyword) {
    var that = this
    var params = { pageSize: 20 }
    if (keyword) params.keyword = keyword
    get(config.api.supplierList, params).then(function (data) {
      var list = (data && data.list) || []
      that.setData({
        supplierList: list,
        showSupplierDropdown: true
      })
    }).catch(function () {
      that.setData({ supplierList: [], showSupplierDropdown: false })
    })
  },

  onSelectSupplier: function (e) {
    var supplier = this.data.supplierList[e.currentTarget.dataset.index]
    this.setData({
      selectedSupplierId: supplier.id,
      supplierName: supplier.name || '',
      supplierPhone: supplier.phone || '',
      showSupplierDropdown: false,
      supplierList: []
    })
  },

  onSupplierPhoneInput: function (e) {
    this.setData({ supplierPhone: e.detail.value })
  },

  onLobsterSizeChange: function (e) {
    this.setData({ lobsterSizeIndex: Number(e.detail.value) })
  },

  onGrossWeightInput: function (e) {
    this.setData({ grossWeight: e.detail.value })
    this.calculateAmounts()
  },

  onTareWeightInput: function (e) {
    this.setData({ tareWeight: e.detail.value })
    this.calculateAmounts()
  },

  onDeductWeightInput: function (e) {
    this.setData({ deductWeight: e.detail.value })
    this.calculateAmounts()
  },

  onNetWeightInput: function (e) {
    this.setData({ netWeight: e.detail.value })
    this.calculateTotal()
  },

  onUnitCostInput: function (e) {
    this.setData({ unitCost: e.detail.value })
    this.calculateTotal()
  },

  calculateAmounts: function () {
    var gross = parseFloat(this.data.grossWeight) || 0
    var tare = parseFloat(this.data.tareWeight) || 0
    var deduct = parseFloat(this.data.deductWeight) || 0
    var net = gross - tare - deduct
    if (net < 0) net = 0
    this.setData({ netWeight: net ? net.toFixed(2) : '' })
    this.calculateTotal()
  },

  calculateTotal: function () {
    var net = parseFloat(this.data.netWeight) || 0
    var cost = parseFloat(this.data.unitCost) || 0
    this.setData({ totalCost: formatPrice(net * cost) })
  },

  onSettlementStatusChange: function (e) {
    this.setData({ settlementStatusIndex: Number(e.detail.value) })
  },

  onPaidAmountInput: function (e) {
    this.setData({ paidAmount: e.detail.value })
  },

  onReceivedDateChange: function (e) {
    this.setData({ receivedDate: e.detail.value })
  },

  onReceivedTimeChange: function (e) {
    this.setData({ receivedTime: e.detail.value })
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  onSubmit: function () {
    if (this.data.submitting) return

    var supplierName = this.data.supplierName.trim()
    if (!supplierName) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' })
      return
    }

    var net = parseFloat(this.data.netWeight) || 0
    var unitCost = parseFloat(this.data.unitCost) || 0
    if (net <= 0) {
      wx.showToast({ title: '请输入有效斤数', icon: 'none' })
      return
    }
    if (unitCost <= 0) {
      wx.showToast({ title: '请输入有效单价', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    var that = this
    var submitData = this.buildSubmitData()
    if (this.data.selectedSupplierId) {
      submitData.supplierId = this.data.selectedSupplierId
      that.doSubmit(submitData)
    } else {
      that.setData({ submitting: false })
      wx.showModal({
        title: '新建供应商？',
        content: '"' + supplierName + '" 不在你的供应商列表中，是否将其加入供应商管理？',
        confirmText: '加入并保存',
        cancelText: '取消',
        success: function (res) {
          if (!res.confirm) return
          that.setData({ submitting: true })
          post(config.api.supplierAdd, {
            name: supplierName,
            phone: that.data.supplierPhone.trim()
          }).then(function (data) {
            submitData.supplierId = (data && data.id) || ''
            that.doSubmit(submitData)
          }).catch(function () {
            that.setData({ submitting: false })
          })
        }
      })
    }
  },

  buildSubmitData: function () {
    var net = parseFloat(this.data.netWeight) || 0
    var unitCost = parseFloat(this.data.unitCost) || 0
    var total = net * unitCost
    var paid = '0'
    if (this.data.settlementStatusIndex === 1) {
      paid = total.toFixed(2)
    } else if (this.data.settlementStatusIndex === 2) {
      paid = this.data.paidAmount
    }

    return {
      lobsterSize: this.data.lobsterSizes[this.data.lobsterSizeIndex],
      grossWeight: net.toFixed(2),
      tareWeight: '0',
      deductWeight: '0',
      netWeight: net.toFixed(2),
      unitCost: unitCost.toFixed(2),
      totalCost: total.toFixed(2),
      settlementStatus: this.data.settlementStatusIndex,
      paidAmount: paid,
      receivedAt: this.data.receivedDate + ' ' + this.data.receivedTime + ':00',
      remark: this.data.remark.trim()
    }
  },

  doSubmit: function (data) {
    var that = this
    post(config.api.purchaseAdd, data).then(function () {
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 1500)
    }).catch(function () {
      that.setData({ submitting: false })
    })
  }
})
