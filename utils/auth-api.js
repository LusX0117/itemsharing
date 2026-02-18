const { API_BASE_URL } = require('./api-config');
const AUTH_BASE_URL = API_BASE_URL;

const request = ({ url, method = 'GET', data }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${AUTH_BASE_URL}${url}`,
    method,
    data,
    timeout: 10000,
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data || {});
        return;
      }
      reject(new Error((res.data && res.data.error) || `http_${res.statusCode}`));
    },
    fail: (err) => reject(err)
  });
});

const registerByServer = (payload) => request({
  url: '/api/auth/register',
  method: 'POST',
  data: payload
});

const loginByServer = (payload) => request({
  url: '/api/auth/login',
  method: 'POST',
  data: payload
});

module.exports = {
  AUTH_BASE_URL,
  registerByServer,
  loginByServer
};
