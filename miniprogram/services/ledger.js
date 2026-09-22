var { get } = require('../utils/request')
var config = require('../utils/config')

// 汇总必须取完所有分页，任何一页失败都不能展示部分总额。
function fetchAllBills(filters, isCurrent) {
  var collected = []
  var seen = {}
  function next(page) {
    if (isCurrent && !isCurrent()) return Promise.resolve(null)
    return get(config.api.ledgerBillList, Object.assign({}, filters, { page: page, pageSize: 100 })).then(function (data) {
      if (isCurrent && !isCurrent()) return null
      if (!data || !Array.isArray(data.list) || !Number.isInteger(Number(data.total)) || Number(data.total) < 0) {
        throw new Error('账单分页数据格式异常')
      }
      var total = Number(data.total)
      data.list.forEach(function (bill) {
        if (!bill.id || seen[bill.id]) throw new Error('账单分页出现重复或缺失记录，请刷新')
        seen[bill.id] = true
      })
      collected = collected.concat(data.list)
      if (collected.length > total || (!data.list.length && collected.length < total)) {
        throw new Error('账单数据已变化，请刷新后重试')
      }
      if (collected.length < total) return next(page + 1)
      return collected
    })
  }
  return next(1).catch(function (err) {
    if (isCurrent && !isCurrent()) return null
    console.warn('[账单分页加载失败]', { feature: '账单汇总', reason: err.message || '请求失败', filters: filters, loadedCount: collected.length })
    throw err
  })
}

module.exports = { fetchAllBills: fetchAllBills }
