require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = Number(process.env.PORT || 3007);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('请在 server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const seedUsers = [
  { id: 'seed_lender_1', phone: '18800000001', nickname: '李同学', password: '123456', isAdmin: false },
  { id: 'seed_lender_2', phone: '18800000002', nickname: '王同学', password: '123456', isAdmin: false },
  { id: 'seed_lender_3', phone: '18800000003', nickname: '陈同学', password: '123456', isAdmin: false },
  { id: 'seed_lender_4', phone: '18800000004', nickname: '张同学', password: '123456', isAdmin: false },
  {
    id: 'seed_admin_1',
    phone: process.env.ADMIN_PHONE || '19900000000',
    nickname: process.env.ADMIN_NICKNAME || '系统管理员',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    isAdmin: true
  }
];

const seedItemPosts = [
  {
    title: '高等数学（同济版）第七版',
    owner_user_id: 'seed_lender_1',
    owner_name: '计算机学院 · 李同学',
    category: '教材',
    price: 8,
    deposit: 20,
    location: '图书馆一楼自习区',
    description: '有少量笔记，适合备考同学短借。',
    status: '可借'
  },
  {
    title: '小米充电宝 20000mAh',
    owner_user_id: 'seed_lender_2',
    owner_name: '经管学院 · 王同学',
    category: '电子产品',
    price: 5,
    deposit: 30,
    location: '一食堂门口',
    description: '支持快充，含双线，日租。',
    status: '可借'
  },
  {
    title: '羽毛球拍（双拍）',
    owner_user_id: 'seed_lender_3',
    owner_name: '体育学院 · 陈同学',
    category: '运动器材',
    price: 6,
    deposit: 25,
    location: '体育馆前台',
    description: '含3个羽毛球，晚间可面交。',
    status: '热门'
  },
  {
    title: '宿舍小电扇',
    owner_user_id: 'seed_lender_4',
    owner_name: '外国语学院 · 张同学',
    category: '生活用品',
    price: 4,
    deposit: 15,
    location: '南苑5栋',
    description: 'USB接口，支持三档风速。',
    status: '可借'
  }
];

const seedDemandPosts = [
  {
    id: 'd1',
    title: '求借：英语演讲比赛正装',
    publisher_user_id: 'seed_lender_1',
    publisher_name: '新闻学院 · 赵同学',
    category: '其他',
    location: '教学楼A区',
    budget: 20,
    reward: '可提供20元感谢费',
    description: '本周五晚使用一次，注意尺寸M。',
    status: '求借中'
  },
  {
    id: 'd2',
    title: '求借：单反相机一天',
    publisher_user_id: 'seed_lender_2',
    publisher_name: '艺术学院 · 周同学',
    category: '电子产品',
    location: '艺术楼',
    budget: 60,
    reward: '可交换PS修图服务',
    description: '周末外拍使用，器材会妥善保管。',
    status: '求借中'
  }
];

const parseJsonArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const genId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const normalizePhone = (phone) => String(phone || '').trim();
const normalizeNickname = (nickname) => String(nickname || '').trim();

const buildPasswordHash = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) {
    return false;
  }
  const hashBuffer = Buffer.from(hash, 'hex');
  const inputBuffer = crypto.scryptSync(String(password), salt, 64);
  if (hashBuffer.length !== inputBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, inputBuffer);
};

const throwIfError = (error, fallback = 'db_error') => {
  if (error) {
    const err = new Error(error.message || fallback);
    err.code = error.code || fallback;
    throw err;
  }
};

const mapUser = (row) => ({
  id: row.id,
  phone: row.phone,
  nickname: row.nickname,
  isAdmin: Boolean(row.is_admin)
});

const mapItemPost = (row) => ({
  id: toNumber(row.id),
  title: row.title,
  ownerUserId: row.owner_user_id,
  owner: row.owner_name,
  category: row.category,
  price: toNumber(row.price),
  deposit: toNumber(row.deposit),
  location: row.location,
  description: row.description,
  status: row.status,
  isHidden: Boolean(row.is_hidden),
  hiddenReason: row.hidden_reason || '',
  createdAt: toNumber(row.created_at),
  updatedAt: toNumber(row.updated_at)
});

