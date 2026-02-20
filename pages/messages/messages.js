const { getCurrentUser } = require('../../utils/db');
const { getChatSessions } = require('../../utils/chat-api');

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

Page({
  data: {
    currentUser: null,
    sessions: [],
    unreadTotal: 0
  },

  async onShow() {
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
      this.setData({ sessions: [], unreadTotal: 0 });
      this.updateTabUnreadBadge(0);
      return;
    }

    try {
      const resp = await getChatSessions();
      const sessions = (resp.sessions || []).map((session) => ({
        ...session,
        updatedAtText: formatDateTime(session.updatedAt),
        myRole: String(session.borrowerUserId) === String(currentUser.id) ? '借用者' : '出借者',
        unreadCount: Number(session.unreadCount || 0),
        unreadText: Number(session.unreadCount || 0) > 99 ? '99+' : String(Number(session.unreadCount || 0))
      }));
      const unreadTotal = Number(resp.unreadTotal || sessions.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0));
      this.setData({ sessions, unreadTotal });
      this.updateTabUnreadBadge(unreadTotal);
    } catch (err) {
      this.setData({ sessions: [], unreadTotal: 0 });
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
