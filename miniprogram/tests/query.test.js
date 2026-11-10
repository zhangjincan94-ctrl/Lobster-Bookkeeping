const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')

function harness(get) {
  const logs = []
  const logger = { warn: (...args) => logs.push(args) }
  let page
  const wx = { showToast: () => {}, stopPullDownRefresh: () => {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/query/list/list.js'), 'utf8'), {
    console: logger, wx, Date, Page: value => { page = value },
    require: name => name.includes('request') ? { get }
      : name.includes('auth') ? { checkLogin: () => true }
        : name.includes('config') ? { api: { ledgerBillList: '/bills' } }
          : require('../utils/format')
  })
  page.setData = values => Object.assign(page.data, values)
  return { page, logs, wx }
}

const bill = (id, direction = 'sale', amount = '1.01') => ({ id, direction, totalAmount: amount, itemCount: 2 })
const pageOfBills = (start, count, direction = 'sale') => Array.from({ length: count }, (_, i) => bill(start + i, direction))

test('首屏只请求第一页并使用服务端汇总', async () => {
  const calls = []
  const h = harness(async (_, data) => {
    calls.push(data)
    return { total: 65, list: pageOfBills(1, 30), totals: { saleAmount: 30.3, purchaseAmount: 10 } }
  })
  await h.page.loadBills()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].page, 1)
  assert.equal(calls[0].pageSize, 30)
  assert.equal(h.page.data.bills.length, 30)
  assert.equal(h.page.data.totalCount, 65)
  assert.equal(h.page.data.saleAmount, '¥30.30')
  assert.equal(h.page.data.purchaseAmount, '¥10.00')
  assert.equal(h.page.data.hasMore, true)
})

test('触底按页追加并可继续查看全部结果', async () => {
  const pages = []
  const h = harness(async (_, data) => {
    pages.push(data.page)
    if (data.page === 1) return { total: 65, list: pageOfBills(1, 30), totals: { saleAmount: 30, purchaseAmount: 0 } }
    if (data.page === 2) return { total: 65, list: pageOfBills(31, 30), totals: { saleAmount: 60, purchaseAmount: 0 } }
    return { total: 65, list: pageOfBills(61, 5, 'purchase'), totals: { saleAmount: 60, purchaseAmount: 5 } }
  })
  await h.page.loadBills()
  await h.page.onReachBottom()
  await h.page.onReachBottom()
  assert.deepEqual(pages, [1, 2, 3])
  assert.equal(h.page.data.bills.length, 65)
  assert.equal(h.page.data.hasMore, false)
  assert.equal(h.page.data.purchaseAmount, '¥5.00')
})

test('切换筛选重置到第一页并丢弃旧响应', async () => {
  const pending = []
  const h = harness(() => new Promise(resolve => pending.push(resolve)))
  const first = h.page.loadBills()
  const second = h.page.chooseDirection({ currentTarget: { dataset: { direction: 'purchase' } } })
  pending[1]({ total: 1, list: [bill(2, 'purchase', '8')], totals: { saleAmount: 0, purchaseAmount: 8 } })
  await second
  pending[0]({ total: 200, list: [bill(1)], totals: { saleAmount: 1, purchaseAmount: 0 } })
  await first
  assert.equal(h.page.data.bills[0].id, 2)
  assert.equal(h.page.data.totalCount, 1)
  assert.equal(h.page.data.purchaseAmount, '¥8.00')
})

test('加载更多失败保留已加载数据并提示', async () => {
  const h = harness(async (_, data) => {
    if (data.page === 2) throw new Error('offline')
    return { total: 40, list: pageOfBills(1, 30), totals: { saleAmount: 30, purchaseAmount: 0 } }
  })
  await h.page.loadBills()
  await h.page.loadMore()
  assert.equal(h.page.data.bills.length, 30)
  assert.equal(h.page.data.loadingMore, false)
  assert.equal(h.page.data.error, '')
  assert.equal(h.page.data.hasMore, true)
  assert.ok(h.logs.length)
})

test('账单格式异常时显示查询失败，不展示部分数据', async () => {
  const h = harness(async () => ({ total: 1, list: [{ id: 1, direction: 'unknown', totalAmount: '1' }], totals: {} }))
  await h.page.loadBills()
  assert.ok(h.page.data.error)
  assert.equal(h.page.data.bills.length, 0)
  assert.equal(h.page.data.totalCount, 0)
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
  const h = harness(() => new Promise(done => { resolve = done }))
  h.wx.stopPullDownRefresh = () => { h.stopped = true }
  const result = h.page.onPullDownRefresh()
  assert.equal(h.stopped, undefined)
  resolve({ total: 0, list: [], totals: { saleAmount: 0, purchaseAmount: 0 } })
  await result
  assert.equal(h.stopped, true)
  assert.equal(h.page.data.error, '')
})