const mapDemandPost = (row) => ({
  id: row.id,
  title: row.title,
  publisherUserId: row.publisher_user_id,
  publisher: row.publisher_name,
  category: row.category,
  budget: toNumber(row.budget),
  location: row.location,
  reward: row.reward,
  description: row.description,
  status: row.status,
  isHidden: Boolean(row.is_hidden),
  hiddenReason: row.hidden_reason || '',
  createdAt: toNumber(row.created_at),
  updatedAt: toNumber(row.updated_at)
});

const mapSession = (row) => ({
  id: row.id,
  itemId: toNumber(row.item_id),
  itemTitle: row.item_title,
  lenderUserId: row.lender_user_id,
  lenderName: row.lender_name,
  borrowerUserId: row.borrower_user_id,
  borrowerName: row.borrower_name,
  status: row.status,
  beforePhotos: parseJsonArray(row.before_photos),
  afterPhotos: parseJsonArray(row.after_photos),
  createdAt: toNumber(row.created_at),
  updatedAt: toNumber(row.updated_at)
});

const mapMessage = (row) => ({
  id: toNumber(row.id),
  sessionId: row.session_id,
  senderUserId: row.sender_user_id,
  senderName: row.sender_name,
  text: row.text,
  time: toNumber(row.time)
});

const isPendingBorrowApproval = (status) => ['待出借者同意', '借用协商中'].includes(String(status || ''));

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const loadUserById = async (userId) => {
  const id = String(userId || '').trim();
  if (!id) {
    return null;
  }
  const resp = await supabase.from('users').select('id, is_admin').eq('id', id).maybeSingle();
  throwIfError(resp.error, 'user_query_failed');
  return resp.data || null;
};

const ensureCanManageItem = async (actorUserId, itemRow) => {
  const actor = await loadUserById(actorUserId);
  if (!actor) {
    const err = new Error('actor_not_found');
    err.code = 'actor_not_found';
    throw err;
  }
  const canManage = Boolean(actor.is_admin) || String(itemRow.owner_user_id) === String(actor.id);
  if (!canManage) {
    const err = new Error('forbidden');
    err.code = 'forbidden';
    throw err;
  }
  return actor;
};

const ensureCanManageDemand = async (actorUserId, demandRow) => {
  const actor = await loadUserById(actorUserId);
  if (!actor) {
    const err = new Error('actor_not_found');
    err.code = 'actor_not_found';
    throw err;
  }
  const canManage = Boolean(actor.is_admin) || String(demandRow.publisher_user_id) === String(actor.id);
  if (!canManage) {
    const err = new Error('forbidden');
    err.code = 'forbidden';
    throw err;
  }
  return actor;
};

const syncSeedUsers = async () => {
  for (const user of seedUsers) {
    const byPhoneResp = await supabase
      .from('users')
      .select('id')
      .eq('phone', user.phone)
      .maybeSingle();
    throwIfError(byPhoneResp.error, 'seed_users_lookup_failed');

    // If admin phone already belongs to an existing account, promote that account.
    if (byPhoneResp.data && String(byPhoneResp.data.id) !== String(user.id) && user.isAdmin) {
      const promotedResp = await supabase
        .from('users')
        .update({
          nickname: user.nickname,
          password_hash: buildPasswordHash(user.password),
          is_admin: true
        })
        .eq('id', String(byPhoneResp.data.id));
      throwIfError(promotedResp.error, 'seed_admin_promote_failed');
      continue;
    }

    const payload = {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      password_hash: buildPasswordHash(user.password),
      is_admin: Boolean(user.isAdmin),
      created_at: Date.now()
    };

    const { error } = await supabase.from('users').upsert(payload, {
      onConflict: 'id'
    });
    throwIfError(error, 'seed_users_failed');
  }
};

