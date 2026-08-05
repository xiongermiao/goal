// ===== TODO HELPERS (nested, max 3 levels) =====
function countIncompleteTodos(todos) {
  let count = 0;
  if (!todos) return 0;
  todos.forEach(t => { if (!t.done) count++; if (t.children) count += countIncompleteTodos(t.children); });
  return count;
}
function countAllTodos(todos) {
  let count = 0;
  if (!todos) return 0;
  todos.forEach(t => { count++; if (t.children) count += countAllTodos(t.children); });
  return count;
}
function findTodoById(todos, id) {
  if (!todos) return null;
  for (const t of todos) {
    if (t.id === id) return t;
    if (t.children) { const found = findTodoById(t.children, id); if (found) return found; }
  }
  return null;
}
function collectDescendantIds(todos) {
  const ids = [];
  if (!todos) return ids;
  todos.forEach(t => { ids.push(t.id); if (t.children) ids.push(...collectDescendantIds(t.children)); });
  return ids;
}
function removeTodoById(todos, id) {
  if (!todos) return false;
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].id === id) { todos.splice(i, 1); return true; }
    if (todos[i].children && removeTodoById(todos[i].children, id)) return true;
  }
  return false;
}
function markAllTodosDone(todos) {
  if (!todos) return;
  const now = new Date().toISOString();
  todos.forEach(t => {
    if (!t.done) { t.done = true; t.completedAt = now; }
    markAllTodosDone(t.children);
  });
}
function shouldShowCompletedTodo(todo) {
  if (!todo.completedAt) return false;
  const d = new Date(todo.completedAt);
  const cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 2, 0, 0);
  return new Date() < cutoff;
}
function collectVisibleFlat(todos, depth, collapsedIds) {
  const result = [];
  if (!todos) return result;
  todos.forEach(t => {
    const hasKids = t.children && t.children.length > 0;
    if (!t.done) {
      result.push({ ...t, _depth: depth || 0, _hasChildren: hasKids });
    } else if (shouldShowCompletedTodo(t)) {
      result.push({ ...t, _depth: depth || 0, _completedToday: true, _hasChildren: hasKids });
    }
    if (hasKids && !(collapsedIds && collapsedIds.has(t.id))) {
      result.push(...collectVisibleFlat(t.children, (depth || 0) + 1, collapsedIds));
    }
  });
  return result;
}
function renderTodoTree(todos, taskId, depth) {
  depth = depth || 0;
  let html = '';
  if (!todos) return html;
  todos.forEach(todo => {
    const hasKids = todo.children && todo.children.length > 0;
    const collapsed = collapsedTodoIds.has(todo.id);
    const cls = (todo.done ? ' done' : '') + (depth === 1 ? ' depth1' : depth === 2 ? ' depth2' : '');
    const arrow = (hasKids && depth < 2) ? (collapsed ? ' ▸' : ' ▾') : '';
    const textClick = (hasKids && depth < 2) ? ` onclick="event.stopPropagation();toggleCollapseTodo('${todo.id}','${taskId}')"` : '';
    html += `<div class="todo-item${cls}" data-todoid="${todo.id}">
      <div class="todo-check" onclick="toggleTodo('${taskId}','${todo.id}')"></div>
      <span class="todo-text${(hasKids && depth < 2) ? ' has-children' : ''}"${textClick}>${escHtml(todo.text)}${arrow}</span>
      ${depth < 2 ? `<span class="todo-sub-btn" onclick="event.stopPropagation();addSubTodo('${taskId}','${todo.id}')" title="添加子任务">+</span>` : ''}
      <span class="todo-del" onclick="event.stopPropagation();toggleTodoMenu(event,'${taskId}','${todo.id}')">⋯</span>
    </div>`;
    if (hasKids) {
      html += `<div class="todo-children"${collapsed ? ' style="display:none"' : ''}>${renderTodoTree(todo.children, taskId, depth + 1)}</div>`;
    }
  });
  return html;
}

// ===== TODO =====
function todoSection(t) {
  const todos = t.todos || [];
  const today = fmtLocalDay(new Date());
  const incompleteCount = countIncompleteTodos(todos);
  const allCount = countAllTodos(todos);

  let html = '<div class="todo-section">';
  html += `<div class="todo-section-title">📋 待办事项 <span class="todo-count">${allCount > 0 ? incompleteCount+'/'+allCount : '暂无'}</span></div>`;

  // Render tree (all todos: undone first, then today's done, then history)
  html += renderTodoTree(todos, t.id, 0);

  // Add new root todo
  html += `<div class="todo-add-row">
    <input type="text" class="form-input" id="todoInput_${t.id}" placeholder="添加目标待办..." style="height:36px">
    <button class="btn btn-primary btn-sm" onclick="addTodo('${t.id}')" style="white-space:nowrap;height:36px">+ 添加</button>
  </div>`;

  html += '</div>';
  return html;
}

