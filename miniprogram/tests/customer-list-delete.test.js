const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function createPage(del) {
  let page
  const wx = {
    showToast: () => {},
    showActionSheet: ({ success }) => success({ tapIndex: 0 }),
    showModal: ({ success }) => success({ confirm: true }),
    navigateTo: () => { wx.navigated = true }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/customer/list/list.js'), 'utf8'), {
    Page: value => { page = value }, wx, setTimeout: () => {},
    console: { warn: () => {} },
    require: name => name.includes('request')
      ? { get: () => Promise.resolve({ list: [] }), post: () => {}, del }
      : name.includes('auth') ? { checkLogin: () => true }
        : { api: { ledgerCustomerList: '/customers', ledgerCustomerDelete: id => '/customers/' + id } }
  })
  page.data.customers = [{ id: 2, name: '张先生', receivableBalance: 0, payableBalance: 0 }]
  page.setData = values => Object.assign(page.data, values)
  return { page, wx }
}

test('列表长按已结清对象后删除并刷新', async () => {
  let url
  const { page, wx } = createPage(value => { url = value; return Promise.resolve({ archived: true }) })
  page.onCustomerLongPress({ currentTarget: { dataset: { id: 2 } } })
  page.goDetail({ currentTarget: { dataset: { id: 2 } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(url, '/customers/2')
  assert.equal(wx.navigated, undefined)
  assert.equal(page.data.deletingCustomer, false)
  assert.equal(page.data.customers.length, 0)
})

test('列表长按未结清对象不发删除请求', () => {
  let requests = 0
  const { page } = createPage(() => { requests++ })
  page.data.customers[0].payableBalance = 10
  page.onCustomerLongPress({ currentTarget: { dataset: { id: 2 } } })
  assert.equal(requests, 0)
})

test('列表归档页长按不提供删除', () => {
  let requests = 0
  const { page } = createPage(() => { requests++ })
  page.data.archived = true
  page.onCustomerLongPress({ currentTarget: { dataset: { id: 2 } } })
  assert.equal(requests, 0)
})
