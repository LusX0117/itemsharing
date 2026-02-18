const categoryOptions = ['教材', '电子产品', '运动器材', '生活用品', '其他'];
const { getCurrentUser } = require('../../utils/db');
const { createItemPost, createDemandPost } = require('../../utils/post-api');

Page({
  data: {
    currentUser: null,
    mode: 'lend',
    categoryOptions,
    lendForm: {
      title: '',
      category: '教材',
      price: '',
      deposit: '',
      location: '',
      description: ''
    },
    demandForm: {
      title: '',
      category: '教材',
      budget: '',
      location: '',
      reward: '',
      description: ''
    }
  },

  onShow() {
    this.setData({
      currentUser: getCurrentUser()
    });
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) {
      return;
    }
    this.setData({ mode });
  },

  handleLendInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`lendForm.${field}`]: event.detail.value
    });
  },

  chooseLendCategory(event) {
    const category = categoryOptions[event.detail.value] || '教材';
    this.setData({
      'lendForm.category': category
    });
  },

  handleDemandInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`demandForm.${field}`]: event.detail.value
    });
  },

  chooseDemandCategory(event) {
    const category = categoryOptions[event.detail.value] || '教材';
    this.setData({
      'demandForm.category': category
    });
  },

  async submitPublish() {
    if (!this.data.currentUser) {
      wx.showToast({ title: '请先登录后发布', icon: 'none' });
      return;
    }

    if (this.data.mode === 'lend') {
      await this.submitLend();
      return;
    }
    await this.submitDemand();
  },

  async submitLend() {
    const { lendForm, currentUser } = this.data;
    const requiredFields = ['title', 'price', 'deposit', 'location'];
    const emptyField = requiredFields.find((field) => !String(lendForm[field]).trim());
    if (emptyField) {
      wx.showToast({ title: '请填写完整出借信息', icon: 'none' });
      return;
    }

    try {
      await createItemPost({
        title: lendForm.title.trim(),
        ownerUserId: String(currentUser.id),
        ownerName: `我 · ${currentUser.nickname}`,
        category: lendForm.category,
        price: Number(lendForm.price) || 0,
        deposit: Number(lendForm.deposit) || 0,
        location: lendForm.location.trim(),
        description: lendForm.description.trim() || '暂无描述'
      });
    } catch (err) {
      wx.showToast({ title: '发布失败，请稍后再试', icon: 'none' });
      return;
    }

    this.setData({
      lendForm: {
        title: '',
        category: '教材',
        price: '',
        deposit: '',
        location: '',
        description: ''
      }
    });
    wx.showToast({ title: '出借发布成功', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 400);
  },

  async submitDemand() {
    const { demandForm, currentUser } = this.data;
    const requiredFields = ['title', 'budget', 'location'];
    const emptyField = requiredFields.find((field) => !String(demandForm[field]).trim());
    if (emptyField) {
      wx.showToast({ title: '请填写完整求借信息', icon: 'none' });
      return;
    }

    try {
      await createDemandPost({
        title: demandForm.title.trim(),
        publisherUserId: String(currentUser.id),
        publisherName: `我 · ${currentUser.nickname}`,
        category: demandForm.category,
        budget: Number(demandForm.budget) || 0,
        location: demandForm.location.trim(),
        reward: demandForm.reward.trim() || '可协商',
        description: demandForm.description.trim() || '暂无补充说明'
      });
    } catch (err) {
      wx.showToast({ title: '发布失败，请稍后再试', icon: 'none' });
      return;
    }

    this.setData({
      demandForm: {
        title: '',
        category: '教材',
        budget: '',
        location: '',
        reward: '',
        description: ''
      }
    });
    wx.showToast({ title: '求借发布成功', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 400);
  }
});