const syncSeedPosts = async () => {
  const itemCountResp = await supabase.from('item_posts').select('id', { count: 'exact', head: true });
  throwIfError(itemCountResp.error, 'seed_item_count_failed');
  const itemCount = toNumber(itemCountResp.count);

  if (!itemCount) {
    const now = Date.now();
    const itemPayload = seedItemPosts.map((item, index) => ({
      ...item,
      created_at: now - index * 1000,
      updated_at: now - index * 1000,
      is_hidden: false,
      hidden_reason: ''
    }));
    const insertedItems = await supabase.from('item_posts').insert(itemPayload);
    throwIfError(insertedItems.error, 'seed_items_failed');
  }

  const now = Date.now();
  for (let i = 0; i < seedDemandPosts.length; i += 1) {
    const demand = seedDemandPosts[i];
    const demandPayload = {
      ...demand,
      created_at: now - i * 1000,
      updated_at: now - i * 1000,
      is_hidden: false,
      hidden_reason: ''
    };
    const resp = await supabase.from('demand_posts').upsert(demandPayload, {
      onConflict: 'id'
    });
    throwIfError(resp.error, 'seed_demands_failed');
  }
};

app.get('/api/health', asyncHandler(async (_req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  throwIfError(error, 'health_check_failed');
  res.json({ ok: true, now: Date.now() });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body && req.body.phone);
  const password = String((req.body && req.body.password) || '');
  const nickname = normalizeNickname(req.body && req.body.nickname);

  if (!/^1\d{10}$/.test(phone) || password.length < 6 || !nickname) {
    res.status(400).json({ error: 'invalid_params' });
    return;
  }

  const existsResp = await supabase.from('users').select('id').eq('phone', phone).limit(1);
  throwIfError(existsResp.error, 'register_query_failed');
  if (existsResp.data && existsResp.data.length) {
    res.status(409).json({ error: 'phone_already_registered' });
    return;
  }

  const payload = {
    id: genId('u'),
    phone,
    password_hash: buildPasswordHash(password),
    nickname,
    is_admin: false,
    created_at: Date.now()
  };
  const inserted = await supabase.from('users').insert(payload).select('id, phone, nickname, is_admin').single();
  throwIfError(inserted.error, 'register_insert_failed');

  res.json({
    user: mapUser(inserted.data)
  });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body && req.body.phone);
  const password = String((req.body && req.body.password) || '');

  if (!/^1\d{10}$/.test(phone) || password.length < 6) {
    res.status(400).json({ error: 'invalid_params' });
    return;
  }

  const result = await supabase
    .from('users')
    .select('id, phone, nickname, password_hash, is_admin')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();
  throwIfError(result.error, 'login_query_failed');

  if (!result.data || !verifyPassword(password, result.data.password_hash)) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  res.json({
    user: mapUser(result.data)
  });
}));

app.get('/api/posts/home', asyncHandler(async (_req, res) => {
  const itemResp = await supabase
    .from('item_posts')
    .select('*')
    .eq('is_hidden', false)
    .order('updated_at', { ascending: false });
  throwIfError(itemResp.error, 'item_list_failed');

  const demandResp = await supabase
    .from('demand_posts')
    .select('*')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });
  throwIfError(demandResp.error, 'demand_list_failed');

  res.json({
    items: (itemResp.data || []).map(mapItemPost),
    demands: (demandResp.data || []).map(mapDemandPost)
  });
}));

app.get('/api/posts/manage', asyncHandler(async (req, res) => {
  const userId = String((req.query && req.query.userId) || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'missing_user_id' });
    return;
  }

  const actor = await loadUserById(userId);
  if (!actor) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }

  let itemQuery = supabase.from('item_posts').select('*').order('updated_at', { ascending: false });
  let demandQuery = supabase.from('demand_posts').select('*').order('updated_at', { ascending: false });

  if (!actor.is_admin) {
    itemQuery = itemQuery.eq('owner_user_id', userId);
    demandQuery = demandQuery.eq('publisher_user_id', userId);
  }

  const [itemResp, demandResp] = await Promise.all([itemQuery, demandQuery]);
  throwIfError(itemResp.error, 'manage_item_query_failed');
  throwIfError(demandResp.error, 'manage_demand_query_failed');

  res.json({
    isAdmin: Boolean(actor.is_admin),
    items: (itemResp.data || []).map(mapItemPost),
    demands: (demandResp.data || []).map(mapDemandPost)
  });
}));

