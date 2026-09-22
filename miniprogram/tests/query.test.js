const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
function harness(get) {
  const logs = []
  const logger = { warn: (...args) => logs.push(args) }
  const service = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'services/ledger.js'), 'utf8'), {
    module: service, console: logger,
    require: name => name.includes('request') ? { get } : { api: { ledgerBillList: '/bills' } }
  })
  let page
  const wx = { showToast: () => {}, stopPullDownRefresh: () => {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/query/list/list.js'), 'utf8'), {
    console: logger, wx, Page: value => { page = value },
    require: name => name.includes('services') ? service.exports : name.includes('auth') ? { checkLogin: () => true } : require('../utils/format')
  })
  page.setData = values => Object.assign(page.data, values)
  return { page, logs, fetch: service.exports.fetchAllBills, wx }
}
const bill = (id, direction = 'sale', amount = '1.01') => ({ id, direction, totalAmount: amount })
test('汇总101笔账单并分批展示，不遗漏第101笔进货', async () => {
  const calls = []
  const h = harness(async (_, data) => {
    calls.push(data)
    return { total: 101, list: data.page === 1 ? Array.from({ length: 100 }, (_, i) => bill(i + 1)) : [bill(101, 'purchase', '0.20')] }
  })
  await h.page.loadBills()
  assert.equal(h.page.data.totalCount, 101)
  assert.equal(h.page.data.saleAmount, '¥101.00')
  assert.equal(h.page.data.purchaseAmount, '¥0.20')
  assert.equal(h.page.data.bills.length, 30)
  h.page.loadMore(); h.page.loadMore(); h.page.loadMore()
  assert.equal(h.page.data.bills.length, 101)
  assert.equal(h.page.data.hasMore, false)
  assert.equal(calls.length, 2)
})
test('旧筛选响应不能覆盖新结果或继续加载旧分页', async () => {
  const pending = []
  const h = harness((_, data) => new Promise(resolve => pending.push({ data, resolve })))
  const first = h.page.loadBills()
  const second = h.page.chooseDirection({ currentTarget: { dataset: { direction: 'purchase' } } })
  pending[1].resolve({ total: 1, list: [bill(2, 'purchase', '8')] })
  await second
  pending[0].resolve({ total: 200, list: [bill(1)] })
  await first
  assert.equal(h.page.data.bills[0].id, 2)
  assert.equal(h.page.data.purchaseAmount, '¥8.00')
  assert.equal(pending.length, 2)
})
test('第二页失败显示错误而非部分金额或空结果', async () => {
  const h = harness(async (_, data) => {
    if (data.page === 2) throw new Error('offline')
    return { total: 2, list: [bill(1)] }
  })
  await h.page.loadBills()
  assert.ok(h.page.data.error)
  assert.equal(h.page.data.totalCount, 0)
  assert.equal(h.page.data.loading, false)
  assert.ok(h.logs.length)
})
test('拒绝缺页和重复页，避免错误汇总或无限分页', async () => {
  for (const list of [[], [bill(1)]]) {
    const h = harness(async (_, data) => ({ total: 2, list: data.page === 1 ? [bill(1)] : list }))
    await assert.rejects(h.fetch({}), /账单/)
  }
})
test('日期倒置不发请求，保留原筛选', () => {
  let count = 0
  const h = harness(() => { count++ })
  h.page.setDateRange('2026-09-23', '2026-09-22')
  assert.equal(count, 0)
  assert.equal(h.page.data.startDate, '')
  assert.equal(h.logs.length, 1)
})
test('刷新完成后才停止刷新状态；空结果是成功状态', async () => {
  let resolve
  let stopped = false
  const h = harness(() => new Promise(done => { resolve = done }))
  h.wx.stopPullDownRefresh = () => { stopped = true }
  const result = h.page.onPullDownRefresh()
  assert.equal(stopped, false)
  resolve({ total: 0, list: [] })
  await result
  assert.equal(stopped, true)
  assert.equal(h.page.data.error, '')
})
