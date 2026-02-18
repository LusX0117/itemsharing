const { setCurrentUser, clearLegacyAuthStorage } = require('../../utils/db');
const { registerByServer, loginByServer } = require('../../utils/auth-api');

Page({
  data: {
    mode: 'login',
    form: {
      phone: '',
      password: '',
      nickname: ''
    }
  },

  onLoad() {
    clearLegacyAuthStorage();
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) {
      return;
    }
    this.setData({
      mode,
      form: {
        phone: '',
        password: '',
        nickname: ''
      }
    });
  },

  handleInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  submit() {
    if (this.data.mode === 'login') {
      this.login();
      return;
    }
    this.register();
  },

  validateBaseForm() {
    const { phone, password } = this.data.form;
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return false;
    }
    if (String(password).length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return false;
    }
    return true;
  },

  async register() {
    if (!this.validateBaseForm()) {
      return;
    }

    const { phone, password, nickname } = this.data.form;
    const finalNickname = nickname.trim();
    if (!finalNickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    try {
      const resp = await registerByServer({
        phone,
        password,
        nickname: finalNickname
      });
      const user = resp.user;
      if (!user || !user.id) {
        throw new Error('invalid_user_data');
      }

      setCurrentUser({
        id: String(user.id),
        phone: user.phone,
        nickname: user.nickname,
        isAdmin: Boolean(user.isAdmin)
      });

      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 400);
    } catch (err) {
      const text = String((err && err.message) || '');
      if (text.includes('phone_already_registered')) {
        wx.showToast({ title: '手机号已注册', icon: 'none' });
        return;
      }
      wx.showToast({ title: '注册失败', icon: 'none' });
    }
  },

  async login() {
    if (!this.validateBaseForm()) {
      return;
    }

    const { phone, password } = this.data.form;
    try {
      const resp = await loginByServer({
        phone,
        password
      });
      const user = resp.user;
      if (!user || !user.id) {
        throw new Error('invalid_user_data');
      }

      setCurrentUser({
        id: String(user.id),
        phone: user.phone,
        nickname: user.nickname,
        isAdmin: Boolean(user.isAdmin)
      });

      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 400);
    } catch (err) {
      const text = String((err && err.message) || '');
      if (text.includes('invalid_credentials')) {
        wx.showToast({ title: '账号或密码错误', icon: 'none' });
        return;
      }
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  }
});