app.post('/api/posts/item', asyncHandler(async (req, res) => {
  const {
    title,
    ownerUserId,
    ownerName,
    category,
    price,
    deposit,
    location,
    description
  } = req.body || {};

  if (!title || !ownerUserId || !ownerName || !category || location === undefined) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const owner = await loadUserById(ownerUserId);
  if (!owner) {
    res.status(404).json({ error: 'owner_not_found' });
    return;
  }

  const now = Date.now();
  const payload = {
    title: String(title).trim(),
    owner_user_id: String(ownerUserId),
    owner_name: String(ownerName),
    category: String(category),
    price: toNumber(price),
    deposit: toNumber(deposit),
    location: String(location).trim(),
    description: String(description || '').trim() || '暂无描述',
    status: '可借',
    is_hidden: false,
    hidden_reason: '',
    created_at: now,
    updated_at: now
  };

  const inserted = await supabase.from('item_posts').insert(payload).select('*').single();
  throwIfError(inserted.error, 'item_create_failed');

  res.json({ item: mapItemPost(inserted.data) });
}));

app.post('/api/posts/demand', asyncHandler(async (req, res) => {
  const {
    title,
    publisherUserId,
    publisherName,
    category,
    budget,
    location,
    reward,
    description
  } = req.body || {};

  if (!title || !publisherUserId || !publisherName || !category || location === undefined) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const publisher = await loadUserById(publisherUserId);
  if (!publisher) {
    res.status(404).json({ error: 'publisher_not_found' });
    return;
  }

  const now = Date.now();
  const payload = {
    id: genId('d'),
    title: String(title).trim(),
    publisher_user_id: String(publisherUserId),
    publisher_name: String(publisherName),
    category: String(category),
    budget: toNumber(budget),
    location: String(location).trim(),
    reward: String(reward || '').trim() || '可协商',
    description: String(description || '').trim() || '暂无补充说明',
    status: '求借中',
    is_hidden: false,
    hidden_reason: '',
    created_at: now,
    updated_at: now
  };

  const inserted = await supabase.from('demand_posts').insert(payload).select('*').single();
  throwIfError(inserted.error, 'demand_create_failed');

  res.json({ demand: mapDemandPost(inserted.data) });
}));

app.patch('/api/posts/item/:id', asyncHandler(async (req, res) => {
  const id = toNumber(req.params && req.params.id);
  const { actorUserId, title, category, price, deposit, location, description, status, isHidden, hiddenReason } = req.body || {};

  if (!id || !actorUserId) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const itemResp = await supabase.from('item_posts').select('*').eq('id', id).maybeSingle();
  throwIfError(itemResp.error, 'item_query_failed');
  if (!itemResp.data) {
    res.status(404).json({ error: 'item_not_found' });
    return;
  }

  await ensureCanManageItem(actorUserId, itemResp.data);

  const patch = { updated_at: Date.now() };
  if (title !== undefined) patch.title = String(title).trim();
  if (category !== undefined) patch.category = String(category);
  if (price !== undefined) patch.price = toNumber(price);
  if (deposit !== undefined) patch.deposit = toNumber(deposit);
  if (location !== undefined) patch.location = String(location).trim();
  if (description !== undefined) patch.description = String(description).trim() || '暂无描述';
  if (status !== undefined) patch.status = String(status);
  if (isHidden !== undefined) patch.is_hidden = Boolean(isHidden);
  if (hiddenReason !== undefined) patch.hidden_reason = String(hiddenReason || '').trim();
  if (patch.is_hidden === false && hiddenReason === undefined) {
    patch.hidden_reason = '';
  }

  const updated = await supabase.from('item_posts').update(patch).eq('id', id).select('*').single();
  throwIfError(updated.error, 'item_update_failed');

  res.json({ item: mapItemPost(updated.data) });
}));

