// ===== RENDER =====
function updateDateTime() {}

function renderQuickCheckin() {
  let checkinTasks = getCheckinTasks();
  if (currentTag) checkinTasks = checkinTasks.filter(t => t.tags && t.tags.includes(currentTag));
  // Sort: priority desc → endDate asc → startDate asc
  const rank = { p0:4, p1:3, p2:2, p3:1 };
  checkinTasks.sort((a,b) => {
    const pDiff = rank[b.priority||'p2'] - rank[a.priority||'p2'];
    if (pDiff !== 0) return pDiff;
    const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
    const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
    if (aEnd !== bEnd) return aEnd - bEnd;
    const aStart = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const bStart = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    return aStart - bStart;
  });
  const container = document.getElementById('quickCheckin');

  // No goals at all — show empty prompt
  if (tasks.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '<div class="quick-checkin-header">⚡ 待打卡</div><div class="today-todos-empty">📝 还没有任何目标，从目标管理页新建目标吧</div>';
    return;
  }

  if (checkinTasks.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '<div class="quick-checkin-header">⚡ 待打卡</div><div class="today-todos-empty">还没有打卡型目标</div>';
    return;
  }
  container.style.display = 'block';

  container.innerHTML = `
    <div class="quick-checkin-header">⚡ 待打卡</div>
    <div class="quick-items">
      ${checkinTasks.map(t => {
        const todayCount = getTodayCheckinCount(t);
        const periodCount = getPeriodCheckinCount(t);
        const checked = todayCount > 0;
        const periodLabel = getPeriodLabel(t);
        return `
          <div class="quick-item ${checked ? 'checked' : ''}" onclick="openDetail('${t.id}')" id="quick-${t.id}">
            <div class="quick-item-icon">${getCheckinIcon(t.title)}</div>
            <div class="quick-item-info">
              <div class="quick-item-title">${escHtml(t.title)}</div>
              <div class="quick-item-sub">${periodLabel} ${periodCount}/${t.targetCount} 次</div>
            </div>
            <div class="quick-item-badge ${checked ? 'done' : ''}" onclick="event.stopPropagation();quickCheckin('${t.id}')">${checked ? '✓' : '打卡'}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function quickCheckin(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const { start, end } = getTodayRange();
  const todayCheckins = task.checkins.filter(c => {
    const d = new Date(c);
    return d >= start && d < end;
  });

  if (todayCheckins.length > 0) {
    // 取消打卡：移除今天的所有打卡记录
    task.checkins = task.checkins.filter(c => {
      const d = new Date(c);
      return !(d >= start && d < end);
    });
    saveTasks(tasks);
    refreshAll();
    showToast('已取消打卡');
    return;
  }

  task.checkins.push(new Date().toISOString());
  saveTasks(tasks);
  refreshAll();
  const periodCount = getPeriodCheckinCount(task);
  const periodLabel = getPeriodLabel(task);
  if (periodCount >= task.targetCount) {
    showToast(`🎉 打卡成功！${periodLabel}目标达成！(${periodCount}/${task.targetCount})`, true);
  } else {
    showToast('打卡成功！👍');
  }
}

function getCheckinIcon(title) {
  const t = title.toLowerCase();
  if (t.includes('锻炼') || t.includes('运动') || t.includes('跑步') || t.includes('健身')) return '🏃';
  if (t.includes('阅读') || t.includes('读书') || t.includes('看书')) return '📖';
  if (t.includes('冥想') || t.includes('静坐')) return '🧘';
  if (t.includes('早睡') || t.includes('早起') || t.includes('睡眠')) return '😴';
  if (t.includes('水') || t.includes('喝水') || t.includes('饮')) return '💧';
  if (t.includes('学习') || t.includes('课程') || t.includes('课')) return '📚';
  if (t.includes('写作') || t.includes('写') || t.includes('日记')) return '✍️';
  if (t.includes('视频') || t.includes('内容') || t.includes('创作')) return '🎬';
  return '✅';
}

function renderTaskList() {
  const list = document.getElementById('taskList');
  const filtered = getFilteredTasks();

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏁</div>
        <div class="empty-title">还没有目标呢</div>
        <div class="empty-desc">点击"新建目标"，设定你的第一个目标或打卡习惯，我会帮你盯着进度。</div>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(t => {
    const cardHTML = t.type === 'checkin' ? renderCheckinCard(t) : renderProgressCard(t);
    const actionsHTML = getSwipeActions(t);
    return `<div class="swipe-wrap" data-taskid="${t.id}">
      <div class="swipe-actions">${actionsHTML}</div>
      <div class="swipe-card" onclick="openDetail('${t.id}')">${cardHTML}</div>
    </div>`;
  }).join('');
}

// ===== SWIPE ACTIONS =====
function getSwipeActions(t) {
  if (t.status === 'completed' || t.status === 'cancelled') {
    return `
    <button class="swipe-btn swipe-start" onclick="event.stopPropagation();toggleStatusFromList('${t.id}','active')">激活</button>
    <button class="swipe-btn swipe-delete" onclick="event.stopPropagation();deleteTaskFromList('${t.id}')">删除</button>`;
  }
  if (t.status === 'pending') {
    return `
    <button class="swipe-btn swipe-start" onclick="event.stopPropagation();toggleStatusFromList('${t.id}','active')">开始</button>
    <button class="swipe-btn swipe-cancel" onclick="event.stopPropagation();toggleStatusFromList('${t.id}','cancelled')">取消</button>
    <button class="swipe-btn swipe-delete" onclick="event.stopPropagation();deleteTaskFromList('${t.id}')">删除</button>`;
  }
  return `
    <button class="swipe-btn swipe-complete" onclick="event.stopPropagation();toggleStatusFromList('${t.id}','completed')">完成</button>
    <button class="swipe-btn swipe-cancel" onclick="event.stopPropagation();toggleStatusFromList('${t.id}','cancelled')">取消</button>
    <button class="swipe-btn swipe-delete" onclick="event.stopPropagation();deleteTaskFromList('${t.id}')">删除</button>`;
}

function toggleStatusFromList(taskId, newStatus) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  const oldStatus = t.status;
  t.status = newStatus;
  if (oldStatus === 'pending' && newStatus === 'active') {
    t.startDate = fmtLocalDay(new Date());
  }
  if (newStatus === 'completed' && t.type === 'progress') { t.progress = 100; markAllTodosDone(t.todos); }
  saveTasks(tasks);
  refreshAll();
  if (oldStatus === 'pending' && newStatus === 'active') showToast('目标已开始 🚀');
  else if (newStatus === 'completed') showToast('目标已完成 🎉');
  else if (newStatus === 'cancelled') showToast('目标已取消');
  else if (newStatus === 'active') showToast('目标已重新激活 🔄');
}

