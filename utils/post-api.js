const { API_BASE_URL } = require('./api-config');
const { getAuthHeaders } = require('./db');
const POST_BASE_URL = API_BASE_URL;

const request = ({ url, method = 'GET', data }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${POST_BASE_URL}${url}`,
    method,
    data,
    header: getAuthHeaders(),
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

const getHomePosts = () => request({
  url: '/api/posts/home'
});

const getManagePosts = () => request({
  url: '/api/posts/manage'
});

const createItemPost = (payload) => request({
  url: '/api/posts/item',
  method: 'POST',
  data: payload
});

const createDemandPost = (payload) => request({
  url: '/api/posts/demand',
  method: 'POST',
  data: payload
});

const updateItemPost = (id, payload) => request({
  url: `/api/posts/item/${encodeURIComponent(String(id))}`,
  method: 'PATCH',
  data: payload
});

const updateDemandPost = (id, payload) => request({
  url: `/api/posts/demand/${encodeURIComponent(String(id))}`,
  method: 'PATCH',
  data: payload
});

const deleteItemPost = (id, payload) => request({
  url: `/api/posts/item/${encodeURIComponent(String(id))}`,
  method: 'DELETE',
  data: payload
});

const deleteDemandPost = (id, payload) => request({
  url: `/api/posts/demand/${encodeURIComponent(String(id))}`,
  method: 'DELETE',
  data: payload
});

module.exports = {
  POST_BASE_URL,
  getHomePosts,
  getManagePosts,
  createItemPost,
  createDemandPost,
  updateItemPost,
  updateDemandPost,
  deleteItemPost,
  deleteDemandPost
};
