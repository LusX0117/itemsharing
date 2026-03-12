const { getCurrentUser } = require('../../utils/db');
const { getChatSession, startChatSession } = require('../../utils/chat-api');
const { getHomePosts } = require('../../utils/post-api');

const toArray = (value) => (Array.isArray(value) ? value : []);

const dedupeUrls = (list) => {
  const seen = new Set();
  const out = [];
  toArray(list).forEach((url) => {
    const key = String(url || '').trim();
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(key);
  });
  return out;
};

Page({
  data: {
    sessionId: '',
    itemId: 0,
    currentUser: null,
    session: null,
    loading: true
  },

  onLoad(options) {
    this.setData({
      sessionId: String((options && options.sessionId) || ''),
      itemId: Number((options && options.itemId) || 0)
    });
  },

  async onShow() {
    this.setData({
      currentUser: getCurrentUser()
    });
    await this.refreshAll();
  },

  buildSessionView(session, itemInfo) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const isLender = userId && userId === String(session.lenderUserId);
    const chatEntryText = isLender ? '我要借出' : '申请借用';

    const descriptionByPost = String((itemInfo && itemInfo.description) || '').trim();
    const fallbackDescription = `当前状态：${String(session.status || '待处理')}。请在聊天中沟通借还细节。`;
    const itemDescription = descriptionByPost || fallbackDescription;

    const postPhotos = toArray(itemInfo && itemInfo.photos);
    const displayImages = dedupeUrls(postPhotos);

    return {
      ...session,
      itemDescription,
      displayImages,
      chatEntryText
    };
  },

  findItemFromHome(session, homeResp) {
    const targetId = Number(session.itemId || 0);
    const items = toArray(homeResp && homeResp.items);
    if (!targetId || !items.length) {
      return null;
    }
    return items.find((item) => Number(item.id) === targetId) || null;
  },

  findItemById(homeResp, itemId) {
    const targetId = Number(itemId || 0);
    const items = toArray(homeResp && homeResp.items);
    if (!targetId || !items.length) {
      return null;
    }
    return items.find((item) => Number(item.id) === targetId) || null;
  },

  buildViewFromItem(item) {
    const currentUser = this.data.currentUser || getCurrentUser() || null;
    const userId = currentUser ? String(currentUser.id) : '';
    const ownerUserId = String(item.ownerUserId || '');
    const isOwner = userId && ownerUserId && userId === ownerUserId;
    const chatEntryText = isOwner ? '我要借出' : '申请借用';
    const itemDescription = String(item.description || '').trim()
      || '发布者暂未填写描述，请在聊天中沟通借还细节。';
    const displayImages = dedupeUrls(toArray(item.photos));

    return {
      itemId: Number(item.id),
      itemTitle: String(item.title || ''),
      itemDescription,
      displayImages,
      chatEntryText,
      ownerUserId,
      ownerName: String(item.owner || ''),
      status: String(item.status || '可借')
    };
  },

  async refreshAll() {
    const sid = String(this.data.sessionId || '');
    const itemId = Number(this.data.itemId || 0);
    if (!sid && !itemId) {
      this.setData({
        loading: false,
        session: null
      });
      return;
    }

    try {
      const homeResp = await getHomePosts().catch(() => ({ items: [] }));

      if (sid) {
        const sessionResp = await getChatSession(sid);
        const session = sessionResp && sessionResp.session;
        if (!session) {
          this.setData({
            loading: false,
            session: null
          });
          return;
        }

        const itemInfo = this.findItemFromHome(session, homeResp);
        this.setData({
          loading: false,
          session: this.buildSessionView(session, itemInfo)
        });
        return;
      }

      const itemInfo = this.findItemById(homeResp, itemId);
      if (!itemInfo) {
        this.setData({
          loading: false,
          session: null
        });
        return;
      }

      this.setData({
        loading: false,
        session: this.buildViewFromItem(itemInfo)
      });
    } catch (err) {
      this.setData({
        loading: false,
        session: null
      });
      wx.showToast({ title: '物品详情加载失败', icon: 'none' });
    }
  },

  previewItemImage(event) {
    const current = String((event.currentTarget.dataset && event.currentTarget.dataset.url) || '');
    const session = this.data.session;
    const urls = toArray(session && session.displayImages);
    if (!current || !urls.length) {
      return;
    }
    wx.previewImage({
      current,
      urls
    });
  },

  async goChatPage() {
    const sid = encodeURIComponent(String(this.data.sessionId || ''));
    if (sid) {
      wx.redirectTo({
        url: `/pages/chat/chat?sessionId=${sid}`
      });
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const item = this.data.session || {};
    const ownerUserId = String(item.ownerUserId || '');
    if (ownerUserId && ownerUserId === String(currentUser.id)) {
      wx.switchTab({
        url: '/pages/messages/messages'
      });
      return;
    }

    if (!item.itemId || !ownerUserId) {
      wx.showToast({ title: '物品信息不完整', icon: 'none' });
      return;
    }

    try {
      const resp = await startChatSession({
        itemId: Number(item.itemId),
        itemTitle: String(item.itemTitle || ''),
        lenderUserId: ownerUserId,
        lenderName: String(item.ownerName || '发布者'),
        borrowerUserId: String(currentUser.id),
        borrowerName: String(currentUser.nickname || '用户')
      });
      const session = resp.session || {};
      if (!session.id) {
        throw new Error('session_create_failed');
      }
      wx.navigateTo({
        url: `/pages/chat/chat?sessionId=${session.id}`
      });
    } catch (err) {
      wx.showToast({ title: '进入聊天失败', icon: 'none' });
    }
  }
});