function deleteTaskFromList(taskId) {
  if (!confirm('确定要删除这个目标吗？相关的打卡记录和笔记也会一并删除。')) return;
  tasks = tasks.filter(t => t.id !== taskId);
  saveTasks(tasks);
  refreshAll();
  showToast('目标已删除');
}

function renderProgressCard(t) {
  const todos = t.todos || [];
  const allCount = countAllTodos(todos);
  const incomplete = countIncompleteTodos(todos);
  return `
    <div class="card${t.status==='completed'?' card-completed':''}${t.status==='pending'?' card-pending':''}${t.status==='cancelled'?' card-cancelled':''}" style="border-left-color:${getTaskColor(t)}">
      <div class="card-top">
        <div style="flex:1;min-width:0;">
          <div class="card-title"><span class="priority-badge priority-badge-${t.priority||'p2'}">${priorityLabel(t.priority)}</span>${escHtml(t.title)}</div>
          ${t.desc ? `<div class="card-desc">${escHtml(t.desc)}</div>` : ''}
        </div>
        ${isOverdue(t) ? '<span class="card-badge overdue">⏰ ' + overdueText(t) + '</span>' : isUrgent(t) ? '<span class="card-badge urgent">⚠ ' + urgentText(t) + '</span>' : ''}
      </div>
      <div class="progress-section">
        <div class="progress-row">
          <div class="progress-bar">
            <div class="progress-fill ${progressClass(t.progress||0)}" style="width:${t.progress||0}%"></div>
          </div>
          <span class="progress-pct">${t.progress || 0}%</span>
        </div>
      </div>
      <div class="card-meta">
        <span class="note-count">📋 待办: ${incomplete}/${allCount}</span>
      </div>
    </div>
  `;
}

function renderCheckinCard(t) {
  const count = getPeriodCheckinCount(t);
  const target = t.targetCount || 3;
  const freqLabel = getPeriodLabel(t);
  const exceeding = count > target;
  const atTarget = count >= target;

  // Dots: show target count as standard, plus any excess
  const dots = [];
  const dotCount = Math.max(target, count);
  for (let i = 0; i < dotCount; i++) {
    const isExtra = i >= target && i < count;
    dots.push(`<div class="checkin-dot ${i < count ? 'done' : ''}${isExtra ? ' extra' : ''}">${i < count ? '✓' : ''}</div>`);
  }

  const freqText = t.frequency === 'daily' ? '每天' : `每${getPeriodUnit(t)}`;
  return `
    <div class="card${t.status==='completed'?' card-completed':''}${t.status==='pending'?' card-pending':''}${t.status==='cancelled'?' card-cancelled':''}" style="border-left-color:${getTaskColor(t)}">
      <div class="card-top">
        <div style="flex:1;min-width:0;">
          <div class="card-title"><span class="priority-badge priority-badge-${t.priority||'p2'}">${priorityLabel(t.priority)}</span>${escHtml(t.title)}</div>
          ${t.desc ? `<div class="card-desc">${escHtml(t.desc)}</div>` : ''}
        </div>
        ${isUrgent(t) ? '<span class="card-badge urgent">⚠ ' + urgentText(t) + '</span>' : ''}
      </div>
      <div class="checkin-row" onclick="event.stopPropagation();quickCheckin('${t.id}')">
        <div class="checkin-dots">${dots.join('')}</div>
        <div class="checkin-count ${atTarget?'done':''} ${exceeding?'exceeding':''}">${freqLabel} ${count}/${target} 次${exceeding?' 🔥':''}</div>
      </div>
      <div class="card-meta">
        <span class="note-count">🔥 坚持${(t.checkins||[]).length}天</span>
      </div>
    </div>
  `;
}

