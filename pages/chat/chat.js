const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  getChatMessages,
  sendChatMessage,
  updateChatSessionPhotos,
  runChatSessionAction
} = require('../../utils/chat-api');

const MAX_PHOTO_COUNT = 3;
const POLL_INTERVAL_MS = 2000;

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
      sessionId: options.sessionId || ''
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

  buildSessionView(session) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
    const isBorrower = userId && userId === String(session.borrowerUserId);
    const pendingBorrowApproval = isPendingBorrowApproval(session.status);

    return {
      ...session,
      isLender,
      isBorrower,
      pendingBorrowApproval,
      canApproveBorrow: Boolean(isLender && pendingBorrowApproval),
      canRejectBorrow: Boolean(isLender && pendingBorrowApproval),
      canRequestReturn: Boolean(isBorrower && String(session.status) === '借用中'),
      canConfirmReturn: Boolean(isLender && String(session.status) === '待确认归还'),
      canRejectReturn: Boolean(isLender && String(session.status) === '待确认归还')
    };
  },

  applySessionAndMessages(session, mappedMessages) {
    const beforePhotos = session.beforePhotos || [];
    const afterPhotos = session.afterPhotos || [];
    const normalizedStatus = resolveStatusByMessages(session.status, mappedMessages);
    const lastMessage = mappedMessages[mappedMessages.length - 1];

    const sessionWithView = this.buildSessionView({
      ...session,
      status: normalizedStatus,
      beforePhotos,
      afterPhotos
    });

    this.safeSetData({
      session: sessionWithView,
      messageList: mappedMessages,
      timelineRecords: this.buildTimelineRecords(mappedMessages),
      compareRows: buildCompareRows(beforePhotos, afterPhotos),
      lastMessageAnchor: lastMessage ? `msg-${lastMessage.id}` : '',
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
      this.applySessionAndMessages(session, mappedMessages);
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
      this.applySessionAndMessages(latestSession, allMessages);
    } catch (err) {
      // polling failure should be silent to avoid toast spam
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
        senderUserId: String(currentUser.id),
        senderName: currentUser.nickname,
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

  async runSessionAction(action, successText, needComparePhotos = false) {
    const session = this.data.session;
    const currentUser = this.data.currentUser || getCurrentUser();
    if (!session || !currentUser) {
      return;
    }

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
        actorUserId: String(currentUser.id),
        action
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
      if (this.isPageVisible) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  },

  approveBorrow() {
    this.runSessionAction('approve_borrow', '已同意借用');
  },

  rejectBorrow() {
    wx.showModal({
      title: '确认拒绝借用？',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('reject_borrow', '已拒绝借用');
        }
      }
    });
  },

  requestReturn() {
    wx.showModal({
      title: '发起归还确认？',
      content: '发起后需出借者确认才能完成借用。',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('request_return', '已发起归还确认', true);
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

  rejectReturn() {
    wx.showModal({
      title: '退回归还确认？',
      content: '退回后状态将恢复为借用中。',
      success: (res) => {
        if (res.confirm) {
          this.runSessionAction('reject_return', '已退回归还确认');
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
        const nextList = [...currentList, ...(res.tempFilePaths || [])].slice(0, MAX_PHOTO_COUNT);
        try {
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
