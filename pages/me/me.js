const { getCurrentUser, clearCurrentUser } = require('../../utils/db');
const { getChatSessions } = require('../../utils/chat-api');
const { getHomePosts, getManagePosts } = require('../../utils/post-api');

Page({
  data: {
    currentUser: null,
    isAdmin: false,
    avatarText: '我',
    stats: {
      itemCount: 0,
      sessionCount: 0,
      myPostCount: 0
    }
  },

  async onShow() {
    this.refreshCurrentUser();
    await this.loadDashboard();
  },

  refreshCurrentUser() {
    const currentUser = getCurrentUser();
    this.setData({
      currentUser,
      isAdmin: Boolean(currentUser && currentUser.isAdmin),
      avatarText: currentUser && currentUser.nickname ? currentUser.nickname.slice(0, 1) : '我'
    });
  },

  async loadDashboard() {
    await Promise.all([
      this.loadStats(),
      this.loadMyPostCount()
    ]);
  },

  async loadStats() {
    const currentUser = getCurrentUser();
    let itemCount = 0;
    let sessionCount = 0;

    try {
      const postResp = await getHomePosts();
      itemCount = (postResp.items || []).length;
    } catch (err) {
      itemCount = 0;
    }

    if (currentUser) {
      try {
        const resp = await getChatSessions();
        sessionCount = (resp.sessions || []).length;
      } catch (err) {
        sessionCount = 0;
      }
    }

    this.setData({
      'stats.itemCount': itemCount,
      'stats.sessionCount': sessionCount
    });
  },

  async loadMyPostCount() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      this.setData({
        'stats.myPostCount': 0
      });
      return;
    }

    try {
      const resp = await getManagePosts();
      const myPostCount = (resp.items || []).length + (resp.demands || []).length;
      this.setData({
        isAdmin: Boolean(resp.isAdmin || currentUser.isAdmin),
        'stats.myPostCount': myPostCount
      });
    } catch (err) {
      this.setData({
        'stats.myPostCount': 0
      });
    }
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  goMessages() {
    wx.switchTab({
      url: '/pages/messages/messages'
    });
  },

  goPostManage() {
    if (!this.data.currentUser) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/post-manage/post-manage'
    });
  },

  logout() {
    clearCurrentUser();
    this.setData({
      currentUser: null,
      isAdmin: false,
      avatarText: '我',
      stats: {
        itemCount: this.data.stats.itemCount,
        sessionCount: 0,
        myPostCount: 0
      }
    });
    wx.showToast({ title: '已退出登录', icon: 'none' });
  }
});
