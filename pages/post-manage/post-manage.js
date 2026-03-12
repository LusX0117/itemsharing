const { getCurrentUser } = require('../../utils/db');
const {
  getManagePosts,
  updateItemPost,
  updateDemandPost,
  deleteItemPost,
  deleteDemandPost
} = require('../../utils/post-api');

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

const confirmDelete = (content) => new Promise((resolve) => {
  wx.showModal({
    title: '确认删除',
    content,
    confirmColor: '#b91c1c',
    success: (res) => resolve(Boolean(res.confirm)),
    fail: () => resolve(false)
  });
});

const formatDateText = (timestamp) => {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getItemStatusClass = (item) => {
  if (item && item.isHidden) {
    return 'status-flagged';
  }
  return String((item && item.status) || '') === '可借' ? 'status-active' : 'status-pending';
};

const getDemandStatusClass = (item) => {
  if (item && item.isHidden) {
    return 'status-flagged';
  }
  return String((item && item.status) || '') === '求借中' ? 'status-active' : 'status-pending';
};

Page({
  data: {
    currentUser: null,
    isAdmin: false,
    manageItems: [],
    manageDemands: [],
    loading: false,
    activeTab: 'item',
    bulkMode: false,
    bulkCount: 0,
    selectedItemIds: [],
    selectedDemandIds: []
  },

  async onShow() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 300);
      return;
    }

    this.setData({
      currentUser,
      isAdmin: Boolean(currentUser.isAdmin)
    });
    await this.loadManagePosts();
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: tab }, () => {
      this.syncBulkCount();
    });
  },

  toggleBulkMode() {
    const next = !this.data.bulkMode;
    if (!next) {
      this.setData({
        bulkMode: false,
        selectedItemIds: [],
        selectedDemandIds: []
      }, () => {
        this.applySelectionState();
      });
      return;
    }
    this.setData({ bulkMode: true }, () => {
      this.syncBulkCount();
    });
  },

  onItemCardTap(event) {
    if (!this.data.bulkMode) {
      return;
    }
    this.toggleItemSelect(event);
  },

  onDemandCardTap(event) {
    if (!this.data.bulkMode) {
      return;
    }
    this.toggleDemandSelect(event);
  },

  toggleItemSelect(event) {
    const itemId = String(event.currentTarget.dataset.id || '');
    if (!itemId) {
      return;
    }
    const current = new Set((this.data.selectedItemIds || []).map((id) => String(id)));
    if (current.has(itemId)) {
      current.delete(itemId);
    } else {
      current.add(itemId);
    }
    this.setData({
      selectedItemIds: Array.from(current)
    }, () => {
      this.applySelectionState();
    });
  },

  toggleDemandSelect(event) {
    const demandId = String(event.currentTarget.dataset.id || '');
    if (!demandId) {
      return;
    }
    const current = new Set((this.data.selectedDemandIds || []).map((id) => String(id)));
    if (current.has(demandId)) {
      current.delete(demandId);
    } else {
      current.add(demandId);
    }
    this.setData({
      selectedDemandIds: Array.from(current)
    }, () => {
      this.applySelectionState();
    });
  },

  syncBulkCount() {
    const count = this.data.activeTab === 'item'
      ? (this.data.selectedItemIds || []).length
      : (this.data.selectedDemandIds || []).length;
    this.setData({ bulkCount: count });
  },

  applySelectionState() {
    const selectedItemSet = new Set((this.data.selectedItemIds || []).map((id) => String(id)));
    const selectedDemandSet = new Set((this.data.selectedDemandIds || []).map((id) => String(id)));

    const manageItems = (this.data.manageItems || []).map((item) => ({
      ...item,
      _selected: selectedItemSet.has(String(item.id))
    }));

    const manageDemands = (this.data.manageDemands || []).map((item) => ({
      ...item,
      _selected: selectedDemandSet.has(String(item.id))
    }));

    this.setData({ manageItems, manageDemands }, () => {
      this.syncBulkCount();
    });
  },

  async loadManagePosts() {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }

    this.setData({ loading: true });
    try {
      const resp = await getManagePosts();
      const manageItems = (resp.items || []).map((item) => ({
        ...item,
        statusText: item.isHidden ? '已隐藏' : String(item.status || '待处理'),
        statusClass: getItemStatusClass(item),
        dateText: formatDateText(item.updatedAt || item.createdAt),
        _selected: false
      }));
      const manageDemands = (resp.demands || []).map((item) => ({
        ...item,
        statusText: item.isHidden ? '已隐藏' : String(item.status || '待处理'),
        statusClass: getDemandStatusClass(item),
        dateText: formatDateText(item.updatedAt || item.createdAt),
        _selected: false
      }));

      const itemIdSet = new Set(manageItems.map((item) => String(item.id)));
      const demandIdSet = new Set(manageDemands.map((item) => String(item.id)));
      const selectedItemIds = (this.data.selectedItemIds || []).filter((id) => itemIdSet.has(String(id)));
      const selectedDemandIds = (this.data.selectedDemandIds || []).filter((id) => demandIdSet.has(String(id)));

      this.setData({
        isAdmin: Boolean(resp.isAdmin || currentUser.isAdmin),
        manageItems,
        manageDemands,
        selectedItemIds,
        selectedDemandIds
      }, () => {
        this.applySelectionState();
      });
    } catch (err) {
      wx.showToast({ title: '管理列表加载失败', icon: 'none' });
      this.setData({
        manageItems: [],
        manageDemands: [],
        selectedItemIds: [],
        selectedDemandIds: []
      }, () => {
        this.syncBulkCount();
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async editItemTitle(event) {
    const itemId = Number(event.currentTarget.dataset.id);
    const target = this.data.manageItems.find((item) => item.id === itemId);
    if (!target) {
      return;
    }
    const nextTitle = await inputText({
      title: '修改出借标题',
      placeholder: '请输入新标题',
      value: target.title
    });
    if (!nextTitle) {
      return;
    }
    await this.updateItemPostById(itemId, {
      title: nextTitle
    });
  },

  async toggleItemStatus(event) {
    const itemId = Number(event.currentTarget.dataset.id);
    const target = this.data.manageItems.find((item) => item.id === itemId);
    if (!target) {
      return;
    }
    const nextStatus = target.status === '可借' ? '暂停' : '可借';
    await this.updateItemPostById(itemId, {
      status: nextStatus
    });
  },

  async deleteItem(event) {
    const itemId = Number(event.currentTarget.dataset.id);
    const ok = await confirmDelete('删除后不可恢复，是否继续？');
    if (!ok) {
      return;
    }
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }
    try {
      await deleteItemPost(itemId, {
        actorUserId: String(currentUser.id)
      });
      wx.showToast({ title: '删除成功', icon: 'success' });
      await this.loadManagePosts();
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  async editDemandTitle(event) {
    const demandId = String(event.currentTarget.dataset.id || '');
    const target = this.data.manageDemands.find((item) => String(item.id) === demandId);
    if (!target) {
      return;
    }
    const nextTitle = await inputText({
      title: '修改求借标题',
      placeholder: '请输入新标题',
      value: target.title
    });
    if (!nextTitle) {
      return;
    }
    await this.updateDemandPostById(demandId, {
      title: nextTitle
    });
  },

  async toggleDemandStatus(event) {
    const demandId = String(event.currentTarget.dataset.id || '');
    const target = this.data.manageDemands.find((item) => String(item.id) === demandId);
    if (!target) {
      return;
    }
    const nextStatus = target.status === '求借中' ? '已解决' : '求借中';
    await this.updateDemandPostById(demandId, {
      status: nextStatus
    });
  },

  async deleteDemand(event) {
    const demandId = String(event.currentTarget.dataset.id || '');
    const ok = await confirmDelete('删除后不可恢复，是否继续？');
    if (!ok) {
      return;
    }
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }
    try {
      await deleteDemandPost(demandId, {
        actorUserId: String(currentUser.id)
      });
      wx.showToast({ title: '删除成功', icon: 'success' });
      await this.loadManagePosts();
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  async updateItemPostById(itemId, patch) {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }
    try {
      await updateItemPost(itemId, {
        actorUserId: String(currentUser.id),
        ...patch
      });
      wx.showToast({ title: '更新成功', icon: 'success' });
      await this.loadManagePosts();
    } catch (err) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  async updateDemandPostById(demandId, patch) {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }
    try {
      await updateDemandPost(demandId, {
        actorUserId: String(currentUser.id),
        ...patch
      });
      wx.showToast({ title: '更新成功', icon: 'success' });
      await this.loadManagePosts();
    } catch (err) {
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  async handleBulkAction() {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      return;
    }

    const isItemTab = this.data.activeTab === 'item';
    const selectedIds = isItemTab
      ? (this.data.selectedItemIds || []).map((id) => String(id))
      : (this.data.selectedDemandIds || []).map((id) => String(id));

    if (!selectedIds.length) {
      wx.showToast({ title: '请先选择帖子', icon: 'none' });
      return;
    }

    const targets = isItemTab
      ? (this.data.manageItems || []).filter((item) => selectedIds.includes(String(item.id)))
      : (this.data.manageDemands || []).filter((item) => selectedIds.includes(String(item.id)));

    const allHidden = targets.length > 0 && targets.every((item) => Boolean(item.isHidden));
    const actionList = [allHidden ? '批量恢复显示' : '批量暂时隐藏', '批量删除'];
    const idx = await chooseAction(actionList);
    if (idx < 0) {
      return;
    }

    try {
      if (idx === 0) {
        const hiddenReason = allHidden
          ? ''
          : (this.data.isAdmin ? '管理员批量隐藏' : '用户批量隐藏');
        for (let i = 0; i < targets.length; i += 1) {
          const post = targets[i];
          if (isItemTab) {
            await updateItemPost(Number(post.id), {
              actorUserId: String(currentUser.id),
              isHidden: !allHidden,
              hiddenReason
            });
          } else {
            await updateDemandPost(String(post.id), {
              actorUserId: String(currentUser.id),
              isHidden: !allHidden,
              hiddenReason
            });
          }
        }
      } else if (idx === 1) {
        const ok = await confirmDelete(`将删除 ${targets.length} 条帖子，是否继续？`);
        if (!ok) {
          return;
        }
        for (let i = 0; i < targets.length; i += 1) {
          const post = targets[i];
          if (isItemTab) {
            await deleteItemPost(Number(post.id), {
              actorUserId: String(currentUser.id)
            });
          } else {
            await deleteDemandPost(String(post.id), {
              actorUserId: String(currentUser.id)
            });
          }
        }
      }

      wx.showToast({ title: '批量操作成功', icon: 'success' });
      this.setData({
        selectedItemIds: [],
        selectedDemandIds: []
      });
      await this.loadManagePosts();
    } catch (err) {
      wx.showToast({ title: '批量操作失败', icon: 'none' });
    }
  }
});
