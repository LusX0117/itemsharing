const { getCurrentUser } = require('../../utils/db');
const {
  getChatSession,
  rateChatSession
} = require('../../utils/chat-api');

const STAR_OPTIONS = [1, 2, 3, 4, 5];

const resolveStatusMeta = (status) => {
  if (String(status) === '已完成') {
    return {
      text: '已归还',
      className: 'returned'
    };
  }
  return {
    text: String(status || '待处理'),
    className: 'pending'
  };
};

Page({
  data: {
    sessionId: '',
    currentUser: null,
    session: null,
    ratingSummary: null,
    starOptions: STAR_OPTIONS,
    ratingScore: 0,
    reviewText: '',
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
    const myRatingText = myRating ? `${myRating.score} 星` : '';
    const statusMeta = resolveStatusMeta(session.status);

    return {
      ...session,
      itemTitleShort: String(session.itemTitle || '').slice(0, 4) || '物品',
      targetUserId,
      targetName: targetName || '聊天对象',
      targetCreditText,
      myRating,
      myRatingText,
      canRate,
      statusText: statusMeta.text,
      statusClassName: statusMeta.className,
      submitButtonText: canRate ? '提交评价' : '已评价'
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
      const sessionView = this.buildSessionView(session, summary);
      const myRating = sessionView.myRating || null;
      const presetScore = myRating ? Number(myRating.score || 0) : 0;
      const presetComment = myRating ? String(myRating.comment || '') : '';
      this.setData({
        session: sessionView,
        ratingSummary: summary,
        ratingScore: presetScore,
        reviewText: presetComment,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '评价信息加载失败', icon: 'none' });
    }
  },

  selectScore(event) {
    const score = Number(event.currentTarget.dataset.score || 0);
    const session = this.data.session;
    if (!session || !session.canRate) {
      return;
    }
    this.setData({
      ratingScore: score
    });
  },

  handleReviewInput(event) {
    const session = this.data.session;
    if (!session || !session.canRate) {
      return;
    }
    this.setData({
      reviewText: String(event.detail.value || '')
    });
  },

  async submitRating() {
    const session = this.data.session;
    const currentUser = this.data.currentUser || getCurrentUser();
    if (!session || !currentUser || !session.canRate) {
      wx.showToast({ title: '当前不可评价', icon: 'none' });
      return;
    }

    const score = Number(this.data.ratingScore || 0);
    const comment = String(this.data.reviewText || '').trim();
    if (!score || score < 1 || score > 5) {
      wx.showToast({ title: '请先选择星级', icon: 'none' });
      return;
    }

    try {
      const resp = await rateChatSession({
        sessionId: this.data.sessionId,
        score,
        comment
      });
      const summary = resp.ratingSummary || this.data.ratingSummary || { myRating: null, byTarget: {}, ratings: [] };
      const nextSession = this.buildSessionView(session, summary);
      const nextMyRating = nextSession.myRating || null;
      this.setData({
        ratingSummary: summary,
        session: nextSession,
        ratingScore: nextMyRating ? Number(nextMyRating.score || 0) : score,
        reviewText: nextMyRating ? String(nextMyRating.comment || '') : comment
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
