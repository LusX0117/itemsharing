const { API_BASE_URL } = require('./api-config');
const CHAT_BASE_URL = API_BASE_URL;

const request = ({ url, method = 'GET', data }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${CHAT_BASE_URL}${url}`,
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

const startChatSession = (payload) => request({
  url: '/api/chat/session/start',
  method: 'POST',
  data: payload
});

const getChatSessions = (userId) => request({
  url: `/api/chat/sessions?userId=${encodeURIComponent(String(userId))}`
});

const getChatSession = (sessionId) => request({
  url: `/api/chat/session?sessionId=${encodeURIComponent(String(sessionId))}`
});

const getChatMessages = (sessionId, afterId) => {
  const suffix = afterId ? `&afterId=${encodeURIComponent(String(afterId))}` : '';
  return request({
    url: `/api/chat/messages?sessionId=${encodeURIComponent(String(sessionId))}${suffix}`
  });
};

const sendChatMessage = (payload) => request({
  url: '/api/chat/messages',
  method: 'POST',
  data: payload
});

const updateChatSessionPhotos = (payload) => request({
  url: '/api/chat/session/photos',
  method: 'PATCH',
  data: payload
});

const updateChatSessionStatus = (payload) => request({
  url: '/api/chat/session/status',
  method: 'PATCH',
  data: payload
});

module.exports = {
  CHAT_BASE_URL,
  startChatSession,
  getChatSessions,
  getChatSession,
  getChatMessages,
  sendChatMessage,
  updateChatSessionPhotos,
  updateChatSessionStatus
};
