const { getCurrentUser } = require('../../utils/db');
const { startChatSession } = require('../../utils/chat-api');
const { getHomePosts } = require('../../utils/post-api');
const { consumeAuthExpired } = require('../../utils/auth-guard');

const DEMAND_SESSION_OFFSET = 8000000000000;
const DEMAND_SESSION_MOD = 900000000000;
const TAB_INDEX = 0;
const BORROWING_STATUSES = ['借用中', '待确认归还'];
const ITEM_PAGE_SIZE = 12;
const DEMAND_PAGE_SIZE = 12;

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

const buildItemCard = (item) => {
  const statusText = String(item.status || '可借');
  const isBorrowing = BORROWING_STATUSES.includes(statusText);
  return {
    ...item,
    icon: resolveItemIcon(item.category),
    isBorrowing,
    statusText,
    borrowBtnText: isBorrowing ? '出借中' : '申请借用'
  };
};

const mergeById = (current, incoming, key = 'id') => {
  const idSet = new Set((current || []).map((item) => String(item[key])));
  const append = (incoming || []).filter((item) => !idSet.has(String(item[key])));
  return (current || []).concat(append);
};

Page({
  data: {
    currentUser: null,
    userInitial: '我',
    activeTab: 'available',
    items: [],
    demands: [],
    itemPagination: {
      nextOffset: 0,
      hasMore: true,
      totalCount: 0
    },
    demandPagination: {
      nextOffset: 0,
      hasMore: true,
      totalCount: 0
    },
    loadingHome: false,
    loadingMoreItem: false,
    loadingMoreDemand: false
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
    this.setData({
      loadingHome: true,
      loadingMoreItem: false,
      loadingMoreDemand: false
    });
    try {
      const resp = await getHomePosts({
        itemLimit: ITEM_PAGE_SIZE,
        itemOffset: 0,
        demandLimit: DEMAND_PAGE_SIZE,
        demandOffset: 0
      });
      this.setData({
        items: (resp.items || []).map(buildItemCard),
        demands: (resp.demands || []).map((item) => ({
          ...item,
          icon: resolveDemandIcon(item.category)
        })),
        itemPagination: {
          nextOffset: Number(resp.itemPagination && resp.itemPagination.nextOffset) || (resp.items || []).length,
          hasMore: Boolean(resp.itemPagination && resp.itemPagination.hasMore),
          totalCount: Number(resp.itemPagination && resp.itemPagination.totalCount) || 0
        },
        demandPagination: {
          nextOffset: Number(resp.demandPagination && resp.demandPagination.nextOffset) || (resp.demands || []).length,
          hasMore: Boolean(resp.demandPagination && resp.demandPagination.hasMore),
          totalCount: Number(resp.demandPagination && resp.demandPagination.totalCount) || 0
        }
      });
    } catch (err) {
      wx.showToast({ title: '帖子加载失败', icon: 'none' });
      this.setData({
        items: [],
        demands: [],
        itemPagination: { nextOffset: 0, hasMore: false, totalCount: 0 },
        demandPagination: { nextOffset: 0, hasMore: false, totalCount: 0 }
      });
    } finally {
      this.setData({ loadingHome: false });
    }
  },

  async loadMoreItems() {
    const { loadingMoreItem, loadingHome, itemPagination } = this.data;
    if (loadingHome || loadingMoreItem || !itemPagination.hasMore) {
      return;
    }
    this.setData({ loadingMoreItem: true });
    try {
      const resp = await getHomePosts({
        itemLimit: ITEM_PAGE_SIZE,
        itemOffset: Number(itemPagination.nextOffset || 0),
        demandLimit: 0,
        demandOffset: 0
      });
      this.setData({
        items: mergeById(this.data.items, (resp.items || []).map(buildItemCard), 'id'),
        itemPagination: {
          nextOffset: Number(resp.itemPagination && resp.itemPagination.nextOffset) || itemPagination.nextOffset,
          hasMore: Boolean(resp.itemPagination && resp.itemPagination.hasMore),
          totalCount: Number(resp.itemPagination && resp.itemPagination.totalCount) || itemPagination.totalCount
        }
      });
    } catch (err) {
      wx.showToast({ title: '加载更多失败', icon: 'none' });
    } finally {
      this.setData({ loadingMoreItem: false });
    }
  },

  async loadMoreDemands() {
    const { loadingMoreDemand, loadingHome, demandPagination } = this.data;
    if (loadingHome || loadingMoreDemand || !demandPagination.hasMore) {
      return;
    }
    this.setData({ loadingMoreDemand: true });
    try {
      const resp = await getHomePosts({
        itemLimit: 0,
        itemOffset: 0,
        demandLimit: DEMAND_PAGE_SIZE,
        demandOffset: Number(demandPagination.nextOffset || 0)
      });
      this.setData({
        demands: mergeById(this.data.demands, (resp.demands || []).map((item) => ({
          ...item,
          icon: resolveDemandIcon(item.category)
        })), 'id'),
        demandPagination: {
          nextOffset: Number(resp.demandPagination && resp.demandPagination.nextOffset) || demandPagination.nextOffset,
          hasMore: Boolean(resp.demandPagination && resp.demandPagination.hasMore),
          totalCount: Number(resp.demandPagination && resp.demandPagination.totalCount) || demandPagination.totalCount
        }
      });
    } catch (err) {
      wx.showToast({ title: '加载更多失败', icon: 'none' });
    } finally {
      this.setData({ loadingMoreDemand: false });
    }
  },

  onFeedLower() {
    if (this.data.activeTab === 'available') {
      this.loadMoreItems();
      return;
    }
    this.loadMoreDemands();
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

    if (selectedItem.isBorrowing) {
      wx.showToast({ title: '该物品正在出借中', icon: 'none' });
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
      if (consumeAuthExpired(err, {
        onClear: () => {
          this.setData({
            currentUser: null,
            userInitial: '我'
          });
        }
      })) {
        return;
      }
      if (String((err && err.message) || '').includes('item_unavailable')) {
        wx.showToast({
          title: '该物品正在出借中',
          icon: 'none'
        });
        this.loadHomeData();
        return;
      }
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
      if (consumeAuthExpired(err, {
        onClear: () => {
          this.setData({
            currentUser: null,
            userInitial: '我'
          });
        }
      })) {
        return;
      }
      wx.showToast({
        title: '聊天服务不可用，请稍后重试',
        icon: 'none'
      });
    }
  }
});