function addTodo(taskId, parentId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  const input = document.getElementById('todoInput_' + taskId);
  if (!input || !input.value.trim()) return;
  if (!t.todos) t.todos = [];
  const newTodo = { id: uid(), text: input.value.trim(), done: false, date: fmtLocalDay(new Date()), createdAt: new Date().toISOString() };
  if (parentId) {
    // Add as child of specified parent
    const parent = findTodoById(t.todos, parentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(newTodo);
    }
  } else {
    t.todos.push(newTodo);
  }
  input.value = '';
  saveTasks(tasks);
  openDetail(taskId);
  showToast('待办已添加 ✅');
}

function addSubTodo(taskId, parentId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  const parent = findTodoById(t.todos, parentId);
  if (!parent) return;
  const depth = getTodoDepth(t.todos, parentId);
  if (depth >= 2) { showToast('最多支持3级待办'); return; }
  const item = document.querySelector(`.todo-item[data-todoid="${parentId}"]`);
  if (!item) { showToast('请刷新后重试'); return; }
  const existing = item.querySelector('.todo-inline-input');
  if (existing) { existing.remove(); }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-inline-input todo-sub-input';
  input.placeholder = '输入子任务名称，回车确认';
  input.maxLength = 200;
  const childrenWrap = item.nextElementSibling && item.nextElementSibling.classList.contains('todo-children') ? item.nextElementSibling : null;
  if (childrenWrap) {
    item.parentNode.insertBefore(input, childrenWrap);
  } else {
    item.after(input);
  }
  input.focus();
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (save && val) {
      if (!t.todos) t.todos = [];
      if (!parent.children) parent.children = [];
      parent.children.push({ id: uid(), text: val, done: false, date: fmtLocalDay(new Date()), createdAt: new Date().toISOString() });
      saveTasks(tasks);
      openDetail(taskId);
      showToast('子任务已添加 ✅');
    } else {
      openDetail(taskId);
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

function getTodoDepth(todos, id, depth) {
  depth = depth || 0;
  if (!todos) return -1;
  for (const t of todos) {
    if (t.id === id) return depth;
    if (t.children) { const d = getTodoDepth(t.children, id, depth + 1); if (d >= 0) return d; }
  }
  return -1;
}

function toggleCollapseTodo(todoId, taskId) {
  if (collapsedTodoIds.has(todoId)) {
    collapsedTodoIds.delete(todoId);
  } else {
    collapsedTodoIds.add(todoId);
  }
  renderTodayTodos();
  const panelDetail = document.getElementById('panelDetail');
  if (panelDetail && panelDetail.classList.contains('active')) {
    openDetail(taskId);
  }
}

function toggleTodo(taskId, todoId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.todos) return;
  const todo = findTodoById(t.todos, todoId);
  if (!todo) return;
  todo.done = !todo.done;
  if (todo.done) {
    todo.completedAt = new Date().toISOString();
    markAllTodosDone(todo.children);
  } else { delete todo.completedAt; }
  saveTasks(tasks);
  openDetail(taskId);
}

function toggleTodoToday(taskId, todoId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.todos) return;
  const todo = findTodoById(t.todos, todoId);
  if (!todo) return;
  todo.done = !todo.done;
  if (todo.done) {
    todo.completedAt = new Date().toISOString();
    markAllTodosDone(todo.children);
  } else { delete todo.completedAt; }
  saveTasks(tasks);
  renderTodayTodos();
  const panelDetail = document.getElementById('panelDetail');
  if (panelDetail && panelDetail.classList.contains('active')) {
    openDetail(taskId);
  }
}

function deleteTodo(taskId, todoId) {
  if (!confirm('确定要删除这个待办吗？')) return;
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.todos) return;
  removeTodoById(t.todos, todoId);
  saveTasks(tasks);
  closeTodoMenu();
  openDetail(taskId);
  showToast('待办已删除');
}

