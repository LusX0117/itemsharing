const { API_BASE_URL } = require('./api-config');
const { getAuthHeaders } = require('./db');

const USER_BASE_URL = API_BASE_URL;
const DEFAULT_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 800;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = ({ url, method = 'GET', data, timeout = DEFAULT_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${USER_BASE_URL}${url}`,
    method,
    data,
    timeout,
    header: getAuthHeaders(),
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data || {});
        return;
      }
      reject(new Error((res.data && res.data.error) || `http_${res.statusCode}`));
    },
    fail: (err) => reject(new Error((err && err.errMsg) || 'request_failed'))
  });
});

const requestWithRetry = async (options, retries = 1) => {
  try {
    return await request(options);
  } catch (err) {
    const text = String((err && err.message) || '').toLowerCase();
    if (retries > 0 && (text.includes('timeout') || text.includes('timed out'))) {
      await delay(RETRY_DELAY_MS);
      return requestWithRetry(options, retries - 1);
    }
    throw err;
  }
};

const getUserProfile = (userId = '') => {
  const suffix = userId ? `?userId=${encodeURIComponent(String(userId))}` : '';
  return requestWithRetry({
    url: `/api/users/profile${suffix}`
  });
};

module.exports = {
  USER_BASE_URL,
  getUserProfile
};
