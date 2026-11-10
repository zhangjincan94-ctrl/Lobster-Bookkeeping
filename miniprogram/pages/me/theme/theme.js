var theme = require('../../../utils/theme')

Page({
  data: {
    theme: '',
    themes: []
  },

  onShow: function () {
    this.setData({
      theme: theme.get(),
      themes: theme.list()
    })
  },

  chooseTheme: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.data.theme) return
    var next = theme.set(key)
    this.setData({ theme: next })
  }
})
