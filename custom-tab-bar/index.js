Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '主页'
      },
      {
        pagePath: '/pages/search/search',
        text: '搜索'
      },
      {
        pagePath: '/pages/publish/publish',
        text: '发布'
      },
      {
        pagePath: '/pages/messages/messages',
        text: '信息'
      },
      {
        pagePath: '/pages/me/me',
        text: '我的'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelected();
    }
  },

  methods: {
    setSelected(index) {
      const nextSelected = Number(index);
      if (!Number.isInteger(nextSelected) || nextSelected < 0) {
        return;
      }
      if (nextSelected === this.data.selected) {
        return;
      }
      this.setData({
        selected: nextSelected
      });
    },

    updateSelected() {
      const pages = getCurrentPages();
      if (!pages.length) {
        return;
      }
      const current = `/${pages[pages.length - 1].route}`;
      const nextSelected = this.data.list.findIndex((item) => item.pagePath === current);
      if (nextSelected >= 0 && nextSelected !== this.data.selected) {
        this.setSelected(nextSelected);
      }
    }
  }
});
