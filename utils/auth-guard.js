const { clearCurrentUser } = require('./db');

const AUTH_ERROR_KEYS = ['missing_auth_token', 'invalid_auth_token', 'http_401'];

const isAuthExpiredError = (err) => {
  const text = String((err && err.message) || '');
  return AUTH_ERROR_KEYS.some((key) => text.includes(key));
};

const consumeAuthExpired = (err, options = {}) => {
  if (!isAuthExpiredError(err)) {
    return false;
  }

  clearCurrentUser();

  if (typeof options.onClear === 'function') {
    options.onClear();
  }

  const showToast = options.showToast !== false;
  if (showToast) {
    wx.showToast({
      title: options.toastTitle || '登录已过期，请重新登录',
      icon: 'none'
    });
  }

  const redirect = options.redirect !== false;
  if (redirect) {
    const delayMs = Number.isFinite(options.delayMs) ? Number(options.delayMs) : 300;
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
    }, delayMs);
  }

  return true;
};

module.exports = {
  isAuthExpiredError,
  consumeAuthExpired
};

