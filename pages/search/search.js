const categoryOptions = ['全部', '教材', '电子产品', '运动器材', '生活用品', '其他'];
const { getCurrentUser } = require('../../utils/db');
const { startChatSession } = require('../../utils/chat-api');
const { getHomePosts } = require('../../utils/post-api');
const TAB_INDEX = 1;

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

const resolveItemIcon = (category) => {
  const text = String(category || '');
  if (text.includes('教材')) return '📘';
  if (text.includes('电子')) return '🔌';
  if (text.includes('运动')) return '🏸';
  if (text.includes('生活')) return '🧺';
  return '📦';
};

const normalizeText = (value) => String(value || '').toLowerCase();

Page({
  data: {
    currentUser: null,
    keyword: '',
    activeCategory: '全部',
    categoryOptions,
    items: [],
    filteredItems: []
  },

  onShow() {
    syncTabBarSelected(this, TAB_INDEX);
    this.refreshCurrentUser();
    this.loadItems();
  },

  refreshCurrentUser() {
    this.setData({
      currentUser: getCurrentUser()
    });
  },

  async loadItems() {
    try {
      const resp = await getHomePosts();
      this.setData({
        items: (resp.items || []).map((item) => ({
          ...item,
          icon: resolveItemIcon(item.category)
        }))
      }, () => {
        this.filterItems();
      });
    } catch (err) {
      wx.showToast({ title: '帖子加载失败', icon: 'none' });
      this.setData({
        items: [],
        filteredItems: []
      });
    }
  },

  handleKeywordInput(event) {
    this.setData({
      keyword: event.detail.value
    });
    this.filterItems();
  },

  chooseCategory(event) {
    this.setData({
      activeCategory: event.currentTarget.dataset.category
    });
    this.filterItems();
  },

  clearKeyword() {
    this.setData({
      keyword: ''
    });
    this.filterItems();
  },

  clearFilters() {
    this.setData({
      keyword: '',
      activeCategory: '全部'
    });
    this.filterItems();
  },

  filterItems() {
    const { items, keyword, activeCategory } = this.data;
    const q = keyword.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
      const byCategory = activeCategory === '全部' || item.category === activeCategory;
      const byKeyword =
        !q ||
        normalizeText(item.title).includes(q) ||
        normalizeText(item.description).includes(q) ||
        normalizeText(item.location).includes(q);
      return byCategory && byKeyword;
    });
    this.setData({ filteredItems });
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  async applyBorrow(event) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先登录后申请', icon: 'none' });
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
  }
});