// ===== HELPERS =====
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function updateTargetCountMax() {
  const freq = document.getElementById('taskFrequency').value;
  const maxByFreq = { daily: 1, weekly: 7, monthly: 31, quarterly: 92, yearly: 366 };
  const max = maxByFreq[freq] || 31;
  const input = document.getElementById('taskTargetCount');
  input.max = max;
  if (parseInt(input.value) > max) input.value = max;
}
function progressClass(p) { if(p>=80)return'high'; if(p>=40)return''; if(p>=20)return'warning'; return'danger'; }
function isUrgent(t) {
  if (t.status !== 'active' || !t.endDate) return false;
  const now = new Date(); now.setHours(0,0,0,0);
  const in3d = new Date(now); in3d.setDate(in3d.getDate()+3);
  return new Date(t.endDate) >= now && new Date(t.endDate) <= in3d;
}
function isOverdue(t) {
  if (t.type !== 'progress' || t.status !== 'active' || !t.endDate) return false;
  const now = new Date(); now.setHours(0,0,0,0);
  return new Date(t.endDate) < now && (t.progress || 0) < 100;
}
function daysLeft(endDate) {
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(endDate);
  const diff = Math.ceil((end-now)/(86400000));
  if (diff<0) return '已过期'; if (diff===0) return '今天到期'; if (diff===1) return '明天到期';
  return `剩余 ${diff} 天`;
}
function overdueText(t) {
  if (!t.endDate) return '';
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(t.endDate);
  const n = Math.ceil((now - end) / 86400000);
  return `超时${n}天`;
}
function urgentText(t) {
  if (!t.endDate) return '';
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(t.endDate);
  const n = Math.ceil((end - now) / 86400000);
  if (n === 0) return '今天到期';
  return `剩余${n}天`;
}
function priorityLabel(p) { return {p0:'P0',p1:'P1',p2:'P2',p3:'P3'}[p]||'P2'; }
function statusLabel(s) { return {active:'进行中',completed:'已完成',cancelled:'已取消'}[s]||s; }

// ===== TYPE SWITCH =====
function switchType(type) {
  currentFormType = type;
  document.getElementById('taskEditType').value = type;
  document.querySelectorAll('.type-option').forEach(o => o.classList.remove('active'));
  document.querySelector(`.type-option[data-type="${type}"]`).classList.add('active');

  document.getElementById('progressFields').style.display = type === 'progress' ? '' : 'none';
  document.getElementById('checkinFields').style.display = type === 'checkin' ? '' : 'none';

  // Toggle date required hint
  document.getElementById('dateRequired').textContent = type === 'progress' ? '*' : '';
}

// ===== TAG PICKER (FORM) =====
function renderTagPicker() {
  const container = document.getElementById('tagPicker');
  const emptyHint = document.getElementById('tagPickerEmpty');
  if (allKnownTags.length === 0) {
    container.innerHTML = '';
    emptyHint.style.display = 'block';
    return;
  }
  emptyHint.style.display = 'none';
  container.innerHTML = allKnownTags.map(tag => `
    <span class="tag-picker-chip${formTag === tag ? ' selected' : ''}" onclick="toggleFormTag('${escHtml(tag)}')" style="${formTag === tag ? 'background:' + getTagColor(tag) + ';border-color:' + getTagColor(tag) : ''}">${escHtml(tag)}</span>
  `).join('') + '<span class="tag-manage-link" style="margin-left:4px" onclick="openTagManager()">⚙️</span>';
}

function toggleFormTag(tag) {
  formTag = formTag === tag ? '' : tag;
  renderTagPicker();
}

function clearFormTags() { formTag = ''; renderTagPicker(); }
function loadFormTags(tags) { formTag = (tags && tags.length > 0) ? tags[0] : ''; renderTagPicker(); }

// ===== TAG MANAGER =====
function openTagManager() {
  renderTagManager();
  document.getElementById('tagManagerModal').style.display = 'flex';
}

function closeTagManager() {
  openColorPickerIdx = -1;
  document.getElementById('tagManagerModal').style.display = 'none';
}

function renderTagManager() {
  const container = document.getElementById('tagManagerList');
  // Count usage per tag
  const counts = {};
  tasks.forEach(t => { if (t.tags) t.tags.forEach(tag => { counts[tag] = (counts[tag]||0)+1; }); });
  if (allKnownTags.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:14px;">还没有标签，在下方创建第一个吧</div>';
    return;
  }
  container.innerHTML = allKnownTags.map((tag, i) => {
    const tc = getTagColor(tag);
    return `
    <div class="tag-mgmt-item" id="tagMgmt-${i}">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <span class="tag-color-dot" style="background:${tc}" onclick="toggleColorPicker(${i},'${escHtml(tag)}')" title="更改颜色"></span>
        <div style="min-width:0;">
          <span class="tag-mgmt-name" id="tagMgmtName-${i}">${escHtml(tag)}</span>
          ${counts[tag] ? `<span class="tag-mgmt-count">${counts[tag]}个目标</span>` : ''}
        </div>
      </div>
      <div class="tag-mgmt-actions">
        <button class="btn btn-sm" style="font-size:11px;padding:3px 8px;" onclick="startRenameTag(${i},'${escHtml(tag)}')">✏️</button>
        <button class="btn btn-sm" style="font-size:11px;padding:3px 8px;color:var(--danger);" onclick="deleteTag(${i},'${escHtml(tag)}')">🗑️</button>
      </div>
    </div>
    <div class="tag-color-palette" id="palette-${i}" style="display:none">
      ${TAG_COLORS.map(c => `<span class="tag-color-option${tc===c?' selected':''}" style="background:${c}" onclick="setTagColor('${escHtml(tag)}','${c}')"></span>`).join('')}
    </div>`;
  }).join('');
}

function createTag() {
  const input = document.getElementById('newTagName');
  const name = input.value.trim();
  if (!name) return;
  if (allKnownTags.includes(name)) { showToast('标签已存在'); return; }
  allKnownTags.push(name);
  allKnownTags.sort();
  saveTags();
  input.value = '';
  renderTagManager();
  // Refresh tag picker in open forms
  renderTagPicker();
  showToast('标签已创建 🏷️');
}

function startRenameTag(idx, oldName) {
  const nameSpan = document.getElementById('tagMgmtName-' + idx);
  nameSpan.innerHTML = `<input class="tag-mgmt-rename-input" id="renameInput-${idx}" value="${escHtml(oldName)}" onkeydown="if(event.key==='Enter')confirmRenameTag(${idx},'${escHtml(oldName)}')" onblur="confirmRenameTag(${idx},'${escHtml(oldName)}')">`;
  const inp = document.getElementById('renameInput-' + idx);
  inp.focus();
  inp.select();
}

