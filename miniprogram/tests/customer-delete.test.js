const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function createPage(del) {
  let page
  const wx = {
    showToast: () => {},
    showModal: ({ success }) => success({ confirm: true }),
    navigateBack: () => { wx.navigatedBack = true }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/customer/detail/detail.js'), 'utf8'), {
    Page: value => { page = value }, wx,
    console: { warn: () => {} },
    require: name => name.includes('request') ? { get: () => {}, post: () => {}, del } : { api: { ledgerCustomerDelete: id => '/customers/' + id } }
  })
  page.data.id = 2
  page.data.book = { customer: { id: 2, name: '张先生', receivableBalance: 0, payableBalance: 0 } }
  page.setData = values => Object.assign(page.data, values)
  return { page, wx }
}

test('结清对象确认后归档并返回列表', async () => {
  let requestedUrl
  const { page, wx } = createPage(url => {
    requestedUrl = url
    return Promise.resolve({ archived: true })
  })
  page.deleteCustomer()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requestedUrl, '/customers/2')
  assert.equal(wx.navigatedBack, true)
})

test('未结清时不发删除请求', () => {
  let requests = 0
  const { page } = createPage(() => { requests++ })
  page.data.book.customer.payableBalance = 10
  page.deleteCustomer()
  assert.equal(requests, 0)
})

test('请求失败后恢复删除按钮状态', async () => {
  const { page, wx } = createPage(() => Promise.reject(new Error('offline')))
  page.deleteCustomer()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.deletingCustomer, false)
  assert.equal(wx.navigatedBack, undefined)
})
