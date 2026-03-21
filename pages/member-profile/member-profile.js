const { getCurrentUser } = require('../../utils/db');
const { getUserProfile } = require('../../utils/user-api');
const { consumeAuthExpired } = require('../../utils/auth-guard');

const formatDateText = (timestamp) => {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toFixedScore = (value) => {
  const score = Number(value || 0);
  if (!score) {
    return '--';
  }
  return score.toFixed(1);
};

const buildScoreStars = (score) => {
  const n = Math.max(1, Math.min(5, Number(score || 0)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
};

Page({
  data: {
    currentUser: null,
    targetUserId: '',
    loading: true,
    profile: null
  },

  onLoad(options) {
    this.setData({
      targetUserId: String((options && options.userId) || '')
    });
  },

  async onShow() {
    const currentUser = getCurrentUser();
    this.setData({ currentUser });
    await this.loadProfile();
  },

  buildProfileView(rawProfile) {
    const currentUser = this.data.currentUser;
    const meId = currentUser ? String(currentUser.id || '') : '';
    const profileUserId = String(rawProfile.userId || '');
    const isSelf = meId && profileUserId && meId === profileUserId;
    const nickname = String(rawProfile.nickname || '校园用户');
    const avatarText = nickname ? nickname.slice(0, 1) : '友';
    const scoreText = toFixedScore(rawProfile.averageScore);
    const ratingCount = Number(rawProfile.ratingCount || 0);
    const recentRatings = (rawProfile.recentRatings || []).map((item) => ({
      id: Number(item.id || 0),
      score: Number(item.score || 0),
      scoreStars: buildScoreStars(item.score),
      comment: String(item.comment || ''),
      createdAtText: formatDateText(item.createdAt),
      raterName: String(item.raterName || '匿名用户')
    }));

    return {
      ...rawProfile,
      isSelf,
      avatarText,
      nickname,
      phoneText: isSelf ? `手机号：${String(rawProfile.phone || '')}` : '校内实名用户',
      scoreText,
      ratingCountText: String(ratingCount),
      completedAsLenderText: String(Number(rawProfile.completedAsLender || 0)),
      completedAsBorrowerText: String(Number(rawProfile.completedAsBorrower || 0)),
      completedCountText: String(Number(rawProfile.completedCount || 0)),
      activeSessionCountText: String(Number(rawProfile.activeSessionCount || 0)),
      recentRatings
    };
  },

  async loadProfile() {
    const currentUser = this.data.currentUser;
    if (!currentUser) {
      this.setData({
        loading: false,
        profile: null
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const resp = await getUserProfile(this.data.targetUserId);
      const profile = resp && resp.profile ? this.buildProfileView(resp.profile) : null;
      this.setData({
        loading: false,
        profile
      });
    } catch (err) {
      if (consumeAuthExpired(err, {
        onClear: () => {
          this.setData({
            currentUser: null,
            loading: false,
            profile: null
          });
        }
      })) {
        return;
      }
      this.setData({
        loading: false,
        profile: null
      });
      wx.showToast({ title: '信用信息加载失败', icon: 'none' });
    }
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({
      url: '/pages/me/me'
    });
  }
});