function confirmRenameTag(idx, oldName) {
  const inp = document.getElementById('renameInput-' + idx);
  if (!inp) return;
  const newName = inp.value.trim();
  if (!newName || newName === oldName) { renderTagManager(); return; }
  if (allKnownTags.includes(newName)) { showToast('标签名已存在'); renderTagManager(); return; }
  // Update tag list
  allKnownTags = allKnownTags.filter(t => t !== oldName);
  allKnownTags.push(newName);
  allKnownTags.sort();
  saveTags();
  // Update all tasks that use old tag
  tasks.forEach(t => { if (t.tags) t.tags = t.tags.map(tag => tag===oldName? newName : tag); });
  saveTasks(tasks);
  // Move tag color to new name
  if (tagColors[oldName]) { tagColors[newName] = tagColors[oldName]; delete tagColors[oldName]; saveTagColors(); }
  // If form has old tag selected, swap it
  if (formTag === oldName) { formTag = newName; }
  renderTagManager();
  renderTagPicker();
  renderTaskList();
  showToast('标签已重命名 ✏️');
}

function deleteTag(idx, tag) {
  if (!confirm(`确定删除标签「${tag}」？将从所有目标中移除此标签。`)) return;
  allKnownTags = allKnownTags.filter(t => t !== tag);
  saveTags();
  // Remove from all tasks
  tasks.forEach(t => { if (t.tags) t.tags = t.tags.filter(tg => tg !== tag); });
  saveTasks(tasks);
  if (formTag === tag) formTag = '';
  delete tagColors[tag]; saveTagColors();
  renderTagManager();
  renderTagPicker();
  renderTaskList();
  showToast('标签已删除 🗑️');
}

// ===== COLOR PICKER =====
let openColorPickerIdx = -1;

function toggleColorPicker(idx, tag) {
  // Close any open palette first
  if (openColorPickerIdx >= 0) {
    const prev = document.getElementById('palette-' + openColorPickerIdx);
    if (prev) prev.style.display = 'none';
  }
  // Toggle the clicked one
  if (openColorPickerIdx === idx) {
    openColorPickerIdx = -1;
  } else {
    const el = document.getElementById('palette-' + idx);
    if (el) el.style.display = 'flex';
    openColorPickerIdx = idx;
  }
}

function setTagColor(tag, color) {
  tagColors[tag] = color;
  saveTagColors();
  openColorPickerIdx = -1;
  renderTagManager();
  renderTagPicker();
  renderTaskList();
}

// ===== TAB SWITCH =====
function switchTab(name) {
  closeAllSwipes();
  previousTab = name;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const header = document.querySelector('header');
  if (name === 'today') {
    document.querySelector('.tab-bar .tab-btn:first-child').classList.add('active');
    document.getElementById('panelToday').classList.add('active');
    if (header) header.style.display = 'none';
    renderQuickCheckin();
    renderTodayTodos();
    updateTagFilterTrigger();
  } else {
    document.querySelector('.tab-bar .tab-btn:last-child').classList.add('active');
    document.getElementById('panelTasks').classList.add('active');
    if (header) header.style.display = '';
    renderTaskList();
    checkNotifications();
  }
}

