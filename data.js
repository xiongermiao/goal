// ===== SUPABASE =====
const SUPABASE_URL = 'https://xrjgcquaxylrlgyfxwxz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyamdjcXVheHlscmxneWZ4d3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDk1OTQsImV4cCI6MjEwMTI4NTU5NH0.kKTY6lFIt_U6bGy7WWzDDYG0BxJuDZZPMFy_7um5bmQ';
let supabase = window.supabaseCreateClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let isCloudMode = false;

async function initSupabaseAuth() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    isCloudMode = true;
    await loadTasksFromCloud();
    updateUserBar();
  } else {
    currentUser = null;
    isCloudMode = false;
    updateUserBar();
  }
}

async function handleLogin() {
  if (!supabase) { showToast('Supabase 未加载'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = '请输入邮箱和密码'; return; }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { errorEl.textContent = error.message; return; }
  currentUser = data.user;
  isCloudMode = true;
  await loadTasksFromCloud();
  hideLoginPanel();
  updateUserBar();
  refreshAll();
  showToast('登录成功');
}

async function handleRegister() {
  if (!supabase) { showToast('Supabase 未加载'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  if (!email || !password) { errorEl.textContent = '请输入邮箱和密码'; return; }
  if (password.length < 6) { errorEl.textContent = '密码至少6位'; return; }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { errorEl.textContent = error.message; return; }
  currentUser = data.user;
  isCloudMode = true;
  await loadTasksFromCloud();
  hideLoginPanel();
  updateUserBar();
  refreshAll();
  showToast('注册成功，已自动登录');
}

async function handleLogout() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentUser = null;
  isCloudMode = false;
  tasks = [];
  cloudTaskIds = new Set();
  updateUserBar();
  refreshAll();
  showToast('已登出');
}

function showLoginPanel() {
  document.getElementById('loginPanel').style.display = 'flex';
}
function hideLoginPanel() {
  document.getElementById('loginPanel').style.display = 'none';
}

function updateUserBar() {
  const bar = document.getElementById('userBar');
  const emailText = document.getElementById('userEmailText');
  const syncBadge = document.getElementById('syncBadge');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!bar) return;
  bar.style.display = 'flex';
  if (currentUser) {
    emailText.textContent = currentUser.email;
    syncBadge.textContent = '云端同步';
    syncBadge.className = 'sync-badge synced';
    loginBtn.style.display = 'none';
    logoutBtn.style.display = '';
  } else {
    emailText.textContent = '';
    syncBadge.textContent = '本地模式';
    syncBadge.className = 'sync-badge local';
    loginBtn.style.display = '';
    logoutBtn.style.display = 'none';
  }
}

async function loadTasksFromCloud() {
  if (!supabase || !currentUser) return;
  const userId = currentUser.id;
  // Load goals/todos/checkins/notes in parallel to speed up first render
  const [goalsRes, todosRes, checkinsRes, notesRes] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', userId),
    supabase.from('todos').select('*').eq('user_id', userId),
    supabase.from('checkins').select('*').eq('user_id', userId),
    supabase.from('notes').select('*').eq('user_id', userId)
  ]);
  const { data: goals, error: gErr } = goalsRes;
  const { data: todos, error: tErr } = todosRes;
  const { data: checkins, error: cErr } = checkinsRes;
  const { data: notes, error: nErr } = notesRes;
  if (gErr) {
    console.error('load goals error:', gErr);
    tasks = [];
    return;
  }
  if (tErr) { console.error('load todos error:', tErr); }
  if (cErr) { console.error('load checkins error:', cErr); }
  if (nErr) { console.error('load notes error:', nErr); }

  // Assemble tasks
  tasks = (goals || []).map(g => {
    const goalTodos = (todos || []).filter(t => t.goal_id === g.id).sort((a,b) => a.sort_order - b.sort_order);
    const goalCheckins = (checkins || []).filter(c => c.goal_id === g.id).map(c => c.created_at);
    const goalNotes = (notes || []).filter(n => n.goal_id === g.id).map(n => ({ text: n.content, date: n.date }));
    return {
      id: g.id,
      type: g.type,
      title: g.title,
      desc: g.desc || '',
      priority: g.priority || 'p2',
      tags: Array.isArray(g.tags) ? g.tags : (typeof g.tags === 'string' ? JSON.parse(g.tags || '[]') : []),
      startDate: g.start_date,
      endDate: g.end_date,
      targetCount: g.target_count || 1,
      frequency: g.frequency || 'daily',
      progress: g.progress || 0,
      status: g.status || 'active',
      todos: buildTodoTree(goalTodos),
      checkins: goalCheckins,
      notes: goalNotes,
      createdAt: g.created_at
    };
  });
  cloudTaskIds = new Set((goals || []).map(g => g.id));
}

