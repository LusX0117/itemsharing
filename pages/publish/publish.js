const categoryOptions = ['教材', '电子产品', '运动器材', '生活用品', '其他'];
const { getCurrentUser } = require('../../utils/db');
const { createItemPost, createDemandPost, uploadItemPhoto } = require('../../utils/post-api');
const TAB_INDEX = 2;

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

const readLocalFileAsBase64 = (filePath) => new Promise((resolve, reject) => {
  wx.getFileSystemManager().readFile({
    filePath: String(filePath || ''),
    encoding: 'base64',
    success: (res) => resolve(String((res && res.data) || '')),
    fail: reject
  });
});

const guessImageMimeType = (filePath) => {
  const text = String(filePath || '').toLowerCase();
  if (text.endsWith('.png')) {
    return 'image/png';
  }
  if (text.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
};

Page({
  data: {
    currentUser: null,
    mode: 'lend',
    categoryOptions,
    photoSlotIndexes: [0, 1, 2],
    lendForm: {
      title: '',
      category: '教材',
      price: '',
      deposit: '',
      location: '',
      description: '',
      photos: []
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
    syncTabBarSelected(this, TAB_INDEX);
    this.setData({
      currentUser: getCurrentUser()
    });
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
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

  handlePhotoSlotTap(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = this.data.lendForm.photos || [];
    if (Number.isInteger(index) && photos[index]) {
      wx.previewImage({
        current: photos[index],
        urls: photos
      });
      return;
    }
    this.chooseLendPhotos();
  },

  chooseLendPhotos() {
    const photos = this.data.lendForm.photos || [];
    const remain = Math.max(0, 3 - photos.length);
    if (!remain) {
      wx.showToast({ title: '最多上传3张', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = (res && res.tempFilePaths) || [];
        if (!tempFiles.length) {
          return;
        }
        const nextPhotos = photos.concat(tempFiles).slice(0, 3);
        this.setData({
          'lendForm.photos': nextPhotos
        });
      }
    });
  },

  removeLendPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = (this.data.lendForm.photos || []).slice();
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) {
      return;
    }
    photos.splice(index, 1);
    this.setData({
      'lendForm.photos': photos
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

  async uploadLendPhotosToServer(localPaths) {
    const paths = (Array.isArray(localPaths) ? localPaths : []).filter(Boolean).slice(0, 3);
    if (!paths.length) {
      return [];
    }

    const uploadedUrls = [];
    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i];
      const base64 = await readLocalFileAsBase64(path);
      if (!base64) {
        throw new Error('empty_photo_data');
      }
      const resp = await uploadItemPhoto({
        fileBase64: base64,
        mimeType: guessImageMimeType(path)
      });
      const url = resp && resp.url ? String(resp.url) : '';
      if (!url) {
        throw new Error('upload_no_url');
      }
      uploadedUrls.push(url);
    }
    return uploadedUrls;
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

    const hasPhotos = Array.isArray(lendForm.photos) && lendForm.photos.length > 0;
    let uploadedPhotos = [];
    try {
      if (hasPhotos) {
        wx.showLoading({
          title: '正在上传图片',
          mask: true
        });
      }
      uploadedPhotos = await this.uploadLendPhotosToServer(lendForm.photos || []);
    } catch (err) {
      const message = String((err && err.message) || '');
      if (message.includes('http_404')) {
        wx.showToast({ title: '服务器未部署上传接口', icon: 'none' });
      } else {
        wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
      }
      return;
    } finally {
      if (hasPhotos) {
        wx.hideLoading();
      }
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
        description: lendForm.description.trim() || '暂无描述',
        photos: uploadedPhotos
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
        description: '',
        photos: []
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
