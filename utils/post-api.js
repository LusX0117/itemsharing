const { API_BASE_URL } = require('./api-config');
const { getAuthHeaders } = require('./db');
const POST_BASE_URL = API_BASE_URL;
const DEFAULT_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 800;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = ({ url, method = 'GET', data, timeout = DEFAULT_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${POST_BASE_URL}${url}`,
    method,
    data,
    header: getAuthHeaders(),
    timeout,
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

const buildQuery = (params = {}) => {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
  return query.length ? `?${query.join('&')}` : '';
};

const getHomePosts = (params = {}) => requestWithRetry({
  url: `/api/posts/home${buildQuery(params)}`
});

const getManagePosts = () => requestWithRetry({
  url: '/api/posts/manage'
});

const createItemPost = (payload) => requestWithRetry({
  url: '/api/posts/item',
  method: 'POST',
  data: payload
});

const createDemandPost = (payload) => requestWithRetry({
  url: '/api/posts/demand',
  method: 'POST',
  data: payload
});

const uploadItemPhoto = (payload) => requestWithRetry({
  url: '/api/uploads/item-photo',
  method: 'POST',
  data: payload,
  timeout: 45000
});

const updateItemPost = (id, payload) => requestWithRetry({
  url: `/api/posts/item/${encodeURIComponent(String(id))}`,
  method: 'PATCH',
  data: payload
});

const updateDemandPost = (id, payload) => requestWithRetry({
  url: `/api/posts/demand/${encodeURIComponent(String(id))}`,
  method: 'PATCH',
  data: payload
});

const deleteItemPost = (id, payload) => requestWithRetry({
  url: `/api/posts/item/${encodeURIComponent(String(id))}`,
  method: 'DELETE',
  data: payload
});

const deleteDemandPost = (id, payload) => requestWithRetry({
  url: `/api/posts/demand/${encodeURIComponent(String(id))}`,
  method: 'DELETE',
  data: payload
});

const batchItemPosts = (payload) => requestWithRetry({
  url: '/api/posts/item/batch',
  method: 'POST',
  data: payload
});

const batchDemandPosts = (payload) => requestWithRetry({
  url: '/api/posts/demand/batch',
  method: 'POST',
  data: payload
});

module.exports = {
  POST_BASE_URL,
  getHomePosts,
  getManagePosts,
  createItemPost,
  createDemandPost,
  uploadItemPhoto,
  updateItemPost,
  updateDemandPost,
  deleteItemPost,
  deleteDemandPost,
  batchItemPosts,
  batchDemandPosts
};
