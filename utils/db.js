const DB_KEYS = {
  CURRENT_USER: 'db_current_user',
  ITEMS: 'db_items',
  DEMANDS: 'db_demands'
};

const LEGACY_AUTH_KEYS = ['db_users', 'users'];

const seedItems = [
  {
    id: 1,
    title: '高等数学（同济版）第七版',
    ownerUserId: 'seed_lender_1',
    category: '教材',
    owner: '计算机学院 · 李同学',
    price: 8,
    deposit: 20,
    location: '图书馆一楼自习区',
    description: '有少量笔记，适合备考同学短借。',
    status: '可借'
  },
  {
    id: 2,
    title: '小米充电宝 20000mAh',
    ownerUserId: 'seed_lender_2',
    category: '电子产品',
    owner: '经管学院 · 王同学',
    price: 5,
    deposit: 30,
    location: '一食堂门口',
    description: '支持快充，含双线，日租。',
    status: '可借'
  },
  {
    id: 3,
    title: '羽毛球拍（双拍）',
    ownerUserId: 'seed_lender_3',
    category: '运动器材',
    owner: '体育学院 · 陈同学',
    price: 6,
    deposit: 25,
    location: '体育馆前台',
    description: '含3个羽毛球，晚间可面交。',
    status: '热门'
  },
  {
    id: 4,
    title: '宿舍小电扇',
    ownerUserId: 'seed_lender_4',
    category: '生活用品',
    owner: '外国语学院 · 张同学',
    price: 4,
    deposit: 15,
    location: '南苑5栋',
    description: 'USB接口，支持三档风速。',
    status: '可借'
  }
];

const seedDemands = [
  {
    id: 'd1',
    title: '求借：英语演讲比赛正装',
    publisher: '新闻学院 · 赵同学',
    category: '其他',
    location: '教学楼A区',
    budget: 20,
    reward: '可提供20元感谢费',
    description: '本周五晚使用一次，注意尺寸M。',
    status: '求借中',
    createdAt: Date.now() - 86400000
  },
  {
    id: 'd2',
    title: '求借：单反相机一天',
    publisher: '艺术学院 · 周同学',
    category: '电子产品',
    location: '艺术楼',
    budget: 60,
    reward: '可交换PS修图服务',
    description: '周末外拍使用，器材会妥善保管。',
    status: '求借中',
    createdAt: Date.now() - 43200000
  }
];

const deepClone = (data) => JSON.parse(JSON.stringify(data));

const inferOwnerUserId = (item) => {
  if (item.ownerUserId) {
    return String(item.ownerUserId);
  }
  const owner = String(item.owner || '');
  if (owner.includes('李同学')) return 'seed_lender_1';
  if (owner.includes('王同学')) return 'seed_lender_2';
  if (owner.includes('陈同学')) return 'seed_lender_3';
  if (owner.includes('张同学')) return 'seed_lender_4';
  return '';
};

const ensureListTable = (key, seed = []) => {
  const cached = wx.getStorageSync(key);
  if (Array.isArray(cached)) {
    return deepClone(cached);
  }
  wx.setStorageSync(key, deepClone(seed));
  return deepClone(seed);
};

const clearLegacyAuthStorage = () => {
  LEGACY_AUTH_KEYS.forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch (err) {
      // ignore
    }
  });
};

const getCurrentUser = () => {
  const user = wx.getStorageSync(DB_KEYS.CURRENT_USER);
  return user ? deepClone(user) : null;
};
const setCurrentUser = (user) => wx.setStorageSync(DB_KEYS.CURRENT_USER, deepClone(user));
const clearCurrentUser = () => wx.removeStorageSync(DB_KEYS.CURRENT_USER);

const getItems = () => {
  const items = ensureListTable(DB_KEYS.ITEMS, seedItems);
  let changed = false;
  const normalized = items.map((item) => {
    const ownerUserId = inferOwnerUserId(item);
    if (ownerUserId && String(item.ownerUserId || '') !== ownerUserId) {
      changed = true;
      return {
        ...item,
        ownerUserId
      };
    }
    return item;
  });

  if (changed) {
    wx.setStorageSync(DB_KEYS.ITEMS, deepClone(normalized));
    return deepClone(normalized);
  }
  return items;
};
const saveItems = (items) => wx.setStorageSync(DB_KEYS.ITEMS, deepClone(items || []));

const getDemands = () => ensureListTable(DB_KEYS.DEMANDS, seedDemands);
const saveDemands = (demands) => wx.setStorageSync(DB_KEYS.DEMANDS, deepClone(demands || []));

module.exports = {
  DB_KEYS,
  clearLegacyAuthStorage,
  getCurrentUser,
  setCurrentUser,
  clearCurrentUser,
  getItems,
  saveItems,
  getDemands,
  saveDemands
};
