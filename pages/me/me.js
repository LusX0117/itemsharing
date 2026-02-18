const { getCurrentUser, clearCurrentUser } = require('../../utils/db');
const { getChatSessions } = require('../../utils/chat-api');
const { getHomePosts, getManagePosts, updateItemPost, updateDemandPost } = require('../../utils/post-api');

const chooseAction = (itemList) => new Promise((resolve) => {
  wx.showActionSheet({
    itemList,
    success: (res) => resolve(res.tapIndex),
    fail: () => resolve(-1)
  });
});

const inputText = ({ title, placeholder, value = '' }) => new Promise((resolve) => {
  wx.showModal({
    title,
    editable: true,
    placeholderText: placeholder,
    content: value,
    success: (res) => {
      if (!res.confirm) {
        resolve(null);
        return;
      }
      resolve(String(res.content || '').trim());
    },
    fail: () => resolve(null)
  });
});

Page({
  data: {
    currentUser: null,
    isAdmin: false,
    stats: {
      itemCount: 0,
      sessionCount: 0
    },
    manageItems: [],
    manageDemands: [],
    loadingManage: false
  },

  async onShow() {
    this.refreshCurrentUser();
    await this.loadAllData();
  },

  refreshCurrentUser() {
    const currentUser = getCurrentUser();
    this.setData({
      currentUser,
      isAdmin: Boolean(currentUser && currentUser.isAdmin)
    });
  },

  async loadAllData() {
    await Promise.all([
      this.loadStats(),
      this.loadManagePosts()
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
        const resp = await getChatSessions(String(currentUser.id));
        sessionCount = (resp.sessions || []).length;
      } catch (err) {
        sessionCount = 0;
      }
    }

    this.setData({
      stats: {
        itemCount,
        sessionCount
      }
    });
  },

  async loadManagePosts() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      this.setData({
        manageItems: [],
        manageDemands: [],
        loadingManage: false
      });
      return;
    }

    this.setData({ loadingManage: true });
    try {
      const resp = await getManagePosts(String(currentUser.id));
      this.setData({
        isAdmin: Boolean(resp.isAdmin || currentUser.isAdmin),
        manageItems: resp.items || [],
        manageDemands: resp.demands || []
      });
    } catch (err) {
      wx.showToast({ title: '管理列表加载失败', icon: 'none' });
      this.setData({
        manageItems: [],
        manageDemands: []
      });
    } finally {
      this.setData({ loadingManage: false });
    }
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  logout() {
    clearCurrentUser();
    this.setData({
      currentUser: null,
      isAdmin: false,
      manageItems: [],
      manageDemands: []
    });
    wx.showToast({ title: '已退出登录', icon: 'none' });
  },

  goMessages() {
    wx.switchTab({
      url: '/pages/messages/messages'
    });
  },

  async handleItemAction(event) {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }

    const itemId = Number(event.currentTarget.dataset.id);
    const target = this.data.manageItems.find((item) => item.id === itemId);
    if (!target) {
      wx.showToast({ title: '帖子不存在', icon: 'none' });
      return;
    }

    const isHidden = Boolean(target.isHidden);
    const actionList = isHidden
      ? ['恢复显示', '修改标题', '切换状态']
      : ['暂时隐藏', '修改标题', '切换状态'];
    const idx = await chooseAction(actionList);
    if (idx < 0) return;

    try {
      if (idx === 0) {
        await updateItemPost(itemId, {
          actorUserId: String(currentUser.id),
          isHidden: !isHidden,
          hiddenReason: isHidden ? '' : (this.data.isAdmin ? '管理员暂时隐藏' : '用户暂时隐藏')
        });
      } else if (idx === 1) {
        const nextTitle = await inputText({
          title: '修改出借标题',
          placeholder: '请输入新标题',
          value: target.title
        });
        if (!nextTitle) return;
        await updateItemPost(itemId, {
          actorUserId: String(currentUser.id),
          title: nextTitle
        });
      } else if (idx === 2) {
        const nextStatus = target.status === '可借' ? '暂停' : '可借';
        await updateItemPost(itemId, {
          actorUserId: String(currentUser.id),
          status: nextStatus
        });
      }
      wx.showToast({ title: '更新成功', icon: 'success' });
      await this.loadAllData();
    } catch (err) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  async handleDemandAction(event) {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }

    const demandId = String(event.currentTarget.dataset.id || '');
    const target = this.data.manageDemands.find((item) => String(item.id) === demandId);
    if (!target) {
      wx.showToast({ title: '帖子不存在', icon: 'none' });
      return;
    }

    const isHidden = Boolean(target.isHidden);
    const actionList = isHidden
      ? ['恢复显示', '修改标题', '切换状态']
      : ['暂时隐藏', '修改标题', '切换状态'];
    const idx = await chooseAction(actionList);
    if (idx < 0) return;

    try {
      if (idx === 0) {
        await updateDemandPost(demandId, {
          actorUserId: String(currentUser.id),
          isHidden: !isHidden,
          hiddenReason: isHidden ? '' : (this.data.isAdmin ? '管理员暂时隐藏' : '用户暂时隐藏')
        });
      } else if (idx === 1) {
        const nextTitle = await inputText({
          title: '修改求借标题',
          placeholder: '请输入新标题',
          value: target.title
        });
        if (!nextTitle) return;
        await updateDemandPost(demandId, {
          actorUserId: String(currentUser.id),
          title: nextTitle
        });
      } else if (idx === 2) {
        const nextStatus = target.status === '求借中' ? '已解决' : '求借中';
        await updateDemandPost(demandId, {
          actorUserId: String(currentUser.id),
          status: nextStatus
        });
      }
      wx.showToast({ title: '更新成功', icon: 'success' });
      await this.loadAllData();
    } catch (err) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  }
});
