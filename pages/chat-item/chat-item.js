const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  updateChatSessionPhotos,
  runChatSessionAction
} = require('../../utils/chat-api');

const MAX_PHOTO_COUNT = 3;
const DATA_URL_PREFIX = 'data:';
const ORDER_STAGE_LABELS = ['Requested', 'Confirmed', 'Picked Up', 'Returned'];

const buildCompareRows = (beforePhotos, afterPhotos) => {
  const maxLen = Math.max(beforePhotos.length, afterPhotos.length);
  const rows = [];
  for (let i = 0; i < maxLen; i += 1) {
    rows.push({
      index: i,
      before: beforePhotos[i] || '',
      after: afterPhotos[i] || ''
    });
  }
  return rows;
};

const isPendingBorrowApproval = (status) => ['待出借者同意', '借用协商中'].includes(String(status || ''));

const resolveOrderStageInfo = (status) => {
  const raw = String(status || '');
  if (['待出借者同意', '借用协商中'].includes(raw)) {
    return { index: 0, text: '待出借者同意' };
  }
  if (raw === '借用中') {
    return { index: 1, text: '借用中' };
  }
  if (raw === '待确认归还') {
    return { index: 2, text: '待确认归还' };
  }
  if (raw === '已完成') {
    return { index: 3, text: '已完成' };
  }
  if (raw === '已拒绝') {
    return { index: -1, text: '已拒绝' };
  }
  if (raw === '已取消') {
    return { index: -1, text: '已取消' };
  }
  return { index: 0, text: raw || '待同意' };
};

const buildOrderSteps = (status) => {
  const info = resolveOrderStageInfo(status);
  return ORDER_STAGE_LABELS.map((label, index) => ({
    label,
    done: info.index >= 0 && index < info.index,
    current: index === info.index
  }));
};

const resolveStatusBadge = (status, isHidden = false) => {
  if (isHidden) {
    return { text: '已隐藏', className: 'status-flagged' };
  }
  const text = String(status || '');
  if (['可借', '借用中', '求借中', '已完成'].includes(text)) {
    return { text, className: 'status-active' };
  }
  if (['待出借者同意', '借用协商中', '待确认归还'].includes(text)) {
    return { text, className: 'status-pending' };
  }
  return { text: text || '待处理', className: 'status-flagged' };
};