app.patch('/api/posts/demand/:id', asyncHandler(async (req, res) => {
  const id = String((req.params && req.params.id) || '').trim();
  const { actorUserId, title, category, budget, location, reward, description, status, isHidden, hiddenReason } = req.body || {};

  if (!id || !actorUserId) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const demandResp = await supabase.from('demand_posts').select('*').eq('id', id).maybeSingle();
  throwIfError(demandResp.error, 'demand_query_failed');
  if (!demandResp.data) {
    res.status(404).json({ error: 'demand_not_found' });
    return;
  }

  await ensureCanManageDemand(actorUserId, demandResp.data);

  const patch = { updated_at: Date.now() };
  if (title !== undefined) patch.title = String(title).trim();
  if (category !== undefined) patch.category = String(category);
  if (budget !== undefined) patch.budget = toNumber(budget);
  if (location !== undefined) patch.location = String(location).trim();
  if (reward !== undefined) patch.reward = String(reward || '').trim() || '可协商';
  if (description !== undefined) patch.description = String(description || '').trim() || '暂无补充说明';
  if (status !== undefined) patch.status = String(status);
  if (isHidden !== undefined) patch.is_hidden = Boolean(isHidden);
  if (hiddenReason !== undefined) patch.hidden_reason = String(hiddenReason || '').trim();
  if (patch.is_hidden === false && hiddenReason === undefined) {
    patch.hidden_reason = '';
  }

  const updated = await supabase.from('demand_posts').update(patch).eq('id', id).select('*').single();
  throwIfError(updated.error, 'demand_update_failed');

  res.json({ demand: mapDemandPost(updated.data) });
}));

app.post('/api/chat/session/start', asyncHandler(async (req, res) => {
  const {
    itemId,
    itemTitle,
    lenderUserId,
    lenderName,
    borrowerUserId,
    borrowerName
  } = req.body || {};

  if (!itemId || !itemTitle || !lenderUserId || !lenderName || !borrowerUserId || !borrowerName) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const existingResp = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('item_id', toNumber(itemId))
    .eq('lender_user_id', String(lenderUserId))
    .eq('borrower_user_id', String(borrowerUserId))
    .neq('status', '已完成')
    .neq('status', '已拒绝')
    .order('updated_at', { ascending: false })
    .limit(1);
  throwIfError(existingResp.error, 'session_query_failed');

  if (existingResp.data && existingResp.data.length) {
    res.json({ session: mapSession(existingResp.data[0]), existed: true });
    return;
  }

  const now = Date.now();
  const sessionPayload = {
    id: genId('session'),
    item_id: toNumber(itemId),
    item_title: String(itemTitle),
    lender_user_id: String(lenderUserId),
    lender_name: String(lenderName),
    borrower_user_id: String(borrowerUserId),
    borrower_name: String(borrowerName),
    status: '待出借者同意',
    before_photos: [],
    after_photos: [],
    created_at: now,
    updated_at: now
  };
  const insertedSession = await supabase.from('chat_sessions').insert(sessionPayload).select('*').single();
  throwIfError(insertedSession.error, 'session_insert_failed');

  const tipMessagePayload = {
    session_id: sessionPayload.id,
    sender_user_id: 'system',
    sender_name: '系统',
    text: '借用申请已发起，等待出借者同意。',
    time: now
  };
  const insertedMsg = await supabase.from('chat_messages').insert(tipMessagePayload);
  throwIfError(insertedMsg.error, 'session_tip_insert_failed');

  res.json({ session: mapSession(insertedSession.data), existed: false });
}));

app.get('/api/chat/sessions', asyncHandler(async (req, res) => {
  const { userId } = req.query || {};
  if (!userId) {
    res.status(400).json({ error: 'missing_user_id' });
    return;
  }

  const rows = await supabase
    .from('chat_sessions')
    .select('*')
    .or(`lender_user_id.eq.${String(userId)},borrower_user_id.eq.${String(userId)}`)
    .order('updated_at', { ascending: false });
  throwIfError(rows.error, 'sessions_query_failed');

  res.json({
    sessions: (rows.data || []).map(mapSession)
  });
}));

