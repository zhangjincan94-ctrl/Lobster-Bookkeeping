function formatPrice(num) {
  if (num === null || num === undefined) {
    return '¥0.00'
  }
  var val = parseFloat(num)
  if (isNaN(val)) {
    return '¥0.00'
  }
  return '¥' + val.toFixed(2)
}

// 两位小数并去掉无意义的末尾 0，用于数量、单价、小计等不带 ¥ 的场景
function formatNumber(num) {
  if (num === null || num === undefined) {
    return '0'
  }
  var val = parseFloat(num)
  if (isNaN(val)) {
    return '0'
  }
  return val.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

// 带符号金额：正数 +¥x.xx、负数 -¥x.xx、零 ¥0.00
function formatSignedPrice(num) {
  var val = parseFloat(num)
  if (isNaN(val) || val === 0) {
    return '¥0.00'
  }
  return (val > 0 ? '+' : '-') + formatPrice(Math.abs(val))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  var d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  var year = d.getFullYear()
  var month = padZero(d.getMonth() + 1)
  var day = padZero(d.getDate())
  var hour = padZero(d.getHours())
  var minute = padZero(d.getMinutes())
  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute
}

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

function paymentStatusText(status) {
  var map = {
    0: '未付款',
    1: '已结账',
    2: '部分付款'
  }
  return map[status] !== undefined ? map[status] : '未知'
}

function deliveryStatusText(status) {
  var map = {
    0: '待配送',
    1: '配送中',
    2: '已送达'
  }
  return map[status] !== undefined ? map[status] : '未知'
}

function paymentStatusClass(status) {
  var map = {
    0: 'tag-unpaid',
    1: 'tag-paid',
    2: 'tag-partial'
  }
  return map[status] || 'tag-unpaid'
}

function deliveryStatusClass(status) {
  var map = {
    0: 'tag-pending',
    1: 'tag-delivering',
    2: 'tag-delivered'
  }
  return map[status] || 'tag-pending'
}

function orderStatusText(status) {
  return Number(status) === 1 ? '已取消' : '进行中'
}

function orderStatusClass(status) {
  return Number(status) === 1 ? 'tag-cancelled' : 'tag-paid'
}

module.exports = {
  formatPrice: formatPrice,
  formatNumber: formatNumber,
  formatSignedPrice: formatSignedPrice,
  formatDate: formatDate,
  paymentStatusText: paymentStatusText,
  deliveryStatusText: deliveryStatusText,
  paymentStatusClass: paymentStatusClass,
  deliveryStatusClass: deliveryStatusClass,
  orderStatusText: orderStatusText,
  orderStatusClass: orderStatusClass
}