function toggleTodoMenu(e, taskId, todoId) {
  e.stopPropagation();
  const existing = document.querySelector('.todo-action-popup');
  if (existing && existing.dataset.todoId === todoId) { closeTodoMenu(); return; }
  closeTodoMenu();
  const popup = document.createElement('div');
  popup.className = 'todo-action-popup';
  popup.dataset.taskId = taskId;
  popup.dataset.todoId = todoId;
  popup.innerHTML = `<div class="popup-item" onclick="renameTodo('${taskId}','${todoId}')">✏️ 重命名</div><div class="popup-item danger" onclick="deleteTodo('${taskId}','${todoId}')">🗑 删除</div>`;
  document.body.appendChild(popup);
  const rect = e.target.getBoundingClientRect();
  let top = rect.bottom + 4, left = rect.right - 110;
  if (left < 8) left = 8;
  if (top + 90 > window.innerHeight) top = rect.top - 90;
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
  setTimeout(() => document.addEventListener('click', closeTodoMenu, { once: true }), 0);
}

function closeTodoMenu() {
  document.querySelectorAll('.todo-action-popup').forEach(el => el.remove());
  document.removeEventListener('click', closeTodoMenu);
}

function renameTodo(taskId, todoId) {
  closeTodoMenu();
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.todos) return;
  const todo = findTodoById(t.todos, todoId);
  if (!todo) return;
  const item = document.querySelector(`.todo-item[data-todoid="${todoId}"]`);
  const textEl = item ? item.querySelector('.todo-text') : null;
  if (!textEl) { showToast('请刷新后重试'); return; }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-inline-input';
  input.value = todo.text;
  input.maxLength = 200;
  textEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (save && val && val !== todo.text) {
      todo.text = val;
      saveTasks(tasks);
      openDetail(taskId);
      showToast('已重命名');
    } else {
      openDetail(taskId);
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

// ===== FILTER & SEARCH =====
let currentCardFilter = '';
let currentStatusFilter = 'active';
let currentDetailTaskId = null;
let previousTab = 'tasks';
let collapsedTodoIds = new Set();

function resetFilters() {
  currentCardFilter = '';
  updateSummaryCards();
  renderTaskList();
}

function updateSummaryCards() {
  // Count tasks for each card, respecting tag filter
  let active = tasks.filter(t => t.status === 'active');
  if (currentTag) active = active.filter(t => t.tags && t.tags.includes(currentTag));
  const checkinCount = active.filter(t => t.type === 'checkin').length;
  const progressCount = active.filter(t => t.type === 'progress').length;
  const now = new Date(); now.setHours(0,0,0,0);
  const in3d = new Date(now); in3d.setDate(in3d.getDate() + 3);
  const urgentCount = tasks.filter(t =>
    t.status === 'active' && t.endDate && new Date(t.endDate) >= now && new Date(t.endDate) <= in3d
  ).length;
  const overdueCount = tasks.filter(t =>
    t.type === 'progress' && t.status === 'active' && t.endDate && new Date(t.endDate) < now && (t.progress || 0) < 100
  ).length;

  document.getElementById('cardCheckinNum').textContent = checkinCount;
  document.getElementById('cardProgressNum').textContent = progressCount;
  document.getElementById('cardOverdueNum').textContent = overdueCount;
  document.getElementById('cardUrgentNum').textContent = urgentCount;

  // Highlight active card
  document.querySelectorAll('.summary-card').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentCardFilter);
  });
}

function setCardFilter(filter) {
  if (currentCardFilter === filter) {
    currentCardFilter = '';
  } else {
    currentCardFilter = filter;
  }
  updateSummaryCards();
  renderTaskList();
}

function setStatusFilter(status) {
  currentStatusFilter = status;
  // Update chip active state
  document.querySelectorAll('.status-index-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.status === status);
  });
  // Clear card filter when switching status filter
  if (currentCardFilter) { currentCardFilter = ''; updateSummaryCards(); }
  renderTaskList();
}

