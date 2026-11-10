var STORAGE_KEY = 'app-theme'
var DEFAULT_THEME = 'cream'

var TAB_ITEMS = [
  { index: 0, base: 'home' },
  { index: 1, base: 'order' },
  { index: 2, base: 'purchase' },
  { index: 3, base: 'search' },
  { index: 4, base: 'me' }
]

var THEMES = {
  cream: {
    key: 'cream',
    name: '奶油橄榄',
    desc: '温润纸质感，偏商务',
    swatch: '#3f4b31',
    swatchSoft: '#eae7dd',
    bg: '#faf9f5',
    tabBg: '#ffffff',
    tabColor: '#a39e90',
    tabSelected: '#3f4b31',
    navBg: '#faf9f5',
    navFront: '#000000',
    iconSuffix: 'olive',
    palette: { sale: '#b04a3c', purchase: '#55703f', track: '#eceee4' }
  },
  lilac: {
    key: 'lilac',
    name: '灰紫',
    desc: '冷调克制，辨识度高',
    swatch: '#6d5b9e',
    swatchSoft: '#e8e6ee',
    bg: '#f8f7fa',
    tabBg: '#ffffff',
    tabColor: '#a29da9',
    tabSelected: '#6d5b9e',
    navBg: '#f8f7fa',
    navFront: '#000000',
    iconSuffix: 'lilac',
    palette: { sale: '#c0504d', purchase: '#4d7a5f', track: '#f0edf7' }
  }
}

function list() {
  return [THEMES.cream, THEMES.lilac]
}

function normalize(key) {
  return THEMES[key] ? key : DEFAULT_THEME
}

function get() {
  var saved = ''
  try {
    saved = wx.getStorageSync(STORAGE_KEY) || ''
  } catch (e) {
    saved = ''
  }
  return normalize(saved)
}

function className(key) {
  return 'theme-' + normalize(key)
}

// canvas 不支持 CSS 变量，绘制时需要取实际色值
function palette(key) {
  return (THEMES[normalize(key)] || THEMES[DEFAULT_THEME]).palette
}

function apply(key) {
  var theme = THEMES[normalize(key)]

  wx.setNavigationBarColor({
    frontColor: theme.navFront,
    backgroundColor: theme.navBg,
    animation: { duration: 0, timingFunc: 'linear' },
    fail: function () {}
  })

  wx.setBackgroundColor({
    backgroundColor: theme.bg,
    backgroundColorTop: theme.bg,
    backgroundColorBottom: theme.bg,
    fail: function () {}
  })

  wx.setTabBarStyle({
    color: theme.tabColor,
    selectedColor: theme.tabSelected,
    backgroundColor: theme.tabBg,
    borderStyle: 'white',
    fail: function () {}
  })

  applyTabBarIcons(theme)
}

// tabBar 选中态图标无法染色，预生成了两套配色，按主题切换
function applyTabBarIcons(theme) {
  TAB_ITEMS.forEach(function (item) {
    wx.setTabBarItem({
      index: item.index,
      iconPath: 'assets/icons/' + item.base + '-idle-' + theme.iconSuffix + '.png',
      selectedIconPath: 'assets/icons/' + item.base + '-active-' + theme.iconSuffix + '.png',
      fail: function () {}
    })
  })
}

function set(key) {
  var next = normalize(key)
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (e) {
    return next
  }
  apply(next)
  return next
}

module.exports = {
  list: list,
  get: get,
  set: set,
  apply: apply,
  className: className,
  palette: palette,
  DEFAULT_THEME: DEFAULT_THEME
}
