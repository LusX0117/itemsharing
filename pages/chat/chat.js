const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  getChatMessages,
  sendChatMessage,
  updateChatSessionPhotos,
  runChatSessionAction,
  markChatSessionRead,
  rateChatSession
} = require('../../utils/chat-api');

const MAX_PHOTO_COUNT = 3;
const POLL_INTERVAL_MS = 3000;
const DATA_URL_PREFIX = 'data:';
const ORDER_STAGE_LABELS = ['待同意', '借用中', '待归还确认', '已完成'];

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

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

const resolveStatusByMessages = (status, messages) => {
  const raw = String(status || '');
  if (raw !== '借用中') {
    return raw;
  }
  const hasApproveMarker = (messages || []).some(
    (msg) => String(msg.senderUserId) === 'system' && String(msg.text || '').includes('同意借用')
  );
  return hasApproveMarker ? '借用中' : '待出借者同意';
};

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

Page({
  data: {
    sessionId: '',
    session: null,
    currentUser: null,
    messageList: [],
    timelineRecords: [],
    messageText: '',
    compareRows: [],
    lastMessageAnchor: '',
    ratingSummary: null,
    lastReadMessageIdSent: 0,
    loading: true
  },

  pollTimer: null,
  isPageAlive: false,
  isPageVisible: false,

  safeSetData(nextData, options = {}) {
    const { allowHidden = false } = options;
    if (!this.isPageAlive) {
      return;
    }
    if (!allowHidden && !this.isPageVisible) {
      return;
    }
    this.setData(nextData);
  },

  onLoad(options) {
    this.isPageAlive = true;
    this.safeSetData({
      sessionId: options.sessionId || '',
      lastReadMessageIdSent: 0
    }, { allowHidden: true });
  },

  async onShow() {
    this.isPageVisible = true;
    this.safeSetData({
      currentUser: getCurrentUser()
    });
    await this.refreshAll();
    this.startPolling();
  },

  onHide() {
    this.isPageVisible = false;
    this.stopPolling();
  },

  onUnload() {
    this.isPageVisible = false;
    this.isPageAlive = false;
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.isPageAlive || !this.isPageVisible) {
        return;
      }
      this.fetchLatestMessages();
    }, POLL_INTERVAL_MS);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  mapMessages(messages) {
    const currentUser = this.data.currentUser || getCurrentUser() || {};
    return (messages || []).map((message) => ({
      ...message,
      sender: message.senderUserId === 'system' ? 'system' : 'user',
      mine: String(message.senderUserId) === String(currentUser.id || ''),
      timeText: formatDateTime(message.time),
      dayText: new Date(message.time).toISOString().slice(0, 10)
    })).sort((a, b) => Number(a.id) - Number(b.id));
  },

  buildTimelineRecords(messages) {
    const records = [];
    let lastDay = '';
    (messages || []).forEach((msg) => {
      const dayText = msg.dayText || '';
      if (dayText && dayText !== lastDay) {
        records.push({
          kind: 'marker',
          rowKey: `day-${dayText}`,
          label: dayText
        });
        lastDay = dayText;
      }
      records.push({
        kind: 'message',
        rowKey: `msg-${msg.id}`,
        ...msg
      });
    });
    return records;
  },

  buildSessionView(session, ratingSummary = null) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
    const isBorrower = userId && userId === String(session.borrowerUserId);
    const pendingBorrowApproval = isPendingBorrowApproval(session.status);
    const orderStage = resolveOrderStageInfo(session.status);
    const summary = ratingSummary || this.data.ratingSummary || { myRating: null, byTarget: {}, ratings: [] };
    const targetUserId = isLender ? String(session.borrowerUserId) : String(session.lenderUserId);
    const targetName = isLender ? String(session.borrowerName || '') : String(session.lenderName || '');
    const targetCredit = (summary.byTarget && summary.byTarget[targetUserId]) || {
      userId: targetUserId,
      averageScore: 0,
      ratingCount: 0
    };
    const myRating = summary.myRating || null;
    const canRate = String(session.status) === '已完成' && Boolean(userId) && !myRating;
    const targetCreditText = targetCredit.ratingCount
      ? `${targetCredit.averageScore} 分（${targetCredit.ratingCount} 条）`
      : '暂无评价';
    const myRatingText = myRating ? `${myRating.score} 星` : '未评价';

    return {
      ...session,
      orderNo: String(session.id || ''),
      orderStageText: orderStage.text,
      stageSteps: buildOrderSteps(session.status),
      isLender,
      isBorrower,
      myRating,
      myRatingText,
      canRate,
      targetName,
      targetCredit,
      targetCreditText,
      pendingBorrowApproval,
      canApproveBorrow: Boolean(isLender && pendingBorrowApproval),
      canRejectBorrow: Boolean(isLender && pendingBorrowApproval),
      canCancelBorrow: Boolean(isBorrower && ['待出借者同意', '借用协商中', '借用中', '待确认归还'].includes(String(session.status))),
      canRequestReturn: Boolean(isBorrower && String(session.status) === '借用中'),
      canConfirmReturn: Boolean(isLender && String(session.status) === '待确认归还'),
      canRejectReturn: Boolean(isLender && String(session.status) === '待确认归还')
    };
  },

  applySessionAndMessages(session, mappedMessages, ratingSummary = null) {
    const beforePhotos = session.beforePhotos || [];
    const afterPhotos = session.afterPhotos || [];
    const normalizedStatus = resolveStatusByMessages(session.status, mappedMessages);
    const lastMessage = mappedMessages[mappedMessages.length - 1];
    const summary = ratingSummary || this.data.ratingSummary || { myRating: null, byTarget: {}, ratings: [] };

    const sessionWithView = this.buildSessionView({
      ...session,
      status: normalizedStatus,
      beforePhotos,
      afterPhotos
    }, summary);

    this.safeSetData({
      session: sessionWithView,
      messageList: mappedMessages,
      timelineRecords: this.buildTimelineRecords(mappedMessages),
      compareRows: buildCompareRows(beforePhotos, afterPhotos),
      lastMessageAnchor: lastMessage ? `msg-${lastMessage.id}` : '',
      ratingSummary: summary,
      loading: false
    });
  },

  async refreshAll() {
    const { sessionId } = this.data;
    if (!sessionId) {
      this.safeSetData({ loading: false });
      return;
    }

    try {
      const [sessionResp, messageResp] = await Promise.all([
        getChatSession(sessionId),
        getChatMessages(sessionId)
      ]);

      const session = sessionResp.session;
      if (!session) {
        this.safeSetData({ session: null, loading: false });
        return;
      }

      const mappedMessages = this.mapMessages(messageResp.messages || []);
      this.applySessionAndMessages(session, mappedMessages, sessionResp.ratingSummary || null);
      await this.markSessionRead(mappedMessages);
    } catch (err) {
      this.safeSetData({ loading: false });
      if (this.isPageVisible) {
        wx.showToast({ title: '聊天数据加载失败', icon: 'none' });
      }
    }
  },

  async fetchLatestMessages() {
    const { sessionId, session } = this.data;
    if (!sessionId || !session) {
      return;
    }

    try {
      const [sessionResp, messageResp] = await Promise.all([
        getChatSession(sessionId),
        getChatMessages(sessionId)
      ]);

      const latestSession = sessionResp.session;
      if (!latestSession) {
        return;
      }

      const allMessages = this.mapMessages(messageResp.messages || []);
      this.applySessionAndMessages(latestSession, allMessages, sessionResp.ratingSummary || null);
      await this.markSessionRead(allMessages);
    } catch (err) {
      // polling failure should be silent to avoid toast spam
    }
  },

  async markSessionRead(messages = []) {
    const currentUser = this.data.currentUser || getCurrentUser();
    const sessionId = this.data.sessionId;
    if (!currentUser || !sessionId) {
      return;
    }
    const lastMessage = (messages || [])[messages.length - 1];
    const nextReadId = lastMessage ? Number(lastMessage.id) : 0;
    if (!nextReadId || nextReadId <= Number(this.data.lastReadMessageIdSent || 0)) {
      return;
    }
    try {
      await markChatSessionRead({
        sessionId,
        lastReadMessageId: nextReadId
      });
      this.safeSetData({
        lastReadMessageIdSent: nextReadId
      });
    } catch (err) {
      // silent
    }
  },

  handleMessageInput(event) {
    this.safeSetData({
      messageText: event.detail.value
    });
  },

  async sendMessage() {
    const text = this.data.messageText.trim();
    if (!text) {
      return;
    }

    const currentUser = this.data.currentUser || getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const { sessionId } = this.data;
    try {
      await sendChatMessage({
        sessionId,
        text
      });
      this.safeSetData({ messageText: '' });
      await this.refreshAll();
    } catch (err) {
      if (this.isPageVisible) {
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
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
        if (this.isPageVisible) {
          wx.showToast({ title: '请先补充借前和归还后照片', icon: 'none' });
        }
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
      if (this.isPageVisible) {
        wx.showToast({ title: successText, icon: 'success' });
      }
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (msg.includes('invalid_status_transition')) {
        if (this.isPageVisible) {
          wx.showToast({ title: '状态已变化，请刷新后重试', icon: 'none' });
        }
        await this.refreshAll();
        return;
      }
      if (msg.includes('missing_compare_photos')) {
        if (this.isPageVisible) {
          wx.showToast({ title: '请先上传借前和归还后照片', icon: 'none' });
        }
        return;
      }
      if (msg.includes('missing_action_reason')) {
        if (this.isPageVisible) {
          wx.showToast({ title: '请填写原因', icon: 'none' });
        }
        return;
      }
      if (this.isPageVisible) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
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
      if (this.isPageVisible) {
        wx.showToast({ title: '最多上传3张', icon: 'none' });
      }
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
          const payload = {
            sessionId: this.data.sessionId
          };
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
          if (this.isPageVisible) {
            wx.showToast({ title: '照片保存失败', icon: 'none' });
          }
        }
      }
    });
  },

  async chooseScore() {
    const scoreItems = ['1 星', '2 星', '3 星', '4 星', '5 星'];
    return new Promise((resolve) => {
      wx.showActionSheet({
        itemList: scoreItems,
        success: (res) => resolve(Number(res.tapIndex) + 1),
        fail: () => resolve(0)
      });
    });
  },

  async inputRatingComment() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '填写评语（可选）',
        editable: true,
        placeholderText: '例如：沟通顺畅，归还及时',
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
  },

  async submitRating() {
    const session = this.data.session;
    const currentUser = this.data.currentUser || getCurrentUser();
    if (!session || !currentUser || !session.canRate) {
      return;
    }

    const score = await this.chooseScore();
    if (!score) {
      return;
    }
    const comment = await this.inputRatingComment();
    if (comment === null) {
      return;
    }

    try {
      const resp = await rateChatSession({
        sessionId: this.data.sessionId,
        score,
        comment
      });
      const summary = resp.ratingSummary || this.data.ratingSummary || null;
      const sessionWithView = this.buildSessionView(session, summary);
      this.safeSetData({
        ratingSummary: summary,
        session: sessionWithView
      });
      if (this.isPageVisible) {
        wx.showToast({ title: '评价已提交', icon: 'success' });
      }
    } catch (err) {
      const text = String((err && err.message) || '');
      if (this.isPageVisible) {
        if (text.includes('session_not_finished')) {
          wx.showToast({ title: '仅已完成借还可评价', icon: 'none' });
          return;
        }
        wx.showToast({ title: '评价提交失败', icon: 'none' });
      }
    }
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
  }
});
