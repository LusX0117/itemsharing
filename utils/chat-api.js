const { API_BASE_URL } = require('./api-config');
const { getAuthHeaders } = require('./db');
const CHAT_BASE_URL = API_BASE_URL;
const DEFAULT_TIMEOUT_MS = 18000;
const RETRY_DELAY_MS = 600;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = ({ url, method = 'GET', data, timeout = DEFAULT_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  wx.request({
    url: `${CHAT_BASE_URL}${url}`,
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

const startChatSession = (payload) => requestWithRetry({
  url: '/api/chat/session/start',
  method: 'POST',
  data: payload
});

const getChatSessions = () => requestWithRetry({
  url: '/api/chat/sessions'
});

const getChatSession = (sessionId) => {
  return requestWithRetry({
    url: `/api/chat/session?sessionId=${encodeURIComponent(String(sessionId))}`
  });
};

const getChatMessages = (sessionId, options = {}) => {
  let params = options;
  if (typeof options !== 'object' || options === null) {
    params = { afterId: options };
  }
  const query = [`sessionId=${encodeURIComponent(String(sessionId))}`];
  if (params.afterId) {
    query.push(`afterId=${encodeURIComponent(String(params.afterId))}`);
  }
  if (params.beforeId) {
    query.push(`beforeId=${encodeURIComponent(String(params.beforeId))}`);
  }
  if (params.limit) {
    query.push(`limit=${encodeURIComponent(String(params.limit))}`);
  }
  return requestWithRetry({
    url: `/api/chat/messages?${query.join('&')}`
  });
};

const sendChatMessage = (payload) => requestWithRetry({
  url: '/api/chat/messages',
  method: 'POST',
  data: payload
});

const runChatSessionAction = (payload) => requestWithRetry({
  url: '/api/chat/session/action',
  method: 'PATCH',
  data: payload
});

const markChatSessionRead = (payload) => requestWithRetry({
  url: '/api/chat/session/read',
  method: 'POST',
  data: payload
});

const rateChatSession = (payload) => requestWithRetry({
  url: '/api/chat/session/rate',
  method: 'POST',
  data: payload
});

module.exports = {
  CHAT_BASE_URL,
  startChatSession,
  getChatSessions,
  getChatSession,
  getChatMessages,
  sendChatMessage,
  runChatSessionAction,
  markChatSessionRead,
  rateChatSession
};
