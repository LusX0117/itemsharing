const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  getChatMessages,
  sendChatMessage,
  markChatSessionRead,
  runChatSessionAction
} = require('../../utils/chat-api');

const POLL_INTERVAL_MS = 3000;
const ORDER_STAGE_LABELS = ['已申请', '已同意', '借用中', '已归还'];

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

const resolveOrderStageInfo = (status) => {
  const raw = String(status || '');
  if (['待出借者同意', '借用协商中'].includes(raw)) {
    return { index: 0, text: '已申请' };
  }
  if (raw === '借用中') {
    return { index: 1, text: '已同意' };
  }
  if (raw === '待确认归还') {
    return { index: 2, text: '借用中' };
  }
  if (raw === '已完成') {
    return { index: 3, text: '已归还' };
  }
  return { index: 0, text: '已申请' };
};

const buildOrderSteps = (status) => {
  const info = resolveOrderStageInfo(status);
  return ORDER_STAGE_LABELS.map((label, index) => ({
    label,
    done: info.index >= 0 && index < info.index,
    current: index === info.index
  }));
};

const resolvePrimaryStatusAction = ({ status, isLender, isBorrower }) => {
  const text = String(status || '');
  if (isLender && ['待出借者同意', '借用协商中'].includes(text)) {
    return { text: '同意借用', action: 'approve_borrow', className: 'action-approve' };
  }
  if (isBorrower && text === '借用中') {
    return { text: '发起归还', action: 'request_return', className: 'action-return' };
  }
  if (isLender && text === '待确认归还') {
    return { text: '确认归还', action: 'confirm_return', className: 'action-confirm' };
  }
  return null;
};

Page({
  data: {
    sessionId: '',
    session: null,
    currentUser: null,
    messageList: [],
    messageText: '',
    lastMessageAnchor: '',
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

  buildSessionView(session) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
    const isBorrower = userId && userId === String(session.borrowerUserId);
    const peerName = isLender ? String(session.borrowerName || '') : String(session.lenderName || '');
    const peerInitial = peerName ? peerName.slice(0, 1) : '友';
    const statusBadge = resolveStatusBadge(session.status, false);
    const itemTitleShort = String(session.itemTitle || '').slice(0, 4) || '物品';
    const primaryAction = resolvePrimaryStatusAction({
      status: session.status,
      isLender,
      isBorrower
    });

    return {
      ...session,
      peerName: peerName || '聊天对象',
      peerInitial,
      itemTitleShort,
      statusBadgeText: statusBadge.text,
      statusBadgeClass: statusBadge.className,
      stageSteps: buildOrderSteps(session.status),
      canChangeStatus: Boolean(primaryAction),
      statusActionText: primaryAction ? primaryAction.text : '',
      statusActionType: primaryAction ? primaryAction.action : '',
      statusActionClass: primaryAction ? primaryAction.className : ''
    };
  },

  applySessionAndMessages(session, mappedMessages) {
    const lastMessage = mappedMessages[mappedMessages.length - 1];
    const sessionWithView = this.buildSessionView(session);

    this.safeSetData({
      session: sessionWithView,
      messageList: mappedMessages,
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
      this.applySessionAndMessages(latestSession, allMessages);
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

  onStatusActionTap() {
    const session = this.data.session;
    if (!session || !session.canChangeStatus || !session.statusActionType) {
      return;
    }
    const action = String(session.statusActionType);
    if (action === 'request_return') {
      wx.showModal({
        title: '发起归还确认？',
        content: '发起后需出借者确认才能完成借用。',
        success: (res) => {
          if (res.confirm) {
            this.commitStatusAction(action, '已发起归还确认');
          }
        }
      });
      return;
    }
    if (action === 'confirm_return') {
      wx.showModal({
        title: '确认已归还？',
        content: '确认后将自动跳转到评价页面。',
        success: (res) => {
          if (res.confirm) {
            this.commitStatusAction(action, '已确认归还', { toRating: true });
          }
        }
      });
      return;
    }
    if (action === 'approve_borrow') {
      this.commitStatusAction(action, '已同意借用');
      return;
    }
    this.commitStatusAction(action, '状态已更新');
  },

  async commitStatusAction(action, successText, options = {}) {
    try {
      await runChatSessionAction({
        sessionId: this.data.sessionId,
        action
      });
      await this.refreshAll();
      wx.showToast({ title: successText, icon: 'success' });
      if (options.toRating) {
        setTimeout(() => {
          this.openRatingPage();
        }, 250);
      }
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (msg.includes('invalid_status_transition')) {
        wx.showToast({ title: '状态已变化，请刷新后重试', icon: 'none' });
        await this.refreshAll();
        return;
      }
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  handleAttachTap() {
    wx.showActionSheet({
      itemList: ['物品详情页', '评价页'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.openItemDetail();
          return;
        }
        if (res.tapIndex === 1) {
          this.openRatingPage();
        }
      }
    });
  },

  openItemDetail() {
    const sessionId = encodeURIComponent(String(this.data.sessionId || ''));
    wx.navigateTo({
      url: `/pages/chat-item/chat-item?sessionId=${sessionId}`
    });
  },

  openRatingPage() {
    const sessionId = encodeURIComponent(String(this.data.sessionId || ''));
    wx.navigateTo({
      url: `/pages/chat-rating/chat-rating?sessionId=${sessionId}`
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
