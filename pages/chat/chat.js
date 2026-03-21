const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  getChatMessages,
  sendChatMessage,
  markChatSessionRead,
  runChatSessionAction
} = require('../../utils/chat-api');
const { consumeAuthExpired } = require('../../utils/auth-guard');

const POLL_INTERVAL_MS = 3000;
const HISTORY_PAGE_SIZE = 40;
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

const resolveSecondaryStatusAction = ({ status, isLender, isBorrower }) => {
  const text = String(status || '');
  if (isLender && ['待出借者同意', '借用协商中'].includes(text)) {
    return { text: '拒绝借用', action: 'reject_borrow', className: 'action-reject', needsReason: true };
  }
  if (isLender && text === '待确认归还') {
    return { text: '退回归还', action: 'reject_return', className: 'action-reject', needsReason: true };
  }
  if (isBorrower && ['待出借者同意', '借用协商中', '借用中', '待确认归还'].includes(text)) {
    return { text: '取消借用', action: 'cancel_borrow', className: 'action-cancel', needsReason: true };
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
    scrollIntoView: '',
    hasMoreHistory: false,
    loadingHistory: false,
    lastReadMessageIdSent: 0,
    keyboardHeight: 0,
    loading: true
  },

  pollTimer: null,
  keyboardHeightListener: null,
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
    this.bindKeyboardHeightListener();
    await this.refreshAll();
    this.startPolling();
  },

  onHide() {
    this.isPageVisible = false;
    this.stopPolling();
    this.unbindKeyboardHeightListener();
    this.safeSetData({
      keyboardHeight: 0
    }, { allowHidden: true });
  },

  onUnload() {
    this.isPageVisible = false;
    this.isPageAlive = false;
    this.stopPolling();
    this.unbindKeyboardHeightListener();
  },

  bindKeyboardHeightListener() {
    if (this.keyboardHeightListener || typeof wx.onKeyboardHeightChange !== 'function') {
      return;
    }
    this.keyboardHeightListener = (res) => {
      const nextHeight = Math.max(0, Number(res && res.height) || 0);
      this.safeSetData({
        keyboardHeight: nextHeight
      }, { allowHidden: true });
    };
    wx.onKeyboardHeightChange(this.keyboardHeightListener);
  },

  unbindKeyboardHeightListener() {
    if (!this.keyboardHeightListener || typeof wx.offKeyboardHeightChange !== 'function') {
      this.keyboardHeightListener = null;
      return;
    }
    wx.offKeyboardHeightChange(this.keyboardHeightListener);
    this.keyboardHeightListener = null;
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
    const peerUserId = isLender ? String(session.borrowerUserId || '') : String(session.lenderUserId || '');
    const peerInitial = peerName ? peerName.slice(0, 1) : '友';
    const statusBadge = resolveStatusBadge(session.status, false);
    const itemTitleShort = String(session.itemTitle || '').slice(0, 4) || '物品';
    const primaryAction = resolvePrimaryStatusAction({
      status: session.status,
      isLender,
      isBorrower
    });
    const secondaryAction = resolveSecondaryStatusAction({
      status: session.status,
      isLender,
      isBorrower
    });

    return {
      ...session,
      peerName: peerName || '聊天对象',
      peerUserId,
      peerInitial,
      itemTitleShort,
      statusBadgeText: statusBadge.text,
      statusBadgeClass: statusBadge.className,
      stageSteps: buildOrderSteps(session.status),
      canChangeStatus: Boolean(primaryAction),
      statusActionText: primaryAction ? primaryAction.text : '',
      statusActionType: primaryAction ? primaryAction.action : '',
      statusActionClass: primaryAction ? primaryAction.className : '',
      canSecondaryAction: Boolean(secondaryAction),
      secondaryStatusActionText: secondaryAction ? secondaryAction.text : '',
      secondaryStatusActionType: secondaryAction ? secondaryAction.action : '',
      secondaryStatusActionClass: secondaryAction ? secondaryAction.className : '',
      secondaryStatusNeedsReason: secondaryAction ? Boolean(secondaryAction.needsReason) : false
    };
  },

  setScrollIntoView(messageId) {
    if (!messageId) {
      return;
    }
    const anchor = `msg-${messageId}`;
    if (this.data.scrollIntoView === anchor) {
      this.safeSetData({ scrollIntoView: '' }, { allowHidden: true });
      setTimeout(() => {
        this.safeSetData({ scrollIntoView: anchor }, { allowHidden: true });
      }, 0);
      return;
    }
    this.safeSetData({ scrollIntoView: anchor }, { allowHidden: true });
  },

  appendNewMessages(rawMessages, options = {}) {
    const { scrollToBottom = false } = options;
    const mapped = this.mapMessages(rawMessages || []);
    if (!mapped.length) {
      return false;
    }

    const currentList = this.data.messageList || [];
    const idSet = new Set(currentList.map((item) => Number(item.id)));
    const added = mapped.filter((item) => !idSet.has(Number(item.id)));
    if (!added.length) {
      return false;
    }

    const nextList = currentList.concat(added).sort((a, b) => Number(a.id) - Number(b.id));
    const lastMessage = nextList[nextList.length - 1];
    this.safeSetData({
      messageList: nextList
    });
    if (scrollToBottom && lastMessage) {
      this.setScrollIntoView(lastMessage.id);
    }
    this.markSessionRead(nextList);
    return true;
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
        getChatMessages(sessionId, { limit: HISTORY_PAGE_SIZE })
      ]);

      const session = sessionResp.session;
      if (!session) {
        this.safeSetData({ session: null, loading: false });
        return;
      }

      const mappedMessages = this.mapMessages(messageResp.messages || []);
      const lastMessage = mappedMessages[mappedMessages.length - 1];
      this.safeSetData({
        session: this.buildSessionView(session),
        messageList: mappedMessages,
        hasMoreHistory: Boolean(messageResp.hasMore),
        loading: false
      });
      if (lastMessage) {
        this.setScrollIntoView(lastMessage.id);
      }
      await this.markSessionRead(mappedMessages);
    } catch (err) {
      if (consumeAuthExpired(err, {
        onClear: () => {
          this.stopPolling();
          this.safeSetData({
            loading: false,
            currentUser: null,
            session: null,
            messageList: []
          });
        }
      })) {
        return;
      }
      this.safeSetData({ loading: false });
      if (this.isPageVisible) {
        wx.showToast({ title: '聊天数据加载失败', icon: 'none' });
      }
    }
  },

  async fetchLatestMessages() {
    const { sessionId, session, messageList } = this.data;
    if (!sessionId || !session) {
      return;
    }

    const lastMessage = (messageList || [])[messageList.length - 1];
    const lastMessageId = lastMessage ? Number(lastMessage.id) : 0;

    try {
      const [sessionResp, messageResp] = await Promise.all([
        getChatSession(sessionId),
        getChatMessages(sessionId, {
          afterId: lastMessageId > 0 ? lastMessageId : undefined,
          limit: 80
        })
      ]);

      if (sessionResp.session) {
        this.safeSetData({
          session: this.buildSessionView(sessionResp.session)
        });
      }

      const hasNew = this.appendNewMessages(messageResp.messages || [], { scrollToBottom: true });
      if (!hasNew && sessionResp.session) {
        await this.markSessionRead(this.data.messageList || []);
      }
    } catch (err) {
      consumeAuthExpired(err, {
        showToast: false,
        redirect: false,
        onClear: () => {
          this.stopPolling();
        }
      });
    }
  },

  async loadMoreHistory() {
    const { sessionId, loadingHistory, hasMoreHistory, messageList } = this.data;
    if (!sessionId || loadingHistory || !hasMoreHistory) {
      return;
    }
    const firstMessage = (messageList || [])[0];
    if (!firstMessage) {
      return;
    }

    this.safeSetData({ loadingHistory: true });
    try {
      const resp = await getChatMessages(sessionId, {
        beforeId: firstMessage.id,
        limit: HISTORY_PAGE_SIZE
      });
      const historyMessages = this.mapMessages(resp.messages || []);
      if (!historyMessages.length) {
        this.safeSetData({
          hasMoreHistory: false,
          loadingHistory: false
        });
        return;
      }

      const idSet = new Set((messageList || []).map((item) => Number(item.id)));
      const prepend = historyMessages.filter((item) => !idSet.has(Number(item.id)));
      const nextList = prepend.concat(messageList || []).sort((a, b) => Number(a.id) - Number(b.id));
      this.safeSetData({
        messageList: nextList,
        hasMoreHistory: Boolean(resp.hasMore),
        loadingHistory: false
      });
      this.setScrollIntoView(firstMessage.id);
    } catch (err) {
      this.safeSetData({ loadingHistory: false });
      if (this.isPageVisible) {
        wx.showToast({ title: '历史消息加载失败', icon: 'none' });
      }
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

  handleInputBlur() {
    this.safeSetData({
      keyboardHeight: 0
    }, { allowHidden: true });
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
      const resp = await sendChatMessage({
        sessionId,
        text
      });
      this.safeSetData({ messageText: '' });
      if (resp && resp.message) {
        this.appendNewMessages([resp.message], { scrollToBottom: true });
      } else {
        await this.fetchLatestMessages();
      }
    } catch (err) {
      if (consumeAuthExpired(err)) {
        return;
      }
      if (this.isPageVisible) {
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    }
  },

  async onStatusActionTap() {
    const session = this.data.session;
    if (!session || !session.canChangeStatus || !session.statusActionType) {
      return;
    }
    await this.handleStatusAction(session.statusActionType);
  },

  async onSecondaryStatusActionTap() {
    const session = this.data.session;
    if (!session || !session.canSecondaryAction || !session.secondaryStatusActionType) {
      return;
    }
    await this.handleStatusAction(session.secondaryStatusActionType);
  },

  promptReason(title, placeholder) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        editable: true,
        placeholderText: placeholder,
        success: (res) => {
          if (!res.confirm) {
            resolve('');
            return;
          }
          resolve(String(res.content || '').trim());
        },
        fail: () => resolve('')
      });
    });
  },

  async handleStatusAction(action) {
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

    if (action === 'reject_borrow') {
      const reason = await this.promptReason('拒绝借用', '请输入拒绝原因');
      if (!reason) {
        return;
      }
      this.commitStatusAction(action, '已拒绝借用', { reason });
      return;
    }

    if (action === 'reject_return') {
      const reason = await this.promptReason('退回归还确认', '请输入退回原因');
      if (!reason) {
        return;
      }
      this.commitStatusAction(action, '已退回归还确认', { reason });
      return;
    }

    if (action === 'cancel_borrow') {
      const reason = await this.promptReason('取消借用', '请输入取消原因');
      if (!reason) {
        return;
      }
      this.commitStatusAction(action, '已取消借用', { reason });
      return;
    }

    this.commitStatusAction(action, '状态已更新');
  },

  async commitStatusAction(action, successText, options = {}) {
    try {
      await runChatSessionAction({
        sessionId: this.data.sessionId,
        action,
        reason: options.reason || ''
      });
      await this.fetchLatestMessages();
      wx.showToast({ title: successText, icon: 'success' });
      if (options.toRating) {
        setTimeout(() => {
          this.openRatingPage();
        }, 250);
      }
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (consumeAuthExpired(err)) {
        return;
      }
      if (msg.includes('missing_action_reason')) {
        wx.showToast({ title: '请填写操作原因', icon: 'none' });
        return;
      }
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

  openPeerProfile() {
    const session = this.data.session;
    if (!session || !session.peerUserId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/member-profile/member-profile?userId=${encodeURIComponent(String(session.peerUserId))}`
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
