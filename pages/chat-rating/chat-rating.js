const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  rateChatSession
} = require('../../utils/chat-api');

const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

Page({
  data: {
    sessionId: '',
    currentUser: null,
    session: null,
    ratingSummary: null,
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

  buildSessionView(session, summary) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
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
    const ratings = (summary.ratings || []).map((item) => {
      const raterUserId = String(item.raterUserId || '');
      let raterLabel = `用户 ${raterUserId.slice(0, 6) || '-'}`;
      if (raterUserId === String(session.lenderUserId)) {
        raterLabel = '出借者';
      } else if (raterUserId === String(session.borrowerUserId)) {
        raterLabel = '借用者';
      }
      if (raterUserId === userId) {
        raterLabel = `${raterLabel}（我）`;
      }
      return {
        ...item,
        raterLabel,
        createdAtText: formatDateTime(item.createdAt)
      };
    });

    return {
      ...session,
      targetUserId,
      targetName: targetName || '聊天对象',
      targetCreditText,
      myRating,
      myRatingText,
      canRate,
      ratings
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
      const summary = resp.ratingSummary || { myRating: null, byTarget: {}, ratings: [] };
      if (!session) {
        this.setData({ session: null, loading: false });
        return;
      }
      this.setData({
        session: this.buildSessionView(session, summary),
        ratingSummary: summary,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '评价信息加载失败', icon: 'none' });
    }
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
      const summary = resp.ratingSummary || this.data.ratingSummary || { myRating: null, byTarget: {}, ratings: [] };
      this.setData({
        ratingSummary: summary,
        session: this.buildSessionView(session, summary)
      });
      wx.showToast({ title: '评价已提交', icon: 'success' });
    } catch (err) {
      const text = String((err && err.message) || '');
      if (text.includes('session_not_finished')) {
        wx.showToast({ title: '仅已完成借还可评价', icon: 'none' });
        return;
      }
      wx.showToast({ title: '评价提交失败', icon: 'none' });
    }
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
