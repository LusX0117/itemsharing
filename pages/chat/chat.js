const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  getChatMessages,
  sendChatMessage,
  updateChatSessionPhotos,
  updateChatSessionStatus
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

Page({
  data: {
    sessionId: '',
    session: null,
    messageText: '',
    compareRows: [],
    lastMessageAnchor: ''
  },

  pollTimer: null,
  lastMessageId: 0,

  onLoad(options) {
    this.setData({
      sessionId: options.sessionId || ''
    });
  },

  async onShow() {
    await this.refreshAll();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
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
    return (messages || []).map((message) => ({
      ...message,
      sender: message.senderUserId === 'system' ? 'system' : 'user',
      mine: String(message.senderUserId) === String((getCurrentUser() || {}).id),
      timeText: formatDateTime(message.time)
    }));
  },

  applySessionAndMessages(session, mappedMessages) {
    const beforePhotos = session.beforePhotos || [];
    const afterPhotos = session.afterPhotos || [];
    const lastMessage = mappedMessages[mappedMessages.length - 1];
    this.lastMessageId = lastMessage ? Number(lastMessage.id) : 0;

    this.setData({
      session: {
        ...session,
        beforePhotos,
        afterPhotos,
        messages: mappedMessages
      },
      compareRows: buildCompareRows(beforePhotos, afterPhotos),
      lastMessageAnchor: lastMessage ? `msg-${lastMessage.id}` : ''
    });
  },

  async refreshAll() {
    const { sessionId } = this.data;
    if (!sessionId) {
      return;
    }

    try {
      const [sessionResp, messageResp] = await Promise.all([
        getChatSession(sessionId),
        getChatMessages(sessionId)
      ]);

      const session = sessionResp.session;
      if (!session) {
        this.setData({ session: null });
        return;
      }

      const mappedMessages = this.mapMessages(messageResp.messages || []);
      this.applySessionAndMessages(session, mappedMessages);
    } catch (err) {
      this.setData({ session: null });
      wx.showToast({ title: '聊天服务不可用', icon: 'none' });
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
        getChatMessages(sessionId, this.lastMessageId || undefined)
      ]);

      const latestSession = sessionResp.session;
      if (!latestSession) {
        return;
      }

      const incremental = this.mapMessages(messageResp.messages || []);
      const currentMessages = session.messages || [];
      let mergedMessages = currentMessages;
      if (incremental.length) {
        const map = {};
        currentMessages.forEach((msg) => {
          map[String(msg.id)] = msg;
        });
        incremental.forEach((msg) => {
          map[String(msg.id)] = msg;
        });
        mergedMessages = Object.values(map).sort((a, b) => Number(a.id) - Number(b.id));
      }
      this.applySessionAndMessages(latestSession, mergedMessages);
    } catch (err) {
      // polling failure should be silent to avoid toast spam
    }
  },

  handleMessageInput(event) {
    this.setData({
      messageText: event.detail.value
    });
  },

  async sendMessage() {
    const text = this.data.messageText.trim();
    if (!text) {
      return;
    }

    const currentUser = getCurrentUser();
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
      this.setData({ messageText: '' });
      await this.fetchLatestMessages();
    } catch (err) {
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
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
          wx.showToast({ title: '照片保存失败', icon: 'none' });
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
  },

  async markCompleted() {
    const session = this.data.session;
    if (!session) {
      return;
    }

    if (!(session.beforePhotos || []).length || !(session.afterPhotos || []).length) {
      wx.showToast({ title: '请先补充借前和归还后照片', icon: 'none' });
      return;
    }

    try {
      await updateChatSessionStatus({
        sessionId: this.data.sessionId,
        status: '已完成'
      });

      const currentUser = getCurrentUser();
      if (currentUser) {
        await sendChatMessage({
          sessionId: this.data.sessionId,
          senderUserId: 'system',
          senderName: '系统',
          text: `${currentUser.nickname} 将该借用单标记为已完成。`
        });
      }
      await this.refreshAll();
      wx.showToast({ title: '已标记完成', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  }
});