// ===== TODAY TODOS =====
function renderTodayTodos() {
  const container = document.getElementById('todayTodos');

  // No goals at all — show empty prompt
  if (tasks.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '<div class="today-todos-header">📋 目标to do</div><div class="today-todos-empty">📝 还没有任何目标，从目标管理页新建目标吧</div>';
    return;
  }

  let progressTasks = tasks.filter(t => t.type === 'progress' && t.status === 'active' && t.todos && t.todos.length > 0);
  if (currentTag) progressTasks = progressTasks.filter(t => t.tags && t.tags.includes(currentTag));
  // Sort: priority desc → endDate asc → startDate asc
  const rank = { p0:4, p1:3, p2:2, p3:1 };
  progressTasks.sort((a,b) => {
    const pDiff = rank[b.priority||'p2'] - rank[a.priority||'p2'];
    if (pDiff !== 0) return pDiff;
    const aEnd = a.endDate ? new Date(a.endDate).getTime() : Infinity;
    const bEnd = b.endDate ? new Date(b.endDate).getTime() : Infinity;
    if (aEnd !== bEnd) return aEnd - bEnd;
    const aStart = a.startDate ? new Date(a.startDate).getTime() : Infinity;
    const bStart = b.startDate ? new Date(b.startDate).getTime() : Infinity;
    return aStart - bStart;
  });
  
  // Collect visible todos: undone + completed today (before 2 AM tomorrow)
  const tasksWithTodos = [];
  progressTasks.forEach(t => {
    const visible = collectVisibleFlat(t.todos || [], 0, collapsedTodoIds);
    if (visible.length > 0) {
      tasksWithTodos.push({ task: t, todos: visible });
    }
  });

  if (tasksWithTodos.length === 0) {
    container.style.display = 'block';
    container.innerHTML = '<div class="today-todos-header">📋 目标to do</div><div class="today-todos-empty">📝 还没有任何目标，从目标管理页新建目标吧</div>';
    const chkH = (document.getElementById('quickCheckin') && document.getElementById('quickCheckin').style.display !== 'none') ? document.getElementById('quickCheckin').offsetHeight : 0;
    const th = container.querySelector('.today-todos-header');
    if (th) th.style.top = chkH + 'px';
    return;
  }

  container.style.display = 'block';
  let html = '<div class="today-todos-header">📋 目标to do</div>';
  tasksWithTodos.forEach(({ task, todos }) => {
    const tagColor = task.tags && task.tags.length > 0 ? getTagColor(task.tags[0]) : null;
    const bgStyle = tagColor ? `background: ${tagColor}0D; border-radius: 8px; padding: 10px 12px;` : '';
    html += `<div class="today-todo-group" style="${bgStyle}">
      <div class="today-todo-task-title" onclick="openDetail('${task.id}')"><span class="priority-badge priority-badge-${task.priority||'p2'}">${priorityLabel(task.priority)}</span>${escHtml(task.title)} <span style="font-weight:400;color:var(--text3);font-size:12px">(${todos.length}项)</span></div>`;
    todos.forEach(todo => {
      const padLeft = (todo._depth || 0) * 20;
      const doneCls = todo._completedToday ? ' done' : '';
      const isCollapsed = collapsedTodoIds.has(todo.id);
      const textExtra = todo._hasChildren ? (isCollapsed ? ' ▸' : ' ▾') : '';
      const clickAction = todo._hasChildren ? ` onclick="event.stopPropagation();toggleCollapseTodo('${todo.id}','${task.id}')"` : '';
      html += `<div class="today-todo-item${doneCls}" data-todoid="${todo.id}" style="padding-left:${12 + padLeft}px">
        <div class="todo-check" onclick="toggleTodoToday('${task.id}','${todo.id}')"></div>
        <span class="todo-text${todo._hasChildren ? ' has-children' : ''}"${clickAction}>${escHtml(todo.text)}${textExtra}</span>
      </div>`;
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

// ===== FORM HELPERS =====

// ===== TASK CRUD =====
function openTaskModal(taskId) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskEditId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskStart').value = '';
  document.getElementById('taskEnd').value = '';
  document.getElementById('taskPriority').value = 'p2';
  document.getElementById('taskPriorityC').value = 'p2';
  document.getElementById('taskProgress').value = '0';
  document.getElementById('taskFrequency').value = 'weekly';
  document.getElementById('taskTargetCount').value = '3';
  clearFormTags();

  if (taskId) {
    const t = tasks.find(x => x.id === taskId);
    if (t) {
      document.getElementById('taskEditId').value = t.id;
      document.getElementById('taskTitle').value = t.title;
      document.getElementById('taskDesc').value = t.desc || '';
      if (t.type === 'checkin') {
        switchType('checkin');
        document.getElementById('taskFrequency').value = t.frequency || 'weekly';
        document.getElementById('taskTargetCount').value = t.targetCount || 3;
        document.getElementById('taskPriorityC').value = t.priority || 'p2';
        document.getElementById('taskStart').value = t.startDate || '';
        document.getElementById('taskEnd').value = t.endDate || '';
      } else {
        switchType('progress');
        document.getElementById('taskStart').value = t.startDate || '';
        document.getElementById('taskEnd').value = t.endDate || '';
        document.getElementById('taskPriority').value = t.priority || 'p2';
        document.getElementById('taskProgress').value = t.progress || 0;
      }
      document.getElementById('modalTitle').textContent = '编辑目标';
      document.getElementById('saveTaskBtn').textContent = '保存修改';
      loadFormTags(t.tags || []);
    }
  } else {
    switchType('progress');
    const today = fmtLocalDay(new Date());
    const nextMonth = fmtLocalDay(new Date(Date.now()+30*86400000));
    document.getElementById('taskStart').value = today;
    document.getElementById('taskEnd').value = nextMonth;
    document.getElementById('modalTitle').textContent = '新建目标';
    document.getElementById('saveTaskBtn').textContent = '创建';
  }

  updateTargetCountMax();
  modal.style.display = 'flex';
}

function closeTaskModal() { document.getElementById('taskModal').style.display = 'none'; }

function saveTask() {
  const editId = document.getElementById('taskEditId').value;
  const title = document.getElementById('taskTitle').value.trim();
  const desc = document.getElementById('taskDesc').value.trim();
  const type = document.getElementById('taskEditType').value || currentFormType;

  if (!title) { showToast('请输入目标名称'); return; }

  if (type === 'checkin') {
    const frequency = document.getElementById('taskFrequency').value;
    const targetCount = parseInt(document.getElementById('taskTargetCount').value) || 3;

    // Validate: target count must not exceed frequency limit
    const maxByFreq = { daily: 1, weekly: 7, monthly: 31, quarterly: 92, yearly: 366 };
    const freqMax = maxByFreq[frequency] || 31;
    if (targetCount > freqMax) {
      showToast(`频率为"${document.getElementById('taskFrequency').selectedOptions[0].text}"时，目标次数不能超过 ${freqMax} 次`);
      return;
    }

    const priority = document.getElementById('taskPriorityC').value;
    const startDate = document.getElementById('taskStart').value;
    const endDate = document.getElementById('taskEnd').value;

    if (editId) {
      const t = tasks.find(x => x.id === editId);
      if (t) {
        t.title = title; t.desc = desc; t.frequency = frequency;
        t.targetCount = targetCount; t.priority = priority;
        t.startDate = startDate; t.endDate = endDate;
        t.type = 'checkin';
        if (!t.checkins) t.checkins = [];
        t.tags = formTag ? [formTag] : [];
      }
    } else {
      tasks.push({
        id: uid(), title, desc, type: 'checkin',
        frequency, targetCount, priority,
        startDate, endDate,
        tags: formTag ? [formTag] : [],
        status: getInitialStatus(startDate), checkins: [], notes: [],
        createdAt: new Date().toISOString()
      });
    }
  } else {
    const startDate = document.getElementById('taskStart').value;
    const endDate = document.getElementById('taskEnd').value;
    const priority = document.getElementById('taskPriority').value;
    const progress = parseInt(document.getElementById('taskProgress').value) || 0;

    if (!endDate) { showToast('请选择截止日期'); return; }

    if (editId) {
      const t = tasks.find(x => x.id === editId);
      if (t) {
        t.title = title; t.desc = desc; t.startDate = startDate;
        t.endDate = endDate; t.priority = priority; t.progress = progress;
        t.type = 'progress';
        if (!t.checkins) t.checkins = [];
        t.tags = formTag ? [formTag] : [];
      }
    } else {
      tasks.push({
        id: uid(), title, desc, type: 'progress',
        startDate, endDate, priority, progress,
        tags: formTag ? [formTag] : [],
        status: getInitialStatus(startDate), notes: [],
        createdAt: new Date().toISOString()
      });
    }
  }

  saveTasks(tasks);
  closeTaskModal();
  refreshAll();
  showToast(editId ? '目标已更新 ✅' : '目标创建成功 🎯');
  // If detail page is open, refresh it
  if (editId && document.getElementById('panelDetail').classList.contains('active')) {
    openDetail(editId);
  }
}

function deleteTask(taskId) {
  if (!confirm('确定要删除这个目标吗？相关的打卡记录和笔记也会一并删除。')) return;
  tasks = tasks.filter(t => t.id !== taskId);
  saveTasks(tasks);
  closeDetailPage();
  refreshAll();
  showToast('目标已删除');
}

function toggleStatus(taskId, newStatus) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  const oldStatus = t.status;
  t.status = newStatus;
  // 手动开始目标时，更新开始日期为今天
  if (oldStatus === 'pending' && newStatus === 'active') {
    t.startDate = fmtLocalDay(new Date());
  }
  if (newStatus === 'completed' && t.type === 'progress') { t.progress = 100; markAllTodosDone(t.todos); }
  saveTasks(tasks);
  refreshAll();
  openDetail(taskId);
  if (oldStatus === 'pending' && newStatus === 'active') showToast('目标已开始 🚀');
  else if (newStatus === 'completed') showToast('目标已完成 🎉');
  else if (newStatus === 'cancelled') showToast('目标已取消');
  else if (newStatus === 'active') showToast('目标已重新激活 🔄');
}

// ===== PROGRESS UPDATE =====
function syncProgress(taskId, val, src) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || t.status !== 'active') return;
  const pct = Math.min(100, Math.max(0, parseInt(val) || 0));
  t.progress = pct;
  if (pct >= 100) { t.status = 'completed'; markAllTodosDone(t.todos); }
  saveTasks(tasks);
  // Sync the other control in the DOM
  const panelDetail = document.getElementById('panelDetail');
  if (!panelDetail || !panelDetail.classList.contains('active')) return;
  const detail = document.getElementById('detailPageBody');
  if (!detail) return;
  const slider = detail.querySelector('.progress-slider-row input[type="range"]');
  const number = detail.querySelector('.progress-slider-row input[type="number"]');
  if (src === 'slider' && number) { number.value = pct; }
  if (src === 'number' && slider) { slider.value = pct; }
  if (slider) { slider.style.setProperty('--pct', pct + '%'); }
  // Also refresh the list behind the modal
  renderTaskList();
  showToast(`进度更新至 ${pct}%`);
}

// ===== CHECKIN =====
function doCheckin(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || t.status !== 'active') return;

  const todayStr = fmtLocalDay(new Date());
  const idx = (t.checkins || []).findIndex(c => fmtLocalDay(new Date(c)) === todayStr);

  if (idx >= 0) {
    // 今天已打卡 → 取消打卡
    t.checkins.splice(idx, 1);
    saveTasks(tasks);
    refreshAll();
    openDetail(taskId);
    showToast('已取消今日打卡');
    return;
  }

  // 正常打卡
  t.checkins.push(new Date().toISOString());
  saveTasks(tasks);
  refreshAll();
  openDetail(taskId);
  const periodCount = getPeriodCheckinCount(t);
  const periodLabel = getPeriodLabel(t);
  if (periodCount >= t.targetCount) {
    showToast(`🎉 打卡成功！${periodLabel}目标达成！(${periodCount}/${t.targetCount})`, true);
  } else {
    showToast('打卡成功！👍');
  }
}

