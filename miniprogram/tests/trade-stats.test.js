const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function createPage(get) {
  let page
  const wx = {
    nextTick: callback => callback(),
    stopPullDownRefresh: () => {},
    createCanvasContext: () => ({
      setLineWidth: () => {}, setLineCap: () => {}, setStrokeStyle: () => {},
      beginPath: () => {}, arc: () => {}, stroke: () => {}, draw: () => {}
    })
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/stats/trade/trade.js'), 'utf8'), {
    Page: value => { page = value }, wx, Date, Math, Number, Array, String,
    console: { warn: () => {} },
    require: name => name.includes('request') ? { get }
      : name.includes('auth') ? { checkLogin: () => true }
        : { api: { ledgerTradeStats: '/stats/trade' } }
  })
  page.setData = values => Object.assign(page.data, values)
  return page
}

test('交易统计展示金额占比、周期变化和选中柱明细', async () => {
  const page = createPage(() => Promise.resolve({
    days: 7, startDate: '2026-09-18', endDate: '2026-09-24',
    saleAmount: 120, purchaseAmount: 80, orderCount: 4,
    previousSaleAmount: 100, previousPurchaseAmount: 100,
    daily: [{ date: '2026-09-24', saleAmount: 120, purchaseAmount: 80, orderCount: 4 }]
  }))
  page.loadStats()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.salePercent, 60)
  assert.equal(page.data.purchasePercent, 40)
  assert.equal(page.data.saleChange, '较上期 +20%')
  assert.equal(page.data.bars.length, 7)
  assert.equal(page.data.selectedBar.count, 4)
})

test('无交易时图表保留空状态且占比为零', async () => {
  const page = createPage(() => Promise.resolve({
    days: 7, startDate: '2026-09-18', endDate: '2026-09-24',
    saleAmount: 0, purchaseAmount: 0, orderCount: 0,
    daily: []
  }))
  page.loadStats()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.empty, true)
  assert.equal(page.data.salePercent, 0)
  assert.equal(page.data.error, false)
})