Page({
  data: {
    sessionId: '',
    session: null,
    currentUser: null,
    compareRows: [],
    loading: true
  },

  onLoad(options) {
    this.setData({
      sessionId: options.sessionId || ''
    });
  },

  async onShow() {
    this.setData({
      currentUser: getCurrentUser()
    });
    await this.refreshAll();
  },

  buildSessionView(session) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
    const isBorrower = userId && userId === String(session.borrowerUserId);
    const pendingBorrowApproval = isPendingBorrowApproval(session.status);
    const orderStage = resolveOrderStageInfo(session.status);
    const statusBadge = resolveStatusBadge(session.status, false);

    return {
      ...session,
      orderStageText: orderStage.text,
      stageSteps: buildOrderSteps(session.status),
      itemTitleShort: String(session.itemTitle || '').slice(0, 4) || 'ITEM',
      statusBadgeText: statusBadge.text,
      statusBadgeClass: statusBadge.className,
      isLender,
      isBorrower,
      pendingBorrowApproval,
      canApproveBorrow: Boolean(isLender && pendingBorrowApproval),
      canRejectBorrow: Boolean(isLender && pendingBorrowApproval),
      canCancelBorrow: Boolean(isBorrower && ['待出借者同意', '借用协商中', '借用中', '待确认归还'].includes(String(session.status))),
      canRequestReturn: Boolean(isBorrower && String(session.status) === '借用中'),
      canConfirmReturn: Boolean(isLender && String(session.status) === '待确认归还'),
      canRejectReturn: Boolean(isLender && String(session.status) === '待确认归还')
    };
  },

  async refreshAll() {
    const { sessionId } = this.data;
    if (!sessionId) {
      this.setData({ loading: false });
      return;
    }

    try {
      const resp = await getChatSession(sessionId);
      const session = resp.session;
      if (!session) {
        this.setData({ session: null, loading: false });
        return;
      }
      const viewSession = this.buildSessionView(session);
      this.setData({
        session: viewSession,
        compareRows: buildCompareRows(viewSession.beforePhotos || [], viewSession.afterPhotos || []),
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '物品详情加载失败', icon: 'none' });
    }
  },

  async runSessionAction(action, successText, options = {}) {
    const session = this.data.session;
    const currentUser = this.data.currentUser || getCurrentUser();
    if (!session || !currentUser) {
      return;
    }
    const needComparePhotos = Boolean(options.needComparePhotos);
    const reason = String(options.reason || '').trim();

    if (needComparePhotos) {
      if (!(session.beforePhotos || []).length || !(session.afterPhotos || []).length) {
        wx.showToast({ title: '请先补充借前和归还后照片', icon: 'none' });
        return;
      }
    }

    try {
      await runChatSessionAction({
        sessionId: this.data.sessionId,
        action,
        reason
      });
      await this.refreshAll();
      wx.showToast({ title: successText, icon: 'success' });
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (msg.includes('invalid_status_transition')) {
        wx.showToast({ title: '状态已变化，请刷新后重试', icon: 'none' });
        await this.refreshAll();
        return;
      }
      if (msg.includes('missing_compare_photos')) {
        wx.showToast({ title: '请先上传借前和归还后照片', icon: 'none' });
        return;
      }
      if (msg.includes('missing_action_reason')) {
        wx.showToast({ title: '请填写原因', icon: 'none' });
        return;
      }
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  approveBorrow() {
    this.runSessionAction('approve_borrow', '已同意借用');
  },

  askActionReason(title) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        editable: true,
        placeholderText: '请填写原因（必填）',
        success: (res) => {
          if (!res.confirm) {
            resolve(null);
            return;
          }
          const text = String(res.content || '').trim();
          resolve(text || '');
        },
        fail: () => resolve(null)
      });
    });
  },

  async rejectBorrow() {
    const reason = await this.askActionReason('拒绝借用原因');
    if (reason === null) {
      return;
    }
    if (!reason) {
      wx.showToast({ title: '请填写原因', icon: 'none' });
      return;
    }
    this.runSessionAction('reject_borrow', '已拒绝借用', { reason });
  },

  requestReturn() {
    wx.showModal({
      title: '发起归还确认？',
      content: '发起后需出借者确认才能完成借用。',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('request_return', '已发起归还确认', { needComparePhotos: true });
        }
      }
    });
  },

  confirmReturn() {
    wx.showModal({
      title: '确认已归还？',
      content: '确认后本次借用会标记为已完成。',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('confirm_return', '已确认归还');
        }
      }
    });
  },

  async rejectReturn() {
    const reason = await this.askActionReason('退回归还原因');
    if (reason === null) {
      return;
    }
    if (!reason) {
      wx.showToast({ title: '请填写原因', icon: 'none' });
      return;
    }
    this.runSessionAction('reject_return', '已退回归还确认', { reason });
  },

  async cancelBorrow() {
    const reason = await this.askActionReason('取消借用原因');
    if (reason === null) {
      return;
    }
    if (!reason) {
      wx.showToast({ title: '请填写原因', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认取消借用？',
      content: '取消后当前借用单会结束。',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('cancel_borrow', '已取消借用', { reason });
        }
      }
    });
  },

  addBeforePhoto() {
    this.addPhotoByField('beforePhotos');
  },

  addAfterPhoto() {
    this.addPhotoByField('afterPhotos');
  },

  addPhotoByField(fieldName) {
    const session = this.data.session;
    if (!session) {
      return;
    }

    const currentList = session[fieldName] || [];
    if (currentList.length >= MAX_PHOTO_COUNT) {
      wx.showToast({ title: '最多上传3张', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: MAX_PHOTO_COUNT - currentList.length,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: async (res) => {
        const pickedPaths = res.tempFilePaths || [];
        try {
          const normalizedNewPhotos = await this.normalizePhotosForPersist(pickedPaths);
          const nextList = [...currentList, ...normalizedNewPhotos].slice(0, MAX_PHOTO_COUNT);
          const payload = { sessionId: this.data.sessionId };
          if (fieldName === 'beforePhotos') {
            payload.beforePhotos = nextList;
            payload.afterPhotos = session.afterPhotos || [];
          } else {
            payload.beforePhotos = session.beforePhotos || [];
            payload.afterPhotos = nextList;
          }
          await updateChatSessionPhotos(payload);
          await this.refreshAll();
        } catch (err) {
          wx.showToast({ title: '照片保存失败', icon: 'none' });
        }
      }
    });
  },

  getMimeTypeByPath(filePath) {
    const lower = String(filePath || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  },

  filePathToDataUrl(filePath) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          const base64 = String((res && res.data) || '');
          if (!base64) {
            reject(new Error('empty_file'));
            return;
          }
          const mime = this.getMimeTypeByPath(filePath);
          resolve(`data:${mime};base64,${base64}`);
        },
        fail: reject
      });
    });
  },

  async normalizePhotosForPersist(paths) {
    const list = Array.isArray(paths) ? paths : [];
    const normalized = [];
    for (const p of list) {
      const value = String(p || '');
      if (!value) {
        continue;
      }
      if (value.startsWith(DATA_URL_PREFIX) || value.startsWith('http://') || value.startsWith('https://')) {
        normalized.push(value);
      } else {
        const dataUrl = await this.filePathToDataUrl(value);
        normalized.push(dataUrl);
      }
    }
    return normalized;
  },

  previewPhoto(event) {
    const url = event.currentTarget.dataset.url;
    const session = this.data.session;
    if (!session || !url) {
      return;
    }

    const urls = [...(session.beforePhotos || []), ...(session.afterPhotos || [])];
    wx.previewImage({
      current: url,
      urls
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    const sessionId = encodeURIComponent(String(this.data.sessionId || ''));
    wx.redirectTo({
      url: `/pages/chat/chat?sessionId=${sessionId}`
    });
  }
});
