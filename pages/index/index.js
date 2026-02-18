const categoryOptions = ['全部', '教材', '电子产品', '运动器材', '生活用品', '其他'];

const seedItems = [
  {
    id: 1,
    title: '高等数学（同济版）第七版',
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
    category: '生活用品',
    owner: '外国语学院 · 张同学',
    price: 4,
    deposit: 15,
    location: '南苑5栋',
    description: 'USB接口，支持三档风速。',
    status: '可借'
  }
];

Page({
  data: {
    campusName: '星河大学',
    searchKeyword: '',
    categoryOptions,
    publishCategoryOptions: categoryOptions.filter((item) => item !== '全部'),
    activeCategory: '全部',
    items: seedItems,
    filteredItems: seedItems,
    demandList: [
      {
        id: 'd1',
        title: '求借：英语演讲比赛正装',
        publisher: '新闻学院 · 赵同学',
        reward: '可提供20元感谢费'
      },
      {
        id: 'd2',
        title: '求借：单反相机一天',
        publisher: '艺术学院 · 周同学',
        reward: '可交换PS修图服务'
      }
    ],
    showPublishPanel: false,
    draftItem: {
      title: '',
      category: '教材',
      price: '',
      deposit: '',
      location: '',
      description: ''
    }
  },

  noop() {},

  onLoad() {
    this.updateStats();
  },

  handleKeywordInput(event) {
    this.setData({
      searchKeyword: event.detail.value
    });
    this.filterItems();
  },

  selectCategory(event) {
    const category = event.currentTarget.dataset.category;
    this.setData({
      activeCategory: category
    });
    this.filterItems();
  },

  filterItems() {
    const { items, searchKeyword, activeCategory } = this.data;
    const keyword = searchKeyword.trim().toLowerCase();

    const filteredItems = items.filter((item) => {
      const matchesCategory = activeCategory === '全部' || item.category === activeCategory;
      const matchesKeyword =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.location.toLowerCase().includes(keyword);

      return matchesCategory && matchesKeyword;
    });

    this.setData({ filteredItems });
  },

  openPublishPanel() {
    this.setData({ showPublishPanel: true });
  },

  closePublishPanel() {
    this.setData({ showPublishPanel: false });
  },

  handleDraftInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`draftItem.${field}`]: event.detail.value
    });
  },

  chooseDraftCategory(event) {
    const category = this.data.publishCategoryOptions[event.detail.value] || '教材';
    this.setData({
      'draftItem.category': category
    });
  },

  publishItem() {
    const { draftItem, items } = this.data;
    const requiredFields = ['title', 'price', 'deposit', 'location'];
    const emptyField = requiredFields.find((field) => !String(draftItem[field]).trim());

    if (emptyField) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    const nextItem = {
      id: Date.now(),
      title: draftItem.title.trim(),
      category: draftItem.category,
      owner: '我 · 当前用户',
      price: Number(draftItem.price) || 0,
      deposit: Number(draftItem.deposit) || 0,
      location: draftItem.location.trim(),
      description: draftItem.description.trim() || '暂无描述',
      status: '新发布'
    };

    const newItems = [nextItem, ...items];

    this.setData({
      items: newItems,
      draftItem: {
        title: '',
        category: '教材',
        price: '',
        deposit: '',
        location: '',
        description: ''
      },
      showPublishPanel: false
    });

    this.filterItems();
    this.updateStats();
    wx.showToast({ title: '发布成功', icon: 'success' });
  },

  updateStats() {
    const itemCount = this.data.items.length;
    const demandCount = this.data.demandList.length;

    this.setData({
      stats: [
        { label: '在架共享物品', value: itemCount },
        { label: '今日求借需求', value: demandCount },
        { label: '本周成功匹配', value: 32 }
      ]
    });
  }
});