function buildTodoTree(todos) {
  // Build tree from flat list with parent_id
  const map = {};
  const roots = [];
  todos.forEach(t => { 
    map[t.id] = { 
      id: t.id, 
      text: t.text, 
      done: t.completed, 
      completedAt: t.completed_date ? new Date(t.completed_date + 'T00:00:00').toISOString() : null,
      children: [], 
      sort_order: t.sort_order, 
      parent_id: t.parent_id 
    }; 
  });
  todos.forEach(t => {
    const node = map[t.id];
    if (t.parent_id && map[t.parent_id]) {
      map[t.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });
  roots.sort((a,b) => a.sort_order - b.sort_order);
  roots.forEach(n => { if(n.children) n.children.sort((a,b) => a.sort_order - b.sort_order); });
  return roots;
}

async function saveTasksToCloud(tasksArr) {
  if (!supabase || !currentUser) return;
  const userId = currentUser.id;
  cloudSyncing = true;
  // 删除云端中本地已删除的目标（含其子任务/打卡/笔记）
  const currentIds = new Set(tasksArr.map(t => t.id));
  const deletedIds = [...cloudTaskIds].filter(id => !currentIds.has(id));
  let deleteOk = true;
  let childError = false;
  for (const delId of deletedIds) {
    await supabase.from('todos').delete().eq('goal_id', delId);
    await supabase.from('checkins').delete().eq('goal_id', delId);
    await supabase.from('notes').delete().eq('goal_id', delId);
    const { error: delErr } = await supabase.from('goals').delete().eq('id', delId);
    if (delErr) {
      console.error('云端删除目标失败:', delErr);
      showToast('云端删除失败，请检查网络');
      deleteOk = false;
    }
  }
  for (const t of tasksArr) {
    const goalRow = {
      id: t.id,
      user_id: userId,
      title: t.title,
      type: t.type,
      desc: t.desc || '',
      priority: t.priority || 'p2',
      tags: t.tags || [],
      start_date: t.startDate || null,
      end_date: t.endDate || null,
      target_count: t.targetCount || 1,
      frequency: t.frequency || 'daily',
      progress: t.progress || 0,
      status: t.status || 'active'
    };
    const { error: gErr } = await supabase.from('goals').upsert(goalRow, { onConflict: 'id' });
    if (gErr) { console.error('云端保存目标失败:', gErr); showToast('云端保存失败，请检查网络'); cloudSyncing = false; return; }
    // Sync todos（先清空云端该目标的子任务，再按本地实际内容写入）
    await supabase.from('todos').delete().eq('goal_id', t.id);
    if (t.todos && t.todos.length > 0) {
      const flatTodos = flattenTodos(t.todos, t.id, userId);
      const { error: tiErr } = await supabase.from('todos').insert(flatTodos);
      if (tiErr) { console.error('云端保存子任务失败:', tiErr); childError = true; }
    }
    // Sync checkins
    await supabase.from('checkins').delete().eq('goal_id', t.id);
    if (t.checkins && t.checkins.length > 0) {
      const checkinRows = t.checkins.map(c => ({ goal_id: t.id, user_id: userId, created_at: c }));
      const { error: ciErr } = await supabase.from('checkins').insert(checkinRows);
      if (ciErr) { console.error('云端保存打卡记录失败:', ciErr); childError = true; }
    }
    // Sync notes
    await supabase.from('notes').delete().eq('goal_id', t.id);
    if (t.notes && t.notes.length > 0) {
      const noteRows = t.notes.map(n => ({ goal_id: t.id, user_id: userId, date: n.date || fmtLocalDay(new Date()), content: n.text }));
      const { error: niErr } = await supabase.from('notes').insert(noteRows);
      if (niErr) { console.error('云端保存笔记失败:', niErr); childError = true; }
    }
  }
  if (deleteOk) cloudTaskIds = currentIds;
  cloudSyncing = false;
  if (childError) showToast('部分数据同步失败，请检查网络');
}

function flattenTodos(todos, goalId, userId, parentId = null, result = [], order = 0) {
  todos.forEach((todo, i) => {
    result.push({
      id: todo.id || uid(),
      goal_id: goalId,
      user_id: userId,
      parent_id: parentId,
      text: todo.text,
      completed: !!todo.done,
      completed_date: todo.completedAt ? fmtLocalDay(new Date(todo.completedAt)) : (todo.done ? fmtLocalDay(new Date()) : null),
      sort_order: order + i
    });
    if (todo.children && todo.children.length > 0) {
      flattenTodos(todo.children, goalId, userId, todo.id || uid(), result, 0);
    }
  });
  return result;
}

async function saveTasks(tasksArr) {
  if (isCloudMode && currentUser) {
    await saveTasksToCloud(tasksArr);
  }
}

// Tag storage
const TAGS_KEY = 'cc_assistant_tags';
function loadTags() {
  try { return JSON.parse(localStorage.getItem(TAGS_KEY)) || ['工作','运动','阅读','创作','学习','生活']; }
  catch(e) { return ['工作','运动','阅读','创作','学习','生活']; }
}
function saveTags() { localStorage.setItem(TAGS_KEY, JSON.stringify(allKnownTags)); }
function syncTagsFromTasks() {
  const tagSet = new Set(allKnownTags);
  tasks.forEach(t => { if (t.tags) t.tags.forEach(tag => tagSet.add(tag)); });
  allKnownTags = [...tagSet].sort();
  saveTags();
}

// Tag color system
const TAG_COLORS = ['#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899','#06b6d4','#eab308','#78716c'];
const TAG_COLORS_KEY = 'cc_tag_colors';
function loadTagColors() {
  try { return JSON.parse(localStorage.getItem(TAG_COLORS_KEY)) || {}; }
  catch(e) { return {}; }
}
function saveTagColors() { localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(tagColors)); }
function getTagColor(tag) {
  if (!tagColors[tag]) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
    tagColors[tag] = TAG_COLORS[h % TAG_COLORS.length];
    saveTagColors();
  }
  return tagColors[tag];
}
function getTaskColor(t) {
  const tag = (t.tags && t.tags.length > 0) ? t.tags[0] : null;
  return tag ? getTagColor(tag) : '#d1d5db';
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// 本地日期 -> "YYYY-MM-DD"（避免 toISOString 的 UTC 时区偏移）
function fmtLocalDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 新建目标时判断初始状态：开始日期已到/无→active，未到→pending
function getInitialStatus(startDate) {
  if (!startDate) return 'active';
  const today = fmtLocalDay(new Date());
  return startDate <= today ? 'active' : 'pending';
}

// ===== STATE =====
let tasks = [];
let cloudTaskIds = new Set();
let cloudSyncing = false;

let currentFormType = 'progress';
let currentTag = '';
let allKnownTags = loadTags();
let formTag = ''; // single tag
let tagColors = loadTagColors();
let calNav = {};
let calMonthsCache = {};

// ===== PERIOD HELPERS (natural calendar periods) =====
function getTodayRange() {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0,0,0,0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return { start: monday, end: nextMonday };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function getQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), (q + 1) * 3, 1);
  return { start, end };
}

function getYearRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

function getPeriodRange(task) {
  switch(task.frequency) {
    case 'daily': return getTodayRange();
    case 'monthly': return getMonthRange();
    case 'quarterly': return getQuarterRange();
    case 'yearly': return getYearRange();
    default: return getWeekRange();
  }
}

function getPeriodCheckinCount(task) {
  if (task.type !== 'checkin' || !task.checkins) return 0;
  const { start, end } = getPeriodRange(task);
  return task.checkins.filter(c => {
    const d = new Date(c);
    return d >= start && d < end;
  }).length;
}

function getTodayCheckinCount(task) {
  if (task.type !== 'checkin' || !task.checkins) return 0;
  const { start, end } = getTodayRange();
  return task.checkins.filter(c => {
    const d = new Date(c);
    return d >= start && d < end;
  }).length;
}

function getPeriodLabel(task) {
  switch(task.frequency) {
    case 'daily': return '今天';
    case 'monthly': return '本月';
    case 'quarterly': return '本季';
    case 'yearly': return '本年';
    default: return '本周';
  }
}

function getPeriodUnit(task) {
  switch(task.frequency) {
    case 'daily': return '天';
    case 'monthly': return '月';
    case 'quarterly': return '季';
    case 'yearly': return '年';
    default: return '周';
  }
}

// Backward compat
function getWeekCheckinCount(task) { return getPeriodCheckinCount(task); }

// ===== COMPUTED =====
function getActiveTasks() { return tasks.filter(t => t.status === 'active'); }
function getCompletedTasks() { return tasks.filter(t => t.status === 'completed'); }
function getCheckinTasks() { return tasks.filter(t => t.type === 'checkin' && t.status === 'active'); }
function getProgressTasks() { return tasks.filter(t => t.type === 'progress' && t.status === 'active'); }
function getUrgentTasks() {
  const now = new Date(); now.setHours(0,0,0,0);
  const in3days = new Date(now); in3days.setDate(in3days.getDate() + 3);
  return tasks.filter(t => {
    if (t.status !== 'active' || !t.endDate) return false;
    const end = new Date(t.endDate);
    return end >= now && end <= in3days;
  });
}
