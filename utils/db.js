const DB_KEYS = {
  CURRENT_USER: 'db_current_user'
};

const LEGACY_AUTH_KEYS = ['db_users', 'users', 'db_items', 'db_demands'];

const deepClone = (data) => JSON.parse(JSON.stringify(data));

const clearLegacyAuthStorage = () => {
  LEGACY_AUTH_KEYS.forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch (err) {
      // ignore
    }
  });
};

const getCurrentUser = () => {
  const user = wx.getStorageSync(DB_KEYS.CURRENT_USER);
  if (!user) {
    return null;
  }
  if (!user.token) {
    try {
      wx.removeStorageSync(DB_KEYS.CURRENT_USER);
    } catch (err) {
      // ignore
    }
    return null;
  }
  return deepClone(user);
};

const setCurrentUser = (user) => wx.setStorageSync(DB_KEYS.CURRENT_USER, deepClone(user));
const clearCurrentUser = () => wx.removeStorageSync(DB_KEYS.CURRENT_USER);

const getAuthHeaders = () => {
  const user = getCurrentUser();
  const token = user && user.token ? String(user.token) : '';
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`
  };
};

module.exports = {
  DB_KEYS,
  clearLegacyAuthStorage,
  getCurrentUser,
  getAuthHeaders,
  setCurrentUser,
  clearCurrentUser
};