app.get('/api/chat/session', asyncHandler(async (req, res) => {
  const { sessionId } = req.query || {};
  if (!sessionId) {
    res.status(400).json({ error: 'missing_session_id' });
    return;
  }

  const result = await supabase.from('chat_sessions').select('*').eq('id', String(sessionId)).maybeSingle();
  throwIfError(result.error, 'session_query_failed');
  if (!result.data) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }
  res.json({ session: mapSession(result.data) });
}));

app.get('/api/chat/messages', asyncHandler(async (req, res) => {
  const { sessionId, afterId } = req.query || {};
  if (!sessionId) {
    res.status(400).json({ error: 'missing_session_id' });
    return;
  }

  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', String(sessionId))
    .order('id', { ascending: true });

  if (afterId) {
    query = query.gt('id', toNumber(afterId));
  }

  const rows = await query;
  throwIfError(rows.error, 'messages_query_failed');

  res.json({
    messages: (rows.data || []).map(mapMessage)
  });
}));

app.post('/api/chat/messages', asyncHandler(async (req, res) => {
  const {
    sessionId,
    senderUserId,
    senderName,
    text
  } = req.body || {};

  if (!sessionId || !senderUserId || !senderName || !String(text || '').trim()) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const sessionResp = await supabase.from('chat_sessions').select('*').eq('id', String(sessionId)).maybeSingle();
  throwIfError(sessionResp.error, 'session_query_failed');
  const session = sessionResp.data;
  if (!session) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  const senderId = String(senderUserId);
  const inSession =
    senderId === 'system' ||
    senderId === String(session.lender_user_id) ||
    senderId === String(session.borrower_user_id);
  if (!inSession) {
    res.status(403).json({ error: 'forbidden_sender' });
    return;
  }

  const now = Date.now();
  const messagePayload = {
    session_id: String(sessionId),
    sender_user_id: senderId,
    sender_name: String(senderName),
    text: String(text).trim(),
    time: now
  };
  const insertedResp = await supabase.from('chat_messages').insert(messagePayload).select('*').single();
  throwIfError(insertedResp.error, 'message_insert_failed');
  const touchResp = await supabase
    .from('chat_sessions')
    .update({
      updated_at: now
    })
    .eq('id', String(sessionId));
  throwIfError(touchResp.error, 'session_touch_failed');

  res.json({
    message: mapMessage(insertedResp.data)
  });
}));

