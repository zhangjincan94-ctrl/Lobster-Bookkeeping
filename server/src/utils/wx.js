const https = require('https');
const config = require('../config');

const code2Session = (code) => {
  return new Promise((resolve, reject) => {
    if (!config.wx.appid || !config.wx.secret || config.wx.secret === 'your_wx_secret') {
      const err = new Error('微信 AppID 或 AppSecret 未配置');
      err.status = 400;
      reject(err);
      return;
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wx.appid}&secret=${config.wx.secret}&js_code=${code}&grant_type=authorization_code`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errcode) {
            const err = new Error(result.errmsg || '微信登录失败');
            err.status = 400;
            reject(err);
            return;
          }

          resolve({
            openid: result.openid,
            session_key: result.session_key,
            unionid: result.unionid
          });
        } catch (e) {
          reject(new Error('微信接口响应解析失败'));
        }
      });
    }).on('error', () => {
      reject(new Error('微信接口请求失败'));
    });
  });
};

module.exports = { code2Session };