function getFilteredTasks() {
  let filtered = [...tasks];

  // Card filter (type/attr quick filter)
  switch(currentCardFilter) {
    case 'checkin': filtered = filtered.filter(t => t.type === 'checkin' && t.status === currentStatusFilter); break;
    case 'progress': filtered = filtered.filter(t => t.type === 'progress' && t.status === currentStatusFilter); break;
    case 'overdue':
      const odNow = new Date(); odNow.setHours(0,0,0,0);
      filtered = filtered.filter(t => t.type === 'progress' && t.status === 'active' && t.endDate && new Date(t.endDate) < odNow && (t.progress || 0) < 100);
      break;
    case 'urgent':
      const now = new Date(); now.setHours(0,0,0,0);
      const in3d = new Date(now); in3d.setDate(in3d.getDate() + 3);
      filtered = filtered.filter(t => t.status === currentStatusFilter && t.endDate && new Date(t.endDate) >= now && new Date(t.endDate) <= in3d);
      break;
    default:
      // Default: show by currentStatusFilter
      filtered = filtered.filter(t => t.status === currentStatusFilter);
      break;
  }

  // Tag
  if (currentTag) {
    filtered = filtered.filter(t => t.tags && t.tags.includes(currentTag));
  }

  // Sort
  const rank = { p0:4, p1:3, p2:2, p3:1 };
  filtered.sort((a,b) => {
    // 1. Priority: high to low
    const pDiff = rank[b.priority||'p2'] - rank[a.priority||'p2'];
    if (pDiff !== 0) return pDiff;
    // 2. Due date: ascending (null last)
    const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
    const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
    if (aEnd !== bEnd) return aEnd - bEnd;
    // 3. Start date: ascending (null last)
    const aStart = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const bStart = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    if (aStart !== bStart) return aStart - bStart;
    // 4. Type: progress first, then checkin
    if (a.type === 'progress' && b.type !== 'progress') return -1;
    if (b.type === 'progress' && a.type !== 'progress') return 1;
    return 0;
  });

  return filtered;
}

// ===== SWIPE GESTURE =====
let swipeState = { el: null, startX: 0, startY: 0, open: false, moved: false };

function closeSwipe(el) {
  if (!el) return;
  const card = el.querySelector('.swipe-card');
  if (card) card.style.transform = 'translateX(0)';
  swipeState.open = false;
  swipeState.el = null;
}

function closeAllSwipes() {
  document.querySelectorAll('.swipe-wrap').forEach(w => closeSwipe(w));
}

function getSwipeWidth(el) {
  // Total width of action buttons
  const actions = el.querySelector('.swipe-actions');
  if (!actions) return 0;
  let w = 0;
  actions.querySelectorAll('.swipe-btn').forEach(b => w += b.offsetWidth);
  return w;
}

document.addEventListener('touchstart', (e) => {
  // --- Card swipe gesture ---
  const wrap = e.target.closest('.swipe-wrap');
  if (!wrap) { closeAllSwipes(); return; }
  if (swipeState.open && swipeState.el !== wrap) closeSwipe(swipeState.el);
  swipeState.el = wrap;
  swipeState.startX = e.touches[0].clientX;
  swipeState.startY = e.touches[0].clientY;
  swipeState.moved = false;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  // --- Card swipe gesture ---
  if (!swipeState.el) return;
  const dx2 = e.touches[0].clientX - swipeState.startX;
  const dy2 = e.touches[0].clientY - swipeState.startY;
  if (!swipeState.moved && Math.abs(dy2) > Math.abs(dx2)) { swipeState.el = null; return; }
  if (Math.abs(dx2) < 5) return;
  swipeState.moved = true;
  e.preventDefault();
  const card = swipeState.el.querySelector('.swipe-card');
  if (!card) return;
  const maxSwipe = getSwipeWidth(swipeState.el);
  if (dx2 < 0) {
    const targetX = Math.max(dx2, -maxSwipe - 16);
    card.style.transition = 'none';
    card.style.transform = `translateX(${targetX}px)`;
  } else if (swipeState.open) {
    const currentX = parseFloat(card.style.transform.replace('translateX(','').replace('px)','')) || 0;
    const targetX = Math.min(currentX + dx2 * 0.5, 0);
    card.style.transition = 'none';
    card.style.transform = `translateX(${targetX}px)`;
  }
}, { passive: false });