app.patch('/api/chat/session/action', asyncHandler(async (req, res) => {
  const { sessionId, actorUserId, action } = req.body || {};
  if (!sessionId || !actorUserId || !action) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const sessionResp = await supabase.from('chat_sessions').select('*').eq('id', String(sessionId)).maybeSingle();
  throwIfError(sessionResp.error, 'session_query_failed');
  const session = sessionResp.data;
  if (!session) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  const actorId = String(actorUserId);
  const isLender = actorId === String(session.lender_user_id);
  const isBorrower = actorId === String(session.borrower_user_id);
  if (!isLender && !isBorrower) {
    res.status(403).json({ error: 'forbidden_actor' });
    return;
  }

  const currentStatus = String(session.status || '');
  const now = Date.now();
  let nextStatus = currentStatus;
  let systemText = '';

  if (action === 'approve_borrow') {
    if (!isLender || !isPendingBorrowApproval(currentStatus)) {
      res.status(409).json({ error: 'invalid_status_transition' });
      return;
    }
    nextStatus = '借用中';
    systemText = '出借者已同意借用申请，借用单进入借用中。';
  } else if (action === 'reject_borrow') {
    if (!isLender || !isPendingBorrowApproval(currentStatus)) {
      res.status(409).json({ error: 'invalid_status_transition' });
      return;
    }
    nextStatus = '已拒绝';
    systemText = '出借者已拒绝借用申请。';
  } else if (action === 'request_return') {
    if (!isBorrower || currentStatus !== '借用中') {
      res.status(409).json({ error: 'invalid_status_transition' });
      return;
    }
    const beforePhotos = parseJsonArray(session.before_photos);
    const afterPhotos = parseJsonArray(session.after_photos);
    if (!beforePhotos.length || !afterPhotos.length) {
      res.status(400).json({ error: 'missing_compare_photos' });
      return;
    }
    nextStatus = '待确认归还';
    systemText = '借用者已发起归还确认，等待出借者确认。';
  } else if (action === 'confirm_return') {
    if (!isLender || currentStatus !== '待确认归还') {
      res.status(409).json({ error: 'invalid_status_transition' });
      return;
    }
    nextStatus = '已完成';
    systemText = '出借者已确认归还，本次借用已完成。';
  } else if (action === 'reject_return') {
    if (!isLender || currentStatus !== '待确认归还') {
      res.status(409).json({ error: 'invalid_status_transition' });
      return;
    }
    nextStatus = '借用中';
    systemText = '出借者退回了归还确认，借用状态恢复为借用中。';
  } else {
    res.status(400).json({ error: 'unsupported_action' });
    return;
  }

  const updatedResp = await supabase
    .from('chat_sessions')
    .update({
      status: nextStatus,
      updated_at: now
    })
    .eq('id', String(sessionId))
    .select('*')
    .single();
  throwIfError(updatedResp.error, 'session_action_update_failed');

  if (systemText) {
    const msgResp = await supabase.from('chat_messages').insert({
      session_id: String(sessionId),
      sender_user_id: 'system',
      sender_name: '系统',
      text: systemText,
      time: now
    });
    throwIfError(msgResp.error, 'session_action_message_failed');
  }

  res.json({ session: mapSession(updatedResp.data) });
}));

app.patch('/api/chat/session/photos', asyncHandler(async (req, res) => {
  const { sessionId, beforePhotos, afterPhotos } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ error: 'missing_session_id' });
    return;
  }

  const sessionResp = await supabase.from('chat_sessions').select('*').eq('id', String(sessionId)).maybeSingle();
  throwIfError(sessionResp.error, 'session_query_failed');
  const session = sessionResp.data;
  if (!session) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  const now = Date.now();
  const nextBefore = Array.isArray(beforePhotos) ? beforePhotos : parseJsonArray(session.before_photos);
  const nextAfter = Array.isArray(afterPhotos) ? afterPhotos : parseJsonArray(session.after_photos);

  const updatedResp = await supabase
    .from('chat_sessions')
    .update({
      before_photos: nextBefore,
      after_photos: nextAfter,
      updated_at: now
    })
    .eq('id', String(sessionId))
    .select('*')
    .single();
  throwIfError(updatedResp.error, 'session_photos_update_failed');

  res.json({ session: mapSession(updatedResp.data) });
}));

app.patch('/api/chat/session/status', asyncHandler(async (req, res) => {
  const { sessionId, status } = req.body || {};
  if (!sessionId || !status) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  const updatedResp = await supabase
    .from('chat_sessions')
    .update({
      status: String(status),
      updated_at: Date.now()
    })
    .eq('id', String(sessionId))
    .select('*')
    .maybeSingle();
  throwIfError(updatedResp.error, 'session_status_update_failed');
  if (!updatedResp.data) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  res.json({ session: mapSession(updatedResp.data) });
}));

app.use((err, _req, res, _next) => {
  console.error('[server_error]', err);
  if (err.code === 'forbidden') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (err.code === 'actor_not_found') {
    res.status(404).json({ error: 'actor_not_found' });
    return;
  }
  res.status(500).json({ error: err.code || 'internal_server_error' });
});

Promise.resolve()
  .then(syncSeedUsers)
  .then(syncSeedPosts)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`chat-supabase-server running at http://127.0.0.1:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('服务初始化失败，请先在 Supabase 创建 users/chat_sessions/chat_messages/item_posts/demand_posts 五张表。', err);
    process.exit(1);
  });
