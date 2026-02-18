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
    sessions: []
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
      this.setData({ sessions: [] });
      return;
    }

    try {
      const resp = await getChatSessions(String(currentUser.id));
      const sessions = (resp.sessions || []).map((session) => ({
        ...session,
        updatedAtText: formatDateTime(session.updatedAt),
        myRole: String(session.borrowerUserId) === String(currentUser.id) ? '借用者' : '出借者'
      }));
      this.setData({ sessions });
    } catch (err) {
      this.setData({ sessions: [] });
      wx.showToast({ title: '聊天服务不可用', icon: 'none' });
    }
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
