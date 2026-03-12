const { getCurrentUser } = require('../../utils/db');
const { startChatSession } = require('../../utils/chat-api');
const { getHomePosts } = require('../../utils/post-api');

const DEMAND_SESSION_OFFSET = 8000000000000;
const DEMAND_SESSION_MOD = 900000000000;
const TAB_INDEX = 0;

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

const toDemandSessionItemId = (demandId) => {
  const text = String(demandId || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) % DEMAND_SESSION_MOD;
  }
  return DEMAND_SESSION_OFFSET + hash;
};

const resolveItemIcon = (category) => {
  const text = String(category || '');
  if (text.includes('教材')) return '📘';
  if (text.includes('电子')) return '🔌';
  if (text.includes('运动')) return '🏸';
  if (text.includes('生活')) return '🧺';
  return '📦';
};

const resolveDemandIcon = (category) => {
  const text = String(category || '');
  if (text.includes('教材')) return '📚';
  if (text.includes('电子')) return '🎥';
  if (text.includes('运动')) return '🏃';
  if (text.includes('生活')) return '🏠';
  return '📝';
};

Page({
  data: {
    currentUser: null,
    userInitial: '我',
    activeTab: 'available',
    items: [],
    demands: []
  },

  onShow() {
    syncTabBarSelected(this, TAB_INDEX);
    const currentUser = getCurrentUser();
    const nickname = currentUser && currentUser.nickname ? String(currentUser.nickname) : '';
    this.setData({
      currentUser,
      userInitial: nickname ? nickname.charAt(0) : '我'
    });
    this.loadHomeData();
  },

  async loadHomeData() {
    try {
      const resp = await getHomePosts();
      this.setData({
        items: (resp.items || []).map((item) => ({
          ...item,
          icon: resolveItemIcon(item.category)
        })),
        demands: (resp.demands || []).map((item) => ({
          ...item,
          icon: resolveDemandIcon(item.category)
        }))
      });
    } catch (err) {
      wx.showToast({ title: '帖子加载失败', icon: 'none' });
      this.setData({
        items: [],
        demands: []
      });
    }
  },

  switchTab(event) {
    const tab = String((event.currentTarget.dataset && event.currentTarget.dataset.tab) || '');
    if (!tab || tab === this.data.activeTab) {
      return;
    }
    this.setData({
      activeTab: tab
    });
  },

  goMe() {
    wx.switchTab({
      url: '/pages/me/me'
    });
  },

  goPublish() {
    wx.switchTab({
      url: '/pages/publish/publish'
    });
  },

  openItemDetail(event) {
    const itemId = Number((event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id) || 0);
    if (!itemId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/chat-item/chat-item?itemId=${itemId}`
    });
  },

  async applyBorrow(event) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先在“我的”中登录', icon: 'none' });
      return;
    }

    const itemId = Number(event.currentTarget.dataset.id);
    const selectedItem = this.data.items.find((item) => item.id === itemId);
    if (!selectedItem) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      return;
    }

    const lenderUserId = selectedItem.ownerUserId || `legacy_${selectedItem.owner}`;
    if (String(lenderUserId) === String(currentUser.id)) {
      wx.showToast({ title: '不能借用自己发布的物品', icon: 'none' });
      return;
    }

    try {
      const resp = await startChatSession({
        itemId: selectedItem.id,
        itemTitle: selectedItem.title,
        lenderUserId: String(lenderUserId),
        lenderName: selectedItem.owner,
        borrowerUserId: String(currentUser.id),
        borrowerName: currentUser.nickname
      });

      const session = resp.session || {};
      if (!session.id) {
        throw new Error('session_create_failed');
      }

      wx.navigateTo({
        url: `/pages/chat/chat?sessionId=${session.id}`
      });
    } catch (err) {
      wx.showToast({
        title: '聊天服务不可用，请稍后重试',
        icon: 'none'
      });
    }
  },

  async lendToDemand(event) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先在“我的”中登录', icon: 'none' });
      return;
    }

    const demandId = String(event.currentTarget.dataset.id || '');
    const selectedDemand = this.data.demands.find((item) => String(item.id) === demandId);
    if (!selectedDemand) {
      wx.showToast({ title: '求借信息不存在', icon: 'none' });
      return;
    }

    const borrowerUserId = selectedDemand.publisherUserId;
    if (!borrowerUserId) {
      wx.showToast({ title: '该求借缺少发布者信息', icon: 'none' });
      return;
    }

    if (String(borrowerUserId) === String(currentUser.id)) {
      wx.showToast({ title: '不能响应自己发布的求借', icon: 'none' });
      return;
    }

    if (selectedDemand.status && String(selectedDemand.status) !== '求借中') {
      wx.showToast({ title: '该求借当前不可响应', icon: 'none' });
      return;
    }

    try {
      const resp = await startChatSession({
        itemId: toDemandSessionItemId(selectedDemand.id),
        itemTitle: `[求借] ${selectedDemand.title}`,
        lenderUserId: String(currentUser.id),
        lenderName: currentUser.nickname,
        borrowerUserId: String(borrowerUserId),
        borrowerName: selectedDemand.publisher
      });

      const session = resp.session || {};
      if (!session.id) {
        throw new Error('session_create_failed');
      }

      wx.navigateTo({
        url: `/pages/chat/chat?sessionId=${session.id}`
      });
    } catch (err) {
      wx.showToast({
        title: '聊天服务不可用，请稍后重试',
        icon: 'none'
      });
    }
  }
});