// ===== NOTES =====
function addNote(taskId) {
  const textarea = document.getElementById('noteTextarea');
  const text = textarea.value.trim();
  if (!text) return;

  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  if (!t.notes) t.notes = [];
  t.notes.push({ text, date: new Date().toISOString() });
  saveTasks(tasks);
  textarea.value = '';
  refreshAll();
  openDetail(taskId);
  showToast('笔记已保存 📝');
}

function deleteNote(taskId, noteDate, noteText) {
  if (!confirm('确定要删除这条笔记吗？')) return;
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.notes) return;
  const idx = t.notes.findIndex(n => n.date === noteDate && n.text === noteText);
  if (idx === -1) return;
  t.notes.splice(idx, 1);
  saveTasks(tasks);
  refreshAll();
  openDetail(taskId);
}

// ===== DETAIL MODAL =====
function openDetail(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  currentDetailTaskId = taskId;

  // Remember which tab we came from
  if (document.getElementById('panelToday').classList.contains('active')) {
    previousTab = 'today';
  } else {
    previousTab = 'tasks';
  }

  // Hide tab bar and FAB
  document.querySelector('.tab-bar').style.display = 'none';
  document.querySelector('.container').style.paddingBottom = '0';
  document.getElementById('fabNewTask').style.display = 'none';
  document.getElementById('tagFilterWrap').style.display = 'none';

  // Set title and inject menu
  document.getElementById('detailPageTitle').textContent = t.title;
  document.getElementById('detailMenuPlaceholder').innerHTML = detailMenuBtn(t);

  // Render content into detail body
  const container = document.getElementById('detailPageBody');
  if (t.type === 'checkin') {
    renderCheckinDetail(container, t);
  } else {
    renderProgressDetail(container, t);
  }

  // Activate detail panel
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panelDetail').classList.add('active');
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

function closeDetailPage() {
  currentDetailTaskId = null;
  document.getElementById('detailMenuPlaceholder').innerHTML = '';
  document.body.style.overflow = '';
  document.querySelector('.tab-bar').style.display = '';
  document.querySelector('.container').style.paddingBottom = '';
  document.getElementById('panelDetail').classList.remove('active');
  document.getElementById('fabNewTask').style.display = '';
  document.getElementById('tagFilterWrap').style.display = '';
  // Restore the tab the user came from
  if (previousTab === 'today') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-bar .tab-btn:first-child').classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panelToday').classList.add('active');
    renderQuickCheckin();
    renderTodayTodos();
  } else {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-bar .tab-btn:last-child').classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panelTasks').classList.add('active');
    renderTaskList();
  }
}

