const { getCurrentUser } = require('../../utils/db');
const { getChatSessions } = require('../../utils/chat-api');
const TAB_INDEX = 3;

const syncTabBarSelected = (page, index) => {
  if (!page || typeof page.getTabBar !== 'function') {
    return;
  }
  const tabBar = page.getTabBar();
  if (!tabBar || typeof tabBar.setSelected !== 'function') {
    return;
  }
  tabBar.setSelected(index);
};

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatRelativeTime = (timestamp) => {
  const value = Number(timestamp || 0);
  if (!value) {
    return '';
  }
  const now = Date.now();
  const diff = Math.max(0, now - value);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  }
  if (diff < 2 * day) {
    return '昨天';
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`;
  }
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())}`;
};

Page({
  data: {
    currentUser: null,
    sessions: [],
    unreadTotal: 0,
    unreadTotalText: '0'
  },

  async onShow() {
    syncTabBarSelected(this, TAB_INDEX);
    this.refreshCurrentUser();
    await this.loadSessions();
  },

  refreshCurrentUser() {
    this.setData({
      currentUser: getCurrentUser()
    });
  },

  async loadSessions() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      this.setData({ sessions: [], unreadTotal: 0, unreadTotalText: '0' });
      this.updateTabUnreadBadge(0);
      return;
    }

    try {
      const resp = await getChatSessions();
      const sessions = (resp.sessions || []).map((session) => ({
        ...session,
        updatedAtText: formatDateTime(session.updatedAt),
        myRole: String(session.borrowerUserId) === String(currentUser.id) ? '借用方' : '出借方',
        unreadCount: Number(session.unreadCount || 0),
        unreadText: Number(session.unreadCount || 0) > 99 ? '99+' : String(Number(session.unreadCount || 0)),
        peerName: String(session.borrowerUserId) === String(currentUser.id)
          ? String(session.lenderName || '未知用户')
          : String(session.borrowerName || '未知用户'),
        peerInitial: (
          String(
            String(session.borrowerUserId) === String(currentUser.id)
              ? (session.lenderName || '友')
              : (session.borrowerName || '友')
          ).slice(0, 1) || '友'
        ),
        relativeTime: formatRelativeTime(session.updatedAt),
        previewText: `${String(session.itemTitle || '物品')} · ${String(session.status || '')}`,
        itemTitleShort: String(session.itemTitle || '').slice(0, 4) || '物品'
      }));
      const unreadTotal = Number(resp.unreadTotal || sessions.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0));
      this.setData({
        sessions,
        unreadTotal,
        unreadTotalText: unreadTotal > 99 ? '99+' : String(unreadTotal)
      });
      this.updateTabUnreadBadge(unreadTotal);
    } catch (err) {
      this.setData({ sessions: [], unreadTotal: 0, unreadTotalText: '0' });
      this.updateTabUnreadBadge(0);
      wx.showToast({ title: '聊天服务不可用', icon: 'none' });
    }
  },

  updateTabUnreadBadge(total) {
    const value = Number(total || 0);
    if (value > 0) {
      wx.setTabBarBadge({
        index: 3,
        text: value > 99 ? '99+' : String(value)
      });
      return;
    }
    wx.removeTabBarBadge({
      index: 3
    });
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  openChat(event) {
    const sessionId = event.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/chat/chat?sessionId=${sessionId}`
    });
  }
});
