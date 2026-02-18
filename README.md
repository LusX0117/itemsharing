# 校园物品共享平台（微信小程序）

当前版本包含：

- 物品列表、求借列表
- 出借发布 / 求借发布
- 登录注册
- 账号与密码保存在服务端（Supabase PostgreSQL `users` 表）
- 用户可在“我的”页面管理自己发布的帖子（修改标题、切换状态、暂时隐藏/恢复）
- 管理员账号可管理全站帖子（修改/暂时隐藏/恢复）
- 双方真实聊天（无自动回复）
- 聊天会话与消息使用 Supabase PostgreSQL 持久化

## 聊天与认证服务（必须启动）

服务端通过 **Supabase API Keys**（`SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY`）访问数据库，不再使用数据库直连字符串。

### 1. 先在 Supabase 建表

在 Supabase SQL Editor 执行：`server/schema.sql`

### 2. 配置环境变量

复制 `server/.env.example` 为 `server/.env`，填写你的 service role key：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3007
ADMIN_PHONE=19900000000
ADMIN_PASSWORD=admin123
ADMIN_NICKNAME=系统管理员
```

说明：`SUPABASE_SERVICE_ROLE_KEY` 只能放服务端，不能放小程序端。

### 3. 启动服务

```bash
cd server
npm install
npm start
```

默认地址：`http://127.0.0.1:3007`

## 部署到 Render

### 1. 推送代码到 GitHub

确保仓库包含：

- `server/index.js`
- `server/package.json`
- `server/schema.sql`
- `render.yaml`

### 2. 在 Render 创建 Web Service

可选两种方式：

- Blueprint（推荐）：Render 里选择 `New +` -> `Blueprint`，连接你的仓库，会自动读取 `render.yaml`
- 手动创建：`New +` -> `Web Service`，并设置：
  - Root Directory: `server`
  - Build Command: `npm install`
  - Start Command: `npm start`

### 3. 配置环境变量（Render Dashboard）

必须配置：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

可选配置（管理员账号）：

- `ADMIN_PHONE`
- `ADMIN_PASSWORD`
- `ADMIN_NICKNAME`

注意：后端必须使用 `SUPABASE_SERVICE_ROLE_KEY`，不要用 `SUPABASE_ANON_KEY`。

### 4. 数据库建表

部署前后都可以，在 Supabase SQL Editor 执行 `server/schema.sql`。

### 5. 验证服务

部署成功后访问：

`https://你的-render-域名/api/health`

返回 `{\"ok\": true}` 说明后端在线。

## 小程序端说明

- 聊天 API：`utils/chat-api.js`
- 认证 API：`utils/auth-api.js`
- 帖子 API：`utils/post-api.js`
- 如果在微信开发者工具里请求被拦截，请在项目设置里关闭“校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书”用于本地调试，或把后端部署到可配置域名

## 测试真实聊天

1. 账号 A 登录后发布一个出借物品
2. 账号 B 登录后去主页/搜索申请借用并进入聊天
3. 账号 A 在“信息”页进入同一会话
4. 双方都可发送消息，消息实时轮询同步并存入 Supabase PostgreSQL

### 内置测试账号（默认密码均为 `123456`）

- `18800000001`（李同学）
- `18800000002`（王同学）
- `18800000003`（陈同学）
- `18800000004`（张同学）

### 管理员账号（默认）

- 手机号：`19900000000`
- 密码：`admin123`

可在 `server/.env` 里通过 `ADMIN_PHONE / ADMIN_PASSWORD / ADMIN_NICKNAME` 自定义。