function renderProgressDetail(container, t) {
  const notes = t.notes || [];
  container.innerHTML = `
    <div style="background:#FFFFFE;border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;">
    ${t.desc ? `<p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:16px;"><b style="color:var(--text)">描述：</b>${escHtml(t.desc)}</p>` : ''}
    <div class="card-tags" style="${t.desc ? '' : 'margin-bottom:16px;'}">
      ${(t.tags||[]).map(tag => `<span class="tag tag-custom" style="background:${getTagColor(tag)}20;color:${getTagColor(tag)};border-color:${getTagColor(tag)}40;">${escHtml(tag)}</span>`).join('')}
      <span class="tag tag-priority-${t.priority}">${priorityLabel(t.priority)}</span>
      ${isUrgent(t) ? '<span class="tag tag-urgent">⚠ ' + urgentText(t) + '</span>' : ''}
      ${isOverdue(t) ? '<span class="tag tag-overdue">⏰ ' + overdueText(t) + '</span>' : ''}
    </div>
    <div class="progress-interactive">
      <div class="progress-slider-row">
        <input type="range" value="${t.progress||0}" min="0" max="100" style="--pct:${t.progress||0}%" oninput="syncProgress('${t.id}', this.value, 'slider')"${t.status==='pending'?' disabled':''}>
        <input type="number" value="${t.progress||0}" min="0" max="100" onchange="syncProgress('${t.id}', this.value, 'number')"${t.status==='pending'?' disabled style="opacity:0.5"':''}><span style="font-size:18px;font-weight:700;color:var(--text2);">%</span>
      </div>
    </div>
    </div>
    ${todoSection(t)}
    <div class="card-meta" style="font-size:13px;margin-bottom:20px">
      <span>🔄 周期：${t.startDate||'未设'} ~ ${t.endDate||'未设'}</span>
      ${t.endDate ? '<span>⏳ '+daysLeft(t.endDate)+'</span>' : ''}
    </div>
    ${notesSection(t, notes)}
  `;
}

function renderCheckinDetail(container, t) {
  const notes = t.notes || [];
  const count = getPeriodCheckinCount(t);
  const todayCount = getTodayCheckinCount(t);
  const target = t.targetCount || 3;
  const periodLabel = getPeriodLabel(t);
  const periodUnit = getPeriodUnit(t);
  const exceeding = count > target;
  const atTarget = count >= target;
  const freqText = t.frequency === 'daily' ? '每天' : `每${periodUnit}`;

  // Build proper calendar grid per month from startDate to endDate
  const now = new Date();
  const todayStr = fmtLocalDay(now);
  const checkinSet = new Set((t.checkins || []).map(c => fmtLocalDay(new Date(c))));
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  function buildMonthCalendar(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();
    // Sunday-first: getDay() 0=Sun → position 0
    const startDow = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startDow; i++) { days.push({ empty: true }); }
    for (let d = 1; d <= totalDays; d++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const done = checkinSet.has(ds);
      const isToday = ds === todayStr;
      days.push({ day: d, done, isToday });
    }
    const rem = days.length % 7;
    if (rem) { for (let i = 0; i < 7 - rem; i++) { days.push({ empty: true }); } }

    const dayCells = days.map(c => {
      if (c.empty) return '<div class="cal-day empty"></div>';
      const cls = ['cal-day', c.done ? 'done' : '', c.isToday ? 'today' : ''].filter(Boolean).join(' ');
      return `<div class="cal-day ${cls}">${c.done ? '✓' : c.day}</div>`;
    }).join('');

    return `<div class="cal-grid">
      <div class="cal-weekday">日</div><div class="cal-weekday">一</div><div class="cal-weekday">二</div><div class="cal-weekday">三</div>
      <div class="cal-weekday">四</div><div class="cal-weekday">五</div><div class="cal-weekday">六</div>
      ${dayCells}
    </div>`;
  }

  // Build months list for navigation
  const calMonths = [];
  if (t.frequency === 'yearly') {
    const year = t.startDate ? parseInt(t.startDate.split('-')[0]) : now.getFullYear();
    for (let m = 0; m < 12; m++) { calMonths.push({ year, month: m }); }
  } else {
    const s = t.startDate ? new Date(t.startDate + 'T00:00:00') : now;
    const e = t.endDate ? new Date(t.endDate + 'T00:00:00') : new Date(s.getFullYear(), s.getMonth() + 1, 0);
    let cursor = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cursor <= e) {
      calMonths.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  calMonthsCache[t.id] = calMonths;

  // Set or clamp navigation state
  if (!calNav[t.id]) calNav[t.id] = { year: now.getFullYear(), month: now.getMonth() };
  let dispIdx = calMonths.findIndex(m => m.year === calNav[t.id].year && m.month === calNav[t.id].month);
  if (dispIdx < 0) { dispIdx = 0; calNav[t.id] = { year: calMonths[0].year, month: calMonths[0].month }; }
  const cur = calMonths[dispIdx];
  const hasPrev = dispIdx > 0;
  const hasNext = dispIdx < calMonths.length - 1;

  const calHtml = `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="navCalMonth('${t.id}', -1)"${hasPrev ? '' : ' disabled'}>◀</button>
      <span class="cal-nav-title" onclick="event.stopPropagation();toggleCalPicker(event,'${t.id}')" style="position:relative;">
        ${cur.year}年${monthNames[cur.month]}
        <div class="cal-month-picker" id="calPicker-${t.id}">
          ${calMonths.map((m, i) => `<div class="cal-picker-item${i === dispIdx ? ' active' : ''}" onclick="event.stopPropagation();pickCalMonth('${t.id}', ${m.year}, ${m.month})">${m.year}年${monthNames[m.month]}</div>`).join('')}
        </div>
      </span>
      <button class="cal-nav-btn" onclick="navCalMonth('${t.id}', 1)"${hasNext ? '' : ' disabled'}>▶</button>
    </div>
    ${buildMonthCalendar(cur.year, cur.month)}
  `;

  container.innerHTML = `
    <div style="background:#FFFFFE;border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;">
    ${t.desc ? `<p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:16px;"><b style="color:var(--text)">描述：</b>${escHtml(t.desc)}</p>` : ''}
    <div class="card-tags" style="${t.desc ? '' : 'margin-bottom:16px;'}">
      ${(t.tags||[]).map(tag => `<span class="tag tag-custom" style="background:${getTagColor(tag)}20;color:${getTagColor(tag)};border-color:${getTagColor(tag)}40;">${escHtml(tag)}</span>`).join('')}
      <span class="tag tag-priority-${t.priority||'p2'}">${priorityLabel(t.priority||'p2')}</span>
    </div>

    ${t.status === 'active' ? `
    <button class="big-checkin-btn${todayCount > 0 ? ' done' : ''}" onclick="doCheckin('${t.id}')">
      ${todayCount > 0 ? '✅ 今日已打卡（点击取消）' : '✅ 点我打卡'}
    </button>
    <div class="big-checkin-sub" style="color:${exceeding?'var(--orange)':(atTarget?'var(--success)':'inherit')}">
      ${periodLabel}进度：${count}/${target} 次${exceeding ? ' 🔥 超额完成！' : (atTarget ? ' ✅ 已达标' : '')}
    </div>
    ` : ''}
    </div>

    <div style="background:#FFFFFE;border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;">
    ${calHtml}
    </div>

    <div class="card-meta" style="font-size:13px;margin-bottom:12px;">
      <span>🔄 周期：${t.startDate||'未设'} ~ ${t.endDate||'长期'}</span>
    </div>
    ${notesSection(t, notes)}
  `;
}

function detailMenuBtn(t) {
  return `
    <div class="detail-menu-wrap">
      <button class="detail-menu-btn" onclick="event.stopPropagation();toggleDetailMenu(event,'${t.id}')" title="操作">⋮</button>
      <div class="detail-menu-dropdown" id="detailMenu-${t.id}">
        <div class="detail-menu-item" onclick="openTaskModal('${t.id}');closeDetailPage()">编辑</div>
        ${t.status === 'pending' ? '<div class="detail-menu-item" onclick="toggleStatusFromDetail(\''+t.id+'\',\'active\')">开始</div>' : ''}
        ${t.status === 'active' ? '<div class="detail-menu-item" onclick="toggleStatusFromDetail(\''+t.id+'\',\'completed\')">完成</div>' : ''}
        ${t.status === 'completed' || t.status === 'cancelled' ? '<div class="detail-menu-item" onclick="toggleStatusFromDetail(\''+t.id+'\',\'active\')">激活</div>' : ''}
        ${t.status === 'pending' || t.status === 'active' ? '<div class="detail-menu-item" onclick="toggleStatusFromDetail(\''+t.id+'\',\'cancelled\')">取消</div>' : ''}
        <div class="detail-menu-item danger" onclick="deleteTaskFromDetail('${t.id}')">删除</div>
      </div>
    </div>`;
}

function toggleDetailMenu(e, id) {
  e.stopPropagation();
  const menu = document.getElementById('detailMenu-' + id);
  menu.classList.toggle('show');
}

function toggleStatusFromDetail(id, status) {
  toggleStatus(id, status);
  renderGoals();
  openDetail(id);
}

function deleteTaskFromDetail(id) {
  deleteTask(id);
}

function actionButtons(t) {
  return '';
}

function notesSection(t, notes) {
  // 按时间倒序
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="notes-section">
      <div class="notes-title">📝 笔记 <span style="font-weight:400;font-size:12px;color:var(--text3)">(${sorted.length}条)</span></div>
      <div class="note-add">
        <textarea class="form-input" id="noteTextarea" placeholder="写点什么..." style="height:36px;resize:none;flex:1"></textarea>
        <button class="btn btn-primary btn-sm" style="white-space:nowrap;height:36px" onclick="addNote('${t.id}')">保存</button>
      </div>
      ${sorted.map((n, i) => `
        <div class="note-item">
          <div class="note-item-header">
            <span class="note-date">${formatNoteDate(n.date)}</span>
            <button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:11px" onclick="deleteNote('${t.id}', '${n.date}', '${escHtml(n.text).replace(/'/g, "\\'")}')">删除</button>
          </div>
          <div class="note-text" onclick="this.classList.toggle('expanded')">${escHtml(n.text)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatNoteDate(isoStr) { const d = new Date(isoStr); return d.toLocaleString('zh-CN', { month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }); }

