const categoryOptions = ['全部', '教材', '电子产品', '运动器材', '生活用品', '其他'];
const { getCurrentUser } = require('../../utils/db');
const { startChatSession } = require('../../utils/chat-api');
const { getHomePosts } = require('../../utils/post-api');

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
      this.setData({ items: resp.items || [] }, () => {
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

  filterItems() {
    const { items, keyword, activeCategory } = this.data;
    const q = keyword.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
      const byCategory = activeCategory === '全部' || item.category === activeCategory;
      const byKeyword =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);
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