document.addEventListener('touchend', () => {
  // --- Card swipe gesture ---
  if (!swipeState.el) return;
  const card = swipeState.el.querySelector('.swipe-card');
  if (!card) return;
  card.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
  const maxSwipe = getSwipeWidth(swipeState.el);
  const currentX2 = parseFloat(card.style.transform.replace('translateX(','').replace('px)','')) || 0;
  if (currentX2 < -(maxSwipe * 0.4)) {
    card.style.transform = `translateX(-${maxSwipe}px)`;
    swipeState.open = true;
  } else {
    card.style.transform = 'translateX(0)';
    swipeState.open = false;
    swipeState.el = null;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('summaryCards').addEventListener('click', (e) => {
    const card = e.target.closest('.summary-card');
    if (card) setCardFilter(card.dataset.filter);
  });
  document.getElementById('taskModal').addEventListener('click', function(e) { if (e.target === this) closeTaskModal(); });
  document.getElementById('tagManagerModal').addEventListener('click', function(e) { if (e.target === this) closeTagManager(); });
  document.getElementById('newTagName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createTag(); }
  });
  document.addEventListener('click', (e) => {
    // Close swipe if clicking outside
    if (swipeState.open && !e.target.closest('.swipe-wrap')) {
      closeAllSwipes();
    }
    // Close detail menu if clicking outside
    if (!e.target.closest('.detail-menu-wrap')) {
      document.querySelectorAll('.detail-menu-dropdown.show').forEach(m => m.classList.remove('show'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('tagManagerModal').style.display === 'flex') closeTagManager();
      else if (document.getElementById('panelDetail').classList.contains('active')) closeDetailPage();
      else if (document.getElementById('taskModal').style.display === 'flex') closeTaskModal();
    }
  });
});

// ===== TAG FILTER DROPDOWN =====
function toggleTagDropdown() {
  const dd = document.getElementById('tagDropdown');
  const trigger = document.getElementById('tagFilterTrigger');
  if (dd.classList.contains('open')) {
    dd.classList.remove('open');
    trigger.classList.remove('open');
  } else {
    renderTagDropdown();
    dd.classList.add('open');
    trigger.classList.add('open');
  }
}

function renderTagDropdown() {
  const dd = document.getElementById('tagDropdown');
  syncTagsFromTasks();
  const tags = allKnownTags;

  const counts = {};
  tasks.filter(t => t.status === 'active').forEach(t => {
    if (t.tags) t.tags.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
  });

  let html = `<div class="tag-dropdown-item${!currentTag ? ' active' : ''}" onclick="selectTag('')">
    <span class="dot" style="background:#ccc;"></span>全部
    <span class="count">${tasks.filter(t=>t.status==='active').length}</span>
  </div>`;

  if (tags.length > 0) html += '<div class="tag-dropdown-divider"></div>';

  tags.forEach(tag => {
    const color = getTagColor(tag);
    const count = counts[tag] || 0;
    html += `<div class="tag-dropdown-item${currentTag === tag ? ' active' : ''}" onclick="selectTag('${tag.replace(/'/g, "\\'")}')">
      <span class="dot" style="background:${color};"></span>${escHtml(tag)}
      <span class="count">${count}</span>
    </div>`;
  });

  html += '<div class="tag-dropdown-divider"></div>';
  html += '<div class="tag-dropdown-item tag-dropdown-manage" onclick="openTagManager()"><span class="dot" style="background:var(--text3);font-size:12px;display:flex;align-items:center;justify-content:center;">⚙</span>管理标签</div>';

  dd.innerHTML = html;
}

function selectTag(tag) {
  currentTag = tag;
  document.getElementById('tagDropdown').classList.remove('open');
  document.getElementById('tagFilterTrigger').classList.remove('open');
  renderQuickCheckin();
  renderTodayTodos();
  renderTaskList();
  updateSummaryCards();
  updateTagFilterTrigger();
}

function updateTagFilterTrigger() {
  const dot = document.getElementById('tagFilterDot');
  const label = document.getElementById('tagFilterLabel');
  if (!currentTag) {
    dot.style.background = '#ccc';
    label.textContent = '全部标签';
  } else {
    dot.style.background = getTagColor(currentTag);
    label.textContent = currentTag;
  }
}

function refreshAll() {
  closeAllSwipes();
  autoActivatePending();
  renderQuickCheckin();
  renderTodayTodos();
  updateSummaryCards();
  renderTaskList();
  updateTagFilterTrigger();
  checkNotifications();
}

// 自动激活：pending 目标如果开始日期已到，自动变为 active
function autoActivatePending() {
  const today = fmtLocalDay(new Date());
  let changed = false;
  tasks.forEach(t => {
    if (t.status === 'pending' && t.startDate && t.startDate <= today) {
      t.status = 'active';
      changed = true;
    }
  });
  if (changed) saveTasks(tasks);
}

// ===== NOTIFICATIONS =====
function dismissNotifyBanner() {
  document.getElementById('notifyBanner').style.display = 'none';
  localStorage.setItem('cc_notify_banner_dismissed', '1');
}

function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('浏览器不支持通知功能'); return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      document.getElementById('notifyBanner').style.display = 'none';
      showToast('提醒已开启 🔔');
    } else {
      localStorage.setItem('cc_notify_banner_dismissed', '1');
      showToast('请在浏览器设置中允许通知');
    }
  });
}

function checkNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    if (!localStorage.getItem('cc_notify_banner_dismissed')) {
      document.getElementById('notifyBanner').style.display = 'block';
    }
    return;
  }
  document.getElementById('notifyBanner').style.display = 'none';

  const now = new Date(); now.setHours(0,0,0,0);
  const in2d = new Date(now); in2d.setDate(in2d.getDate()+2);

  const urgent = tasks.filter(t => {
    if (t.status !== 'active' || !t.endDate) return false;
    return new Date(t.endDate) >= now && new Date(t.endDate) <= in2d;
  });

  if (urgent.length > 0) {
    const notified = JSON.parse(localStorage.getItem('cc_notified_today') || '{}');
    const today = new Date().toDateString();
    if (notified[today]) return;

    const titles = urgent.map(t => t.title).join('、');
    new Notification('⏰ 目标即将到期', { body: `以下目标快到期了：${titles}`, icon: '🤖', tag: 'cc-reminder' });
    notified[today] = true;
    localStorage.setItem('cc_notified_today', JSON.stringify(notified));
  }

  // Check-in reminders: remind at 9pm if not completed
  const h = new Date().getHours();
  if (h >= 20 && h < 22) {
    const taskReminders = getCheckinTasks().filter(t => getTodayCheckinCount(t) === 0);
    if (taskReminders.length > 0) {
      const notified = JSON.parse(localStorage.getItem('cc_checkin_reminded') || '{}');
      const today = new Date().toDateString();
      if (!notified[today]) {
        const names = taskReminders.map(t => t.title).join('、');
        new Notification('🤖 别忘了今天打卡哦', { body: `尚未完成：${names}`, icon: '🤖', tag: 'cc-checkin' });
        notified[today] = true;
        localStorage.setItem('cc_checkin_reminded', JSON.stringify(notified));
      }
    }
  }
}

// ===== TOAST =====
function showToast(msg, big) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast' + (big ? ' big' : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 2500);
}

// ===== INIT =====
async function appInit() {
  await initSupabaseAuth();
  updateUserBar();
  if (!isCloudMode) {
    tasks = [];
  }
  refreshAll();
  setInterval(checkNotifications, 30 * 60 * 1000);
  // Auto-sync from cloud every 60s
  setInterval(async () => {
    if (isCloudMode && currentUser) {
      await loadTasksFromCloud();
      refreshAll();
    }
  }, 60000);
}

console.log('🤖 cc的小助理 已就绪！');
console.log('✅ 支持进度型任务和打卡型任务');
console.log('📊 数据存储在浏览器 localStorage (key: cc_assistant_data)');
console.log('🔔 提醒需在浏览器中授权通知权限');

// ===== CALENDAR NAVIGATION =====
function navCalMonth(taskId, delta) {
  const months = calMonthsCache[taskId];
  if (!months || !calNav[taskId]) return;
  const curIdx = months.findIndex(m => m.year === calNav[taskId].year && m.month === calNav[taskId].month);
  const newIdx = curIdx + delta;
  if (newIdx < 0 || newIdx >= months.length) return;
  calNav[taskId] = { year: months[newIdx].year, month: months[newIdx].month };
  openDetail(taskId);
}

function toggleCalPicker(e, taskId) {
  e.stopPropagation();
  const picker = document.getElementById('calPicker-' + taskId);
  if (!picker) return;
  // Close all other pickers
  document.querySelectorAll('.cal-month-picker').forEach(p => { if (p !== picker) p.style.display = 'none'; });
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

function pickCalMonth(taskId, year, month) {
  calNav[taskId] = { year, month };
  openDetail(taskId);
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.cal-nav-title')) {
    document.querySelectorAll('.cal-month-picker').forEach(p => p.style.display = 'none');
  }
  // Close tag dropdown when clicking outside
  const dd = document.getElementById('tagDropdown');
  const trigger = document.getElementById('tagFilterTrigger');
  if (dd.classList.contains('open') && !e.target.closest('.tag-filter-wrap')) {
    dd.classList.remove('open');
    trigger.classList.remove('open');
  }
});

// Start app
appInit();
