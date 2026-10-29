(function (root) {
  'use strict';

  /* =========================================================================
   * 校园智服通 CampusMate · 界面与交互 app.js
   * -------------------------------------------------------------------------
   * 负责：路由、视图渲染、事件委托、localStorage 持久化、一键演示、命令面板。
   * 算法全部在 engine.js，AI 调用全部在 ai.js，本文件不重复实现算法。
   * 所有动态文本都经过 escapeHtml，避免把外部 API 返回内容当 HTML 注入。
   * ========================================================================= */

  const DATA = root.CampusMateData;
  const E = root.CampusEngine;
  const AI = root.CampusAI;

  const THEME_KEY = 'campusmate.theme.v1';
  const WIZARD_KEY = 'campusmate.wizard.v1';
  const GUIDE_LAST_KEY = 'campusmate.guide.last.v1';
  const STUDY_PREFS_KEY = 'campusmate.study.prefs.v1';
  const GPA_KEY = 'campusmate.gpa.v1';

  const DAYS = [
    { id: 1, name: '周一', short: '一' },
    { id: 2, name: '周二', short: '二' },
    { id: 3, name: '周三', short: '三' },
    { id: 4, name: '周四', short: '四' },
    { id: 5, name: '周五', short: '五' }
  ];

  const ROUTES = {
    home: { title: '首页概览', eyebrow: 'Workbench' },
    ask: { title: '智能问答', eyebrow: 'Campus Assistant' },
    rooms: { title: '空教室查询', eyebrow: 'Space Finder' },
    guide: { title: '办事向导', eyebrow: 'Service Flow' },
    study: { title: '学习助手', eyebrow: 'Study Planner' },
    analytics: { title: '数据看板', eyebrow: 'Campus Insights' }
  };

  const GPA_MAPPING = [
    { range: '90—100', point: '4.0' },
    { range: '85—89', point: '3.7' },
    { range: '82—84', point: '3.3' },
    { range: '78—81', point: '3.0' },
    { range: '75—77', point: '2.7' },
    { range: '72—74', point: '2.3' },
    { range: '68—71', point: '2.0' },
    { range: '64—67', point: '1.5' },
    { range: '60—63', point: '1.0' },
    { range: '0—59', point: '0' }
  ];

  /* ------------------------------------------------------------------ *
   * 存储与基础工具
   * ------------------------------------------------------------------ */

  const storageAvailable = (function () {
    try {
      const key = '__campusmate_test__';
      root.localStorage.setItem(key, '1');
      root.localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  })();

  function readJson(key, fallback) {
    if (!storageAvailable) return fallback;
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (!storageAvailable) return false;
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function readRaw(key, fallback) {
    if (!storageAvailable) return fallback;
    try {
      return root.localStorage.getItem(key) || fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeRaw(key, value) {
    if (!storageAvailable) return false;
    try {
      root.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function icon(name, extraClass) {
    return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('zh-CN');
  }

  function formatCredits(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function round(value, digits) {
    const p = Math.pow(10, digits == null ? 0 : digits);
    return Math.round((Number(value) + Number.EPSILON) * p) / p;
  }

  function currentDayInfo() {
    const d = new Date().getDay();
    const weekend = d === 0 || d === 6;
    return {
      day: weekend ? 1 : d,
      label: weekend ? '下周一' : '周' + '日一二三四五六'.charAt(d),
      weekend: weekend
    };
  }

  function dayName(day) {
    const item = DAYS.find(function (d) { return d.id === Number(day); });
    return item ? item.name : '未知';
  }

  function periodText(start, end) {
    const a = Number(start);
    const b = Number(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '未设置';
    return a === b ? '第 ' + a + ' 节' : '第 ' + a + '—' + b + ' 节';
  }

  function timeText(start, end) {
    const a = E.PERIOD_TIMES[Number(start) - 1];
    const b = E.PERIOD_TIMES[Number(end) - 1];
    if (!a || !b) return '';
    return a.start + '—' + b.end;
  }

  function activeCoursesForWeek(courses, week) {
    return (courses || []).filter(function (course) {
      if (!course) return false;
      if (course.weekStart != null && Number(week) < Number(course.weekStart)) return false;
      if (course.weekEnd != null && Number(week) > Number(course.weekEnd)) return false;
      return true;
    });
  }

  function optionTags(items, selected) {
    return items.map(function (item) {
      const value = item.value != null ? item.value : item;
      const label = item.label != null ? item.label : item;
      return '<option value="' + escapeHtml(String(value)) + '"' +
        (String(value) === String(selected) ? ' selected' : '') + '>' + escapeHtml(String(label)) + '</option>';
    }).join('');
  }

  function teachingWeeks() {
    const out = [];
    for (let i = 1; i <= 18; i += 1) out.push({ value: i, label: '第 ' + i + ' 教学周' });
    return out;
  }

  function periodOptions() {
    const out = [];
    for (let i = 1; i <= 12; i += 1) {
      out.push({ value: i, label: '第 ' + i + ' 节（' + E.PERIOD_TIMES[i - 1].start + '）' });
    }
    return out;
  }

  function themeNow() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  function defaultStudyPrefs() {
    return { week: DATA.meta.week, preference: 'any', dayStart: 1, dayEnd: 12, minLength: 2 };
  }

  function normalizeStudyPrefs(raw) {
    const base = defaultStudyPrefs();
    if (!raw || typeof raw !== 'object') return base;
    let week = Number(raw.week);
    if (!Number.isFinite(week) || week < 1 || week > 18) week = base.week;
    let dayStart = Number(raw.dayStart);
    let dayEnd = Number(raw.dayEnd);
    if (!Number.isFinite(dayStart) || dayStart < 1 || dayStart > 12) dayStart = 1;
    if (!Number.isFinite(dayEnd) || dayEnd < 1 || dayEnd > 12) dayEnd = 12;
    if (dayStart > dayEnd) { const t = dayStart; dayStart = dayEnd; dayEnd = t; }
    let minLength = Number(raw.minLength);
    if (!Number.isFinite(minLength) || minLength < 1 || minLength > 4) minLength = 2;
    const preference = ['any', 'morning', 'afternoon', 'evening'].indexOf(raw.preference) >= 0 ? raw.preference : 'any';
    return { week: week, preference: preference, dayStart: dayStart, dayEnd: dayEnd, minLength: minLength };
  }

  function normalizeGpaCourses(raw) {
    const fallback = clone(DATA.gpaCourses);
    if (!Array.isArray(raw) || !raw.length) return fallback;
    return raw.map(function (course) {
      return {
        name: String(course && course.name != null ? course.name : ''),
        credits: course && course.credits != null ? course.credits : '',
        score: course && course.score != null ? course.score : ''
      };
    });
  }

  const savedPrefs = normalizeStudyPrefs(readJson(STUDY_PREFS_KEY, null));
  const savedGpa = normalizeGpaCourses(readJson(GPA_KEY, null));
  const savedWizard = readJson(WIZARD_KEY, {});
  const savedGuide = readRaw(GUIDE_LAST_KEY, DATA.procedures[0].id);

  const state = {
    route: 'home',
    theme: themeNow(),
    qa: { history: [], pending: false, lastResult: null, seq: 0 },
    rooms: {
      week: DATA.meta.week,
      day: currentDayInfo().day,
      start: 3,
      end: 4,
      building: 'all',
      minCapacity: 0,
      multimedia: false,
      consecutive: 2,
      error: ''
    },
    guide: {
      procedureId: DATA.procedures.some(function (p) { return p.id === savedGuide; }) ? savedGuide : DATA.procedures[0].id,
      progress: savedWizard && typeof savedWizard === 'object' ? savedWizard : {}
    },
    study: {
      conflictDemo: true,
      prefs: savedPrefs,
      gpaCourses: savedGpa
    },
    demo: { active: false, index: 0, token: 0 }
  };

  let heroPreview = null;
  let paletteItems = [];
  let filteredPalette = [];
  let paletteIndex = 0;
  let programmaticHash = '';
  let lastFocusedBeforeLayer = null;

  /* ------------------------------------------------------------------ *
   * 主题与 AI 状态同步
   * ------------------------------------------------------------------ */

  function applyTheme(theme, announce) {
    const next = theme === 'dark' ? 'dark' : 'light';
    state.theme = next;
    document.documentElement.setAttribute('data-theme', next);
    writeRaw(THEME_KEY, next);
    updateThemeUI();
    if (announce) {
      toast('界面主题已切换', next === 'dark' ? '已切换到深色模式，偏好已保存在本机。' : '已切换到浅色模式，偏好已保存在本机。', 'info');
    }
  }

  function updateThemeUI() {
    const btn = document.getElementById('themeBtn');
    if (btn) {
      const isDark = state.theme === 'dark';
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('aria-label', isDark ? '切换为浅色主题' : '切换为深色主题');
    }
    document.querySelectorAll('[data-theme-choice]').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-theme-choice') === state.theme);
    });
  }

  function syncModeUI() {
    if (!AI) return;
    const status = AI.getStatus();
    const label = status.label;
    const modeText = document.getElementById('modeText');
    const sideText = document.getElementById('sideModeText');
    const pill = document.getElementById('modePill');
    if (modeText) modeText.textContent = label;
    if (sideText) sideText.textContent = label;
    if (pill) {
      pill.classList.toggle('is-api', status.mode === 'api');
      pill.setAttribute('title', status.mode === 'api'
        ? '当前使用大模型 API：' + (status.model || '未命名模型')
        : '当前使用本地 TF-IDF 检索引擎，断网可用');
    }
  }

  /* ------------------------------------------------------------------ *
   * Toast / 弹层
   * ------------------------------------------------------------------ */

  function toast(title, message, tone) {
    const region = document.getElementById('toastRegion');
    if (!region) return;
    while (region.children.length >= 3) region.removeChild(region.firstElementChild);
    const type = tone || 'info';
    const iconName = type === 'success' ? 'check-circle' : type === 'danger' ? 'alert' : type === 'warning' ? 'alert' : 'info';
    const el = document.createElement('div');
    el.className = 'toast is-' + type;
    el.innerHTML = icon(iconName) +
      '<div class="toast-content"><strong>' + escapeHtml(title) + '</strong>' +
      (message ? '<p>' + escapeHtml(message) + '</p>' : '') + '</div>' +
      '<button class="toast-close" type="button" data-action="dismiss-toast" aria-label="关闭提示">' + icon('close') + '</button>';
    region.appendChild(el);
    const timer = setTimeout(function () {
      dismissToast(el);
    }, 4200);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () {
      setTimeout(function () { dismissToast(el); }, 1600);
    });
  }

  function dismissToast(el) {
    if (!el || !el.parentNode || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 220);
  }

  function lockBody(lock) {
    document.body.classList.toggle('is-locked', Boolean(lock));
  }

  function layerOpen() {
    const palette = document.getElementById('paletteLayer');
    const settings = document.getElementById('settingsLayer');
    const sidebar = document.getElementById('sidebar');
    return Boolean(
      (palette && !palette.hidden) ||
      (settings && !settings.hidden) ||
      (sidebar && sidebar.classList.contains('is-open'))
    );
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const btn = document.getElementById('menuBtn');
    if (sidebar) sidebar.classList.remove('is-open');
    if (scrim) scrim.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    lockBody(layerOpen());
  }

  /* ------------------------------------------------------------------ *
   * 路由
   * ------------------------------------------------------------------ */

  function routeFromHash() {
    const hit = String(root.location.hash || '').replace(/^#\/?/, '');
    return ROUTES[hit] ? hit : 'home';
  }

  function setRoute(route) {
    const next = ROUTES[route] ? route : 'home';
    state.route = next;
    const hash = '#/' + next;
    if (root.location.hash !== hash) {
      programmaticHash = hash;
      root.location.hash = hash;
    }
    render();
    closeMobileSidebar();
  }

  function render() {
    const rootEl = document.getElementById('viewRoot');
    if (!rootEl) return;
    const meta = ROUTES[state.route] || ROUTES.home;
    document.title = meta.title + ' · 校园智服通 CampusMate';
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = meta.title;
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (item) {
      const active = item.getAttribute('data-nav') === state.route;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    try {
      rootEl.innerHTML = renderView();
    } catch (err) {
      rootEl.innerHTML = renderFatal(err);
    }
    afterRender();
  }

  function renderView() {
    switch (state.route) {
      case 'ask':
        return renderAsk();
      case 'rooms':
        return renderRooms();
      case 'guide':
        return renderGuide();
      case 'study':
        return renderStudy();
      case 'analytics':
        return renderAnalytics();
      default:
        return renderHome();
    }
  }

  function afterRender() {
    if (state.route === 'ask') {
      const feed = document.getElementById('qaFeed');
      if (feed) {
        if (state.qa.pending) {
          // 提交后先让用户看到“正在检索”的状态
          feed.scrollTop = feed.scrollHeight;
        } else {
          // 回答完成后定位到最新一条回答的顶部，保证来源、置信度先入眼
          const botMessages = feed.querySelectorAll('.msg-bot');
          const lastBot = botMessages.length ? botMessages[botMessages.length - 1] : null;
          if (lastBot) {
            feed.scrollTop = Math.max(0, lastBot.offsetTop - feed.offsetTop - 6);
          }
        }
      }
      const input = document.getElementById('qaInput');
      if (input) {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 108) + 'px';
      }
    }
  }

  function renderFatal(err) {
    const message = err && err.message ? err.message : '未知渲染错误';
    return '<section class="card">' +
      '<div class="empty-state"><span class="empty-icon">' + icon('alert') + '</span>' +
      '<h3>页面暂时没有加载出来</h3>' +
      '<p>视图渲染遇到问题，已保护其余功能不被中断。请刷新页面重试；如果问题持续存在，可检查浏览器控制台中的错误信息。</p>' +
      '<p class="mono" style="margin-top:8px">' + escapeHtml(message) + '</p>' +
      '<button class="btn btn-primary" type="button" data-action="retry-render">' + icon('reset') + '重新渲染</button>' +
      '</div></section>';
  }

  function pageHead(eyebrow, title, desc, actions) {
    return '<div class="page-head"><div>' +
      '<span class="eyebrow">' + escapeHtml(eyebrow) + '</span>' +
      '<h2>' + escapeHtml(title) + '</h2>' +
      '<p>' + escapeHtml(desc) + '</p>' +
      '</div><div class="page-actions">' + (actions || '') + '</div></div>';
  }

  /* ------------------------------------------------------------------ *
   * 首页
   * ------------------------------------------------------------------ */

  function getHeroPreview() {
    if (heroPreview) return heroPreview;
    try {
      heroPreview = E.search('学籍证明怎么办理？', DATA.knowledgeBase, {
        synonyms: DATA.synonyms,
        topK: 1,
        minScore: 0.25
      });
    } catch (err) {
      heroPreview = null;
    }
    return heroPreview;
  }

  function getHeroRoom() {
    try {
      const rooms = E.freeRooms({
        rooms: DATA.rooms,
        schedule: DATA.timetable,
        week: DATA.meta.week,
        day: currentDayInfo().day,
        start: 3,
        end: 4,
        consecutive: 2
      });
      return rooms[0] || null;
    } catch (err) {
      return null;
    }
  }

  function renderHome() {
    const preview = getHeroPreview();
    const hit = preview && preview.results && preview.results[0] ? preview.results[0] : null;
    const heroRoom = getHeroRoom();
    const categories = new Set(DATA.knowledgeBase.map(function (item) { return item.category; })).size;
    const dayInfo = currentDayInfo();
    const todayCourses = activeCoursesForWeek(DATA.studentCourses, DATA.meta.week)
      .filter(function (course) { return course.day === dayInfo.day; })
      .sort(function (a, b) { return a.start - b.start; });

    const statCards = [
      { icon: 'database', tone: 'blue', value: DATA.knowledgeBase.length, unit: '条', label: '办事知识条目' },
      { icon: 'door', tone: 'teal', value: DATA.rooms.length, unit: '间', label: '可查询教室' },
      { icon: 'route', tone: 'violet', value: DATA.procedures.length, unit: '条', label: '标准办事流程' },
      { icon: 'layers', tone: 'amber', value: categories, unit: '类', label: '校园服务场景' }
    ].map(function (item) {
      return '<div class="stat-card"><span class="icon-tile tone-' + item.tone + '">' + icon(item.icon) + '</span>' +
        '<div class="stat-copy"><span class="stat-value">' + formatNumber(item.value) + '<small>' + item.unit + '</small></span>' +
        '<span class="stat-label">' + item.label + '</span></div></div>';
    }).join('');

    const features = [
      { route: 'ask', icon: 'chat', tone: 'blue', title: '智能问答', desc: '基于 74 条本地知识库与 TF-IDF 检索，回答附来源、置信度和相关追问。', meta: ['知识库 74 条', '余弦相似度'] },
      { route: 'rooms', icon: 'door', tone: 'teal', title: '空教室查询', desc: '按教学周、星期、节次和教学楼筛选，支持连堂课匹配与可用时长排序。', meta: ['36 间教室', '区间覆盖'] },
      { route: 'guide', icon: 'route', tone: 'violet', title: '办事向导', desc: '自动生成材料清单与办理顺序，拓扑排序标出可并行节点并保存进度。', meta: ['8 条流程', '拓扑排序'] },
      { route: 'study', icon: 'book', tone: 'amber', title: '学习助手', desc: '课表冲突检测、每日空闲推荐，以及学分加权 GPA 4.0 / 百分制双显示。', meta: ['冲突检测', '加权 GPA'] },
      { route: 'analytics', icon: 'chart', tone: 'green', title: '数据看板', desc: '原生 SVG 手绘折线、柱状与环形图，观察图书借阅、报修和办件趋势。', meta: ['原生 SVG', '12 个月'] },
      { action: 'open-palette', icon: 'command', tone: 'red', title: '命令面板', desc: '按 Ctrl + K 快速跳转任意功能、办事流程或直接发起一条校园提问。', meta: ['Ctrl + K', '深浅主题'] }
    ].map(function (item) {
      const trigger = item.route ? 'data-route="' + item.route + '"' : 'data-action="' + item.action + '"';
      return '<button class="feature-card" type="button" ' + trigger + '>' +
        '<span class="feature-card-top"><span class="icon-tile tone-' + item.tone + '">' + icon(item.icon) + '</span>' +
        '<span class="feature-arrow">' + icon('arrow-up-right') + '</span></span>' +
        '<h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.desc) + '</p>' +
        '<span class="feature-meta">' + item.meta.map(function (m) { return '<span>' + escapeHtml(m) + '</span>'; }).join('') + '</span>' +
        '</button>';
    }).join('');

    const todayRows = todayCourses.length
      ? todayCourses.map(function (course) {
        const startTime = E.PERIOD_TIMES[course.start - 1] ? E.PERIOD_TIMES[course.start - 1].start : '';
        const endTime = E.PERIOD_TIMES[course.end - 1] ? E.PERIOD_TIMES[course.end - 1].end : '';
        return '<div class="today-row"><div class="today-time"><strong>' + escapeHtml(startTime) + '</strong><span>' + escapeHtml(endTime) + '</span></div>' +
          '<div class="today-main"><strong>' + escapeHtml(course.name) + '</strong><span>' + escapeHtml(course.location) + ' · ' + escapeHtml(course.teacher) + ' · ' + periodText(course.start, course.end) + '</span></div>' +
          '<span class="badge badge-primary">' + escapeHtml(course.type || '课程') + '</span></div>';
      }).join('')
      : '<div class="empty-state" style="padding:20px 10px"><span class="empty-icon">' + icon('calendar') + '</span><h3>今天没有排课</h3><p>可以去图书馆自习，或用空教室查询找一间安静教室。</p><button class="btn btn-quiet btn-sm" type="button" data-route="rooms">' + icon('door') + '查空教室</button></div>';

    const noticeRows = DATA.announcements.map(function (item) {
      return '<div class="notice-row"><div class="notice-date"><span>' + escapeHtml(item.date) + '</span><span class="badge">' + escapeHtml(item.tag) + '</span></div>' +
        '<div class="notice-main"><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.desc) + '</p></div></div>';
    }).join('');

    const previewConfidence = preview ? preview.confidence : 0;
    const previewAnswer = hit ? hit.answer : '学籍证明由教务处学籍科统一开具，先在教务系统下载模板并填写，经辅导员确认后到学籍科审核盖章。';

    return '<div>' +
      '<section class="hero">' +
      '<div class="hero-copy">' +
      '<span class="hero-eyebrow"><span class="live-dot"></span>校园服务智能体 · 本地知识库优先</span>' +
      '<h2>校园办事，<br class="hero-break"><span class="highlight">一句话</span>说清楚。</h2>' +
      '<p class="hero-sub">查学籍证明怎么办、找一间连续两节空闲的教室、把毕业离校手续排成正确的顺序——一个工作台覆盖高频校园服务，断网也能完整演示。</p>' +
      '<div class="hero-actions">' +
      '<button class="btn btn-primary btn-lg" type="button" data-route="ask">' + icon('sparkles') + '开始提问</button>' +
      '<button class="btn btn-secondary btn-lg" type="button" data-action="start-demo">' + icon('play') + '一键演示</button>' +
      '<button class="btn btn-ghost btn-lg" type="button" data-route="rooms">' + icon('door') + '查空教室</button>' +
      '</div>' +
      '<div class="hero-proof">' +
      '<div class="proof-item"><strong>' + DATA.knowledgeBase.length + '</strong><span>条校园办事知识</span></div>' +
      '<div class="proof-item"><strong>' + DATA.rooms.length + ' × 5 × 12</strong><span>教室 × 工作日 × 节次</span></div>' +
      '<div class="proof-item"><strong>' + DATA.procedures.length + '</strong><span>条拓扑排序流程</span></div>' +
      '<div class="proof-item"><strong>0</strong><span>第三方依赖</span></div>' +
      '</div></div>' +
      '<div class="hero-visual" aria-hidden="true">' +
      '<div class="hero-main-card">' +
      '<div class="hero-card-head"><span class="hero-card-avatar">' + icon('bot') + '</span><strong>校园智服通</strong><span class="badge badge-accent">' + escapeHtml(AI.getStatus().label) + '</span></div>' +
      '<div class="hero-question">“学籍证明怎么办理？”</div>' +
      '<div class="hero-answer">' + escapeHtml(previewAnswer.length > 74 ? previewAnswer.slice(0, 74) + '…' : previewAnswer) + '</div>' +
      '<div class="hero-confidence"><span class="confidence-track"><span class="confidence-fill" style="width:' + previewConfidence + '%"></span></span><span class="confidence-label">置信度 ' + previewConfidence + '%</span></div>' +
      '<div class="hero-source"><span class="source-ref">' + escapeHtml(hit ? hit.id : 'KB-001') + '</span><span>' + escapeHtml(hit ? hit.title : '学籍证明办理') + ' · TF-IDF + 余弦</span></div>' +
      '<div class="hero-quick-stats"><span><strong>4</strong> 步办理</span><span><strong>' + (hit && hit.materials ? hit.materials.length : 3) + '</strong> 份材料</span><span><strong>' + (heroRoom ? heroRoom.longest : 4) + '</strong> 节连排</span></div>' +
      '</div>' +
      '</div></section>' +
      '<div class="stats-strip">' + statCards + '</div>' +
      '<div class="section-head"><div><span class="eyebrow">Workspace</span><h2>一个工作台，覆盖校园高频场景</h2><p>把查、问、办、学、看五件事放到同一条动线里。</p></div><span class="badge badge-primary">' + icon('zap') + '无需登录 · 双击即用</span></div>' +
      '<div class="feature-grid">' + features + '</div>' +
      '<div class="home-lower">' +
      '<section class="card"><div class="card-head"><div><h3>今日课表 · ' + escapeHtml(dayInfo.label) + '</h3><p>第 ' + DATA.meta.week + ' 教学周 · 演示课表</p></div><button class="card-link" type="button" data-route="study">打开学习助手' + icon('arrow-right') + '</button></div>' +
      '<div class="today-list">' + todayRows + '</div></section>' +
      '<section class="card"><div class="card-head"><div><h3>校园通知</h3><p>本地模拟通知，用于展示信息聚合</p></div><span class="badge">3 条</span></div>' +
      '<div>' + noticeRows + '</div></section>' +
      '</div>' +
      '<div class="home-footnote">' + icon('info') + '<span>' + escapeHtml(DATA.meta.dataNote) + ' 知识库、课表、通知与指标均为本地模拟数据，仅用于竞赛演示。</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 智能问答
   * ------------------------------------------------------------------ */

  function confidenceHtml(confidence, label) {
    const value = Math.max(0, Math.min(100, Number(confidence) || 0));
    const cls = value >= 55 ? '' : value >= 30 ? 'is-mid' : 'is-low';
    return '<span class="confidence" title="' + escapeHtml(label || 'TF-IDF 余弦相似度') + '">' +
      '<span class="confidence-track"><span class="confidence-fill ' + cls + '" style="width:' + value + '%"></span></span>' +
      '<span class="confidence-label">' + value + '%</span></span>';
  }

  function renderRelated(related) {
    if (!related || !related.length) return '';
    return '<div class="related"><span class="related-label">相关问题推荐</span><div class="related-list">' +
      related.map(function (item) {
        return '<button class="related-chip" type="button" data-question="' + escapeHtml(item.question || item.title) + '">' +
          escapeHtml(item.title) + '</button>';
      }).join('') + '</div></div>';
  }

  function renderSources(result) {
    if (!result || !result.sources || !result.sources.length) return '';
    return '<div class="sources-list">' + result.sources.map(function (item) {
      return '<span class="chip chip-mono">' + escapeHtml(item.id) + '</span><span class="chip">' + escapeHtml(item.title) + '</span>';
    }).join('') + '</div>';
  }

  function renderHandoff(handoff, confidence, matched) {
    const h = handoff || AI.handoff || {};
    return '<div class="handoff-inline">' + icon('alert') +
      '<div><strong>' + (matched ? '需要更准确的口径？' : '未匹配到可靠答案，建议转人工') + '</strong>' +
      '<p>' + (matched
        ? '知识库未覆盖的个性化问题，可到一站式学生服务大厅咨询。'
        : '本地知识库对该问题的最高相似度为 ' + (Number(confidence) || 0) + '%，低于可信阈值。建议转人工，避免按错误口径办理。') +
      '</p><p><strong style="display:inline;color:var(--text-2)">' + escapeHtml(h.department || '学生服务大厅') + '</strong> · ' +
      escapeHtml(h.place || '大学生活动中心一楼') + ' · ' + escapeHtml(h.time || '工作日 9:00—17:00') + '</p></div></div>';
  }

  function renderAssistantMessage(result) {
    if (!result) return '';
    const hit = result.hit;
    const confidence = Number(result.confidence) || 0;
    const matched = Boolean(result.matched);
    const modeLabel = result.fallback ? '本地引擎（API 失败回退）' : (result.modeLabel || '本地引擎');
    let meta = '';
    if (hit) {
      meta += '<span class="source-ref">' + escapeHtml(hit.id) + '</span><span class="source-title">' + escapeHtml(hit.title) + '</span>';
    }
    meta += '<span class="badge badge-primary">' + icon('cpu') + escapeHtml(modeLabel) + '</span>';
    meta += confidenceHtml(confidence, '检索置信度');
    meta += '<span class="badge">' + (result.tokens ? result.tokens.length : 0) + ' 个查询词</span>';

    let body = '';
    if (result.fallback && result.fallbackReason) {
      body += '<div class="fallback-note">' + icon('alert') + '<span>' + escapeHtml(result.fallbackReason) + '</span></div>';
    }

    if (!matched) {
      body += '<div class="answer-lead">没有在本地知识库中检索到足够可靠的答案。你可以换一种说法，补充业务名称后重试，或直接到一站式服务大厅咨询。</div>';
      body += renderHandoff(result.handoff, confidence, false);
      if (result.sources && result.sources.length) {
        body += '<div class="answer-section"><h4>' + icon('search') + '最接近的条目（仅供参考）</h4><div class="sources-list">' +
          result.sources.map(function (item) {
            return '<span class="chip">' + escapeHtml(item.id) + ' · ' + escapeHtml(item.title) + '（' + item.confidence + '%）</span>';
          }).join('') + '</div></div>';
      }
      body += '<div class="related"><span class="related-label">换个问法</span><div class="related-list">' +
        DATA.quickQuestions.slice(0, 4).map(function (q) {
          return '<button class="related-chip" type="button" data-question="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
        }).join('') + '</div></div>';
    } else if (result.mode === 'api' && !result.fallback) {
      body += '<div class="api-answer">' + escapeHtml(result.answer) + '</div>';
      body += '<div class="answer-source-line"><span class="source-ref">' + escapeHtml(hit ? hit.id : 'RAG') + '</span><span>本地检索为模型提供 ' + (result.sources ? result.sources.length : 0) + ' 条依据 · 置信度 ' + confidence + '%</span></div>';
      body += renderSources(result);
      body += renderRelated(result.related);
    } else {
      body += '<div class="answer-lead">' + escapeHtml(hit.answer) + '</div>';
      if (hit.steps && hit.steps.length) {
        body += '<div class="answer-section"><h4>' + icon('route') + '办理步骤</h4><ol class="answer-steps">' +
          hit.steps.map(function (step) { return '<li>' + escapeHtml(step) + '</li>'; }).join('') + '</ol></div>';
      }
      if (hit.materials && hit.materials.length) {
        body += '<div class="answer-section"><h4>' + icon('file') + '所需材料</h4><div class="answer-materials">' +
          hit.materials.map(function (m) { return '<span class="chip">' + escapeHtml(m) + '</span>'; }).join('') + '</div></div>';
      }
      if (hit.place || hit.time || hit.department) {
        body += '<div class="answer-info">' +
          (hit.department ? '<div>' + icon('building') + '<span><strong>负责部门</strong>' + escapeHtml(hit.department) + '</span></div>' : '') +
          (hit.place ? '<div>' + icon('map-pin') + '<span><strong>办理地点</strong>' + escapeHtml(hit.place) + '</span></div>' : '') +
          (hit.time ? '<div>' + icon('clock') + '<span><strong>办理时间</strong>' + escapeHtml(hit.time) + '</span></div>' : '') +
          '<div>' + icon('database') + '<span><strong>知识编号</strong>' + escapeHtml(hit.id) + ' · ' + escapeHtml(hit.category) + '</span></div>' +
          '</div>';
      }
      if (hit.tip) body += '<div class="answer-tip">' + icon('info') + '<span>' + escapeHtml(hit.tip) + '</span></div>';
      body += renderRelated(result.related);
    }

    body += '<div class="answer-actions">' +
      '<button class="answer-action" type="button" data-action="copy-last">' + icon('copy') + '复制回答</button>' +
      '<button class="answer-action" type="button" data-action="focus-ask">' + icon('chat') + '继续追问</button>' +
      '<span class="answer-action" style="margin-left:auto;cursor:default">' + icon('clock') + (result.elapsedMs != null ? result.elapsedMs + ' ms' : '本地检索') + '</span>' +
      '</div>';

    return '<div class="msg msg-bot"><div class="msg-avatar">' + icon('bot') + '</div>' +
      '<div class="msg-bubble"><div class="answer-meta">' + meta + '</div>' + body + '</div></div>';
  }

  function renderPipeline() {
    const last = state.qa.lastResult;
    const tokens = last && last.tokens && last.tokens.length ? last.tokens.slice(0, 8) : ['学籍证明', '办理', '材料'];
    const expanded = last && last.expanded ? last.expanded : [];
    const tokenHtml = tokens.map(function (token) {
      return '<span class="token' + (expanded.indexOf(token) >= 0 ? ' is-expanded' : '') + '">' + escapeHtml(token) + '</span>';
    }).join('');
    const score = last && last.topScore != null ? Number(last.topScore).toFixed(2) : '—';
    return '<div class="pipeline">' +
      '<div class="pipeline-step"><span class="pipeline-num">1</span><div><strong>中文分词</strong><span>正向最大匹配 + 校园词典</span></div></div>' +
      '<div class="pipeline-step"><span class="pipeline-num">2</span><div><strong>同义词扩展</strong><span>别名 / 近义词提升召回</span></div></div>' +
      '<div class="pipeline-step"><span class="pipeline-num">3</span><div><strong>TF-IDF 向量</strong><span>标题与关键词加权</span></div></div>' +
      '<div class="pipeline-step"><span class="pipeline-num">4</span><div><strong>余弦相似度 Top-K</strong><span>排序后输出置信度</span></div></div>' +
      '</div><div class="token-cloud">' + tokenHtml + '</div>' +
      '<div class="pipeline-score"><span>Top-1 余弦相似度</span><strong>' + escapeHtml(score) + '</strong></div>';
  }

  function renderAsk() {
    const last = state.qa.lastResult;
    const history = state.qa.history;
    const mode = AI.getStatus();
    let feed = '';
    if (!history.length) {
      feed += '<div class="qa-welcome"><div class="qa-welcome-head"><span class="bot-avatar">' + icon('bot') + '</span>' +
        '<div><h3>你好，我是校园智服通</h3><p style="margin-top:2px">可以问我校园办事、材料、地点和流程。</p></div></div>' +
        '<p>我的回答来自本地知识库：先做中文分词与同义词扩展，再用 TF-IDF 和余弦相似度找出最相关的办事条目。每条回答都会给出知识编号、置信度和相关问题。</p>' +
        '<div class="qa-suggestions">' + DATA.quickQuestions.slice(0, 4).map(function (q) {
          return '<button class="qa-suggestion" type="button" data-question="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
        }).join('') + '</div></div>';
    } else {
      history.forEach(function (entry) {
        if (entry.role === 'user') {
          feed += '<div class="msg msg-user"><div class="msg-avatar">林</div><div class="msg-bubble"><p>' + escapeHtml(entry.text) + '</p></div></div>';
        } else if (entry.role === 'assistant') {
          feed += renderAssistantMessage(entry.result);
        }
      });
      if (state.qa.pending) {
        feed += '<div class="msg msg-bot"><div class="msg-avatar">' + icon('bot') + '</div><div class="msg-bubble"><span class="typing"><i></i><i></i><i></i></span><span style="margin-left:6px;font-size:9.5px;color:var(--text-3)">正在检索本地知识库…</span></div></div>';
      }
    }

    return '<div>' +
      pageHead('Campus Assistant', '智能问答', '问校园办事，给出答案、依据和下一步。默认走本地引擎，配置 API 后可切换大模型。',
        '<span class="badge badge-primary">' + icon('sparkles') + escapeHtml(mode.label) + '</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-action="clear-chat" ' + (history.length ? '' : 'disabled') + '>' + icon('reset') + '清空对话</button>') +
      '<div class="qa-layout">' +
      '<section class="card chat-card">' +
      '<div class="chat-head"><span class="bot-avatar">' + icon('bot') + '</span><div class="chat-head-copy"><strong>校园办事助手</strong><span>' + DATA.knowledgeBase.length + ' 条本地知识 · ' + (mode.mode === 'api' ? '当前走大模型 API' : '完全离线可用') + '</span></div>' +
      '<div class="chat-head-actions"><span class="badge badge-accent">' + icon('shield') + '本地优先</span></div></div>' +
      '<div class="chat-feed" id="qaFeed" aria-live="polite">' + feed + '</div>' +
      '<form class="composer" id="qaForm" data-form="qa" novalidate>' +
      '<div class="composer-box"><label class="sr-only" for="qaInput">输入校园办事问题</label>' +
      '<textarea id="qaInput" name="question" rows="1" maxlength="200" placeholder="例如：学籍证明怎么办理？校园卡丢了怎么挂失？" aria-label="输入校园办事问题"></textarea>' +
      '<div class="composer-foot"><span class="composer-hint">' + icon('database') + (mode.mode === 'api' ? '本地检索 + 大模型 API · 仅发送当前问题' : '本地知识库检索 · 不上传，不联网') + '</span>' +
      '<button class="composer-send" type="submit" ' + (state.qa.pending ? 'disabled' : '') + '>' + (state.qa.pending ? '检索中' : '发送') + icon('send') + '</button></div></div>' +
      '</form></section>' +
      '<aside class="qa-side">' +
      '<section class="side-card"><h3>' + icon('sparkles') + '试试这样问</h3><p>点击直接发起提问，适合答辩时快速展示。</p><div class="quick-list">' +
      DATA.quickQuestions.slice(0, 5).map(function (q) {
        return '<button class="quick-question" type="button" data-question="' + escapeHtml(q) + '">' + icon('arrow-up-right') + '<span>' + escapeHtml(q) + '</span></button>';
      }).join('') + '</div></section>' +
      '<section class="side-card"><h3>' + icon('cpu') + '检索流水线</h3><p>答辩可讲：分词 → 同义词 → TF-IDF → 余弦 Top-K。</p>' + renderPipeline() + '</section>' +
      '<section class="side-card handoff-card"><h3>' + icon('alert') + '低置信度转人工</h3><p>低于可信阈值时不会硬答，会明确提示转人工。</p>' +
      '<div class="handoff-list"><div>' + icon('map-pin') + '<span>' + escapeHtml(AI.handoff.place) + ' · ' + escapeHtml(AI.handoff.department) + '</span></div>' +
      '<div>' + icon('clock') + '<span>' + escapeHtml(AI.handoff.time) + '</span></div>' +
      '<div>' + icon('info') + '<span>演示数据，实际以学校最新通知为准</span></div></div></section>' +
      '</aside></div></div>';
  }

  async function askQuestion(question, options) {
    const text = String(question == null ? '' : question).trim();
    if (!text || state.qa.pending) return null;
    const seq = state.qa.seq + 1;
    state.qa.seq = seq;
    state.qa.history.push({ role: 'user', text: text });
    state.qa.pending = true;
    render();
    let result;
    try {
      result = await AI.ask(text, options || {});
    } catch (err) {
      result = {
        mode: 'local',
        modeLabel: '本地引擎',
        fallback: false,
        fallbackReason: '',
        question: text,
        matched: false,
        answer: '',
        hit: null,
        sources: [],
        related: [],
        confidence: 0,
        topScore: 0,
        tokens: [],
        expanded: [],
        handoff: AI.handoff,
        elapsedMs: 0
      };
      toast('问答没有完成', err && err.message ? err.message : '本地引擎执行异常，请重试。', 'danger');
    }
    // 用户可能在等待期间清空了对话，此时丢弃这一次迟到的回答
    if (seq !== state.qa.seq) return null;
    state.qa.history.push({ role: 'assistant', result: result });
    state.qa.lastResult = result;
    state.qa.pending = false;
    render();
    if (result && result.fallback) {
      toast('已回退本地引擎', result.fallbackReason || '大模型接口暂时不可用。', 'warning');
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * 空教室
   * ------------------------------------------------------------------ */

  function roomResults() {
    return E.freeRooms({
      rooms: DATA.rooms,
      schedule: DATA.timetable,
      week: state.rooms.week,
      day: state.rooms.day,
      start: state.rooms.start,
      end: state.rooms.end,
      building: state.rooms.building,
      minCapacity: state.rooms.minCapacity,
      multimedia: state.rooms.multimedia,
      consecutive: state.rooms.consecutive
    });
  }

  function roomPeriodStrip(room) {
    const cells = [];
    for (let p = 1; p <= 12; p += 1) {
      const free = room.freeBlocks.some(function (block) { return p >= block.start && p <= block.end; });
      const inQuery = p >= state.rooms.start && p <= state.rooms.end;
      cells.push('<span class="period-cell' + (free ? ' is-free' : '') + (inQuery ? ' is-query' : '') +
        '" title="第 ' + p + ' 节：' + (free ? '空闲' : '占用') + '"></span>');
    }
    return '<div class="period-strip" role="img" aria-label="' + escapeHtml(room.name) + ' 1 至 12 节空闲示意">' + cells.join('') + '</div>' +
      '<div class="period-legend"><span class="legend-key"><span class="legend-swatch free"></span>空闲</span><span class="legend-key"><span class="legend-swatch"></span>占用</span><span class="legend-key"><span class="legend-swatch query"></span>查询区间</span></div>';
  }

  function roomCard(room) {
    const freeChips = room.freeBlocks.slice(0, 5).map(function (block) {
      return '<span class="chip">' + periodText(block.start, block.end) + ' · ' + block.length + ' 节</span>';
    }).join('');
    const more = room.freeBlocks.length > 5 ? '<span class="chip">+' + (room.freeBlocks.length - 5) + ' 段</span>' : '';
    return '<article class="room-card">' +
      '<div class="room-head"><span class="room-avatar">' + icon('door') + '</span>' +
      '<div class="room-title"><h3>' + escapeHtml(room.name) + '</h3><p>' + escapeHtml(room.building) + ' · ' + escapeHtml(room.type) + '</p></div>' +
      '<span class="avail-badge">' + icon('clock') + '可连排 ' + room.longest + ' 节</span></div>' +
      '<div class="room-meta"><span class="chip">' + icon('users') + '容量 ' + room.capacity + ' 人</span>' +
      '<span class="chip">' + icon('projector') + (room.multimedia ? '多媒体' : '无多媒体') + '</span>' +
      '<span class="chip">' + icon('calendar') + '当日共 ' + room.availablePeriods + ' 节空闲</span></div>' +
      roomPeriodStrip(room) +
      '<div class="room-free"><span class="room-free-label">空闲时段</span>' + freeChips + more + '</div>' +
      '</article>';
  }

  function renderRooms() {
    const buildings = [];
    DATA.rooms.forEach(function (room) {
      if (buildings.indexOf(room.building) === -1) buildings.push(room.building);
    });
    const results = roomResults();
    const capacityItems = [
      { value: 0, label: '不限容量' }, { value: 40, label: '≥ 40 人' }, { value: 60, label: '≥ 60 人' },
      { value: 80, label: '≥ 80 人' }, { value: 100, label: '≥ 100 人' }, { value: 120, label: '≥ 120 人' },
      { value: 160, label: '≥ 160 人' }
    ];
    const buildingItems = [{ value: 'all', label: '全部教学楼' }].concat(buildings.map(function (b) {
      return { value: b, label: b };
    }));
    const consecutiveItems = [1, 2, 3, 4, 5, 6].map(function (n) {
      return { value: n, label: '≥ ' + n + ' 节' };
    });

    const resultContext = '<span class="chip">第 ' + state.rooms.week + ' 教学周</span>' +
      '<span class="chip">' + dayName(state.rooms.day) + '</span>' +
      '<span class="chip">' + periodText(state.rooms.start, state.rooms.end) + '</span>' +
      (state.rooms.building !== 'all' ? '<span class="chip">' + escapeHtml(state.rooms.building) + '</span>' : '') +
      '<span class="chip">连堂 ≥ ' + state.rooms.consecutive + ' 节</span>' +
      (state.rooms.multimedia ? '<span class="chip">仅多媒体</span>' : '') +
      (state.rooms.minCapacity ? '<span class="chip">≥ ' + state.rooms.minCapacity + ' 人</span>' : '');

    const roomHtml = results.length
      ? '<div class="room-grid">' + results.map(roomCard).join('') + '</div>'
      : '<div class="card"><div class="empty-state"><span class="empty-icon">' + icon('door') + '</span>' +
        '<h3>当前条件下没有空闲教室</h3><p>试试放宽节次范围、减少连堂节数，或关闭“仅多媒体”与容量限制。也可以换一栋教学楼再查一次。</p>' +
        '<button class="btn btn-secondary" type="button" data-action="reset-rooms">' + icon('reset') + '恢复默认条件</button></div></div>';

    return '<div>' +
      pageHead('Space Finder', '空教室查询', '按教学周、星期、节次、教学楼筛选空闲教室；系统按当日最长连续空闲时长倒序排列。',
        '<span class="badge badge-accent">' + icon('door') + DATA.rooms.length + ' 间教室 · 5 天 × 12 节</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-action="reset-rooms">' + icon('reset') + '重置条件</button>') +
      '<form class="card filter-card" id="roomsForm" data-form="rooms" novalidate>' +
      '<div class="filter-grid">' +
      '<div class="filter-field"><label for="roomWeek">教学周</label><select class="select" id="roomWeek" name="week">' + optionTags(teachingWeeks(), state.rooms.week) + '</select></div>' +
      '<div class="filter-field"><label for="roomDay">星期</label><select class="select" id="roomDay" name="day">' + optionTags(DAYS.map(function (d) { return { value: d.id, label: d.name }; }), state.rooms.day) + '</select></div>' +
      '<div class="filter-field"><label for="roomStart">起始节次</label><select class="select" id="roomStart" name="start">' + optionTags(periodOptions(), state.rooms.start) + '</select></div>' +
      '<div class="filter-field"><label for="roomEnd">结束节次</label><select class="select" id="roomEnd" name="end">' + optionTags(periodOptions(), state.rooms.end) + '</select></div>' +
      '<div class="filter-field"><label for="roomBuilding">教学楼</label><select class="select" id="roomBuilding" name="building">' + optionTags(buildingItems, state.rooms.building) + '</select></div>' +
      '<div class="filter-field"><label for="roomCapacity">容量要求</label><select class="select" id="roomCapacity" name="minCapacity">' + optionTags(capacityItems, state.rooms.minCapacity) + '</select></div>' +
      '<div class="filter-field span-3"><label for="roomConsecutive">连堂要求</label><select class="select" id="roomConsecutive" name="consecutive">' + optionTags(consecutiveItems, state.rooms.consecutive) + '</select></div>' +
      '<div class="filter-field span-3"><span class="filter-label">设备要求</span><label class="switch" for="roomMultimedia"><input type="checkbox" id="roomMultimedia" name="multimedia" ' + (state.rooms.multimedia ? 'checked' : '') + '><span class="switch-track"></span><span>仅看有多媒体的教室</span></label></div>' +
      '<div class="filter-field span-6 filter-actions"><button class="btn btn-secondary" type="reset" data-action="reset-rooms">清空条件</button><button class="btn btn-primary" type="submit">' + icon('search') + '查询空教室</button></div>' +
      '</div>' +
      (state.rooms.error ? '<p class="form-error" role="alert" style="margin-top:12px">' + escapeHtml(state.rooms.error) + '</p>' : '') +
      '</form>' +
      '<div class="result-summary"><div class="result-count"><strong>' + results.length + '</strong><span>间教室满足条件</span></div>' +
      '<div class="result-context">' + resultContext + '</div></div>' +
      roomHtml +
      '<div class="home-footnote">' + icon('info') + '<span>判定规则：请求节次区间必须被同一个连续空闲块完整覆盖；结果按当日最长连续空闲时长倒序。课表为固定种子生成的模拟数据，共 ' + DATA.timetableMeta.entries + ' 条排课记录。</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 办事向导
   * ------------------------------------------------------------------ */

  function guideProgress(procId) {
    const record = state.guide.progress[procId];
    return record && Array.isArray(record.completed) ? record.completed.slice() : [];
  }

  function saveGuideProgress(procId, completed) {
    state.guide.progress[procId] = { completed: completed.slice(), updatedAt: Date.now() };
    writeJson(WIZARD_KEY, state.guide.progress);
  }

  function renderGuide() {
    const proc = DATA.procedures.find(function (p) { return p.id === state.guide.procedureId; }) || DATA.procedures[0];
    const completed = guideProgress(proc.id);
    const topo = E.topoSort(proc.nodes);
    const nodeMap = new Map(proc.nodes.map(function (node) { return [node.id, node]; }));
    const doneSet = new Set(completed.filter(function (id) { return nodeMap.has(id); }));
    const total = proc.nodes.length;
    const doneCount = doneSet.size;
    const percent = total ? Math.round(doneCount / total * 100) : 0;
    const orderMap = new Map(topo.order.map(function (id, index) { return [id, index + 1]; }));

    const procedureItems = DATA.procedures.map(function (item, index) {
      return '<button class="procedure-item' + (item.id === proc.id ? ' is-active' : '') + '" type="button" data-procedure="' + item.id + '" aria-pressed="' + (item.id === proc.id ? 'true' : 'false') + '">' +
        '<span class="procedure-num">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<span class="procedure-copy"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.category) + ' · ' + escapeHtml(item.time) + '</span></span>' +
        icon('chevron-right', 'procedure-arrow') + '</button>';
    }).join('');

    let levelsHtml = '';
    topo.levels.forEach(function (levelIds, index) {
      const nodes = levelIds.map(function (id) { return nodeMap.get(id); }).filter(Boolean);
      if (!nodes.length) return;
      const parallel = nodes.length > 1;
      levelsHtml += '<div class="flow-level' + (parallel ? ' is-parallel' : '') + '">' +
        '<div class="level-head"><span class="level-index">' + (index + 1) + '</span><strong>阶段 ' + (index + 1) + '</strong>' +
        (parallel ? '<span class="badge badge-accent">' + icon('git-branch') + '可并行办理</span>' : '') +
        '</div><div class="flow-nodes">' + nodes.map(function (node) {
          const deps = (node.deps || []).map(function (dep) {
            const target = nodeMap.get(dep);
            return target ? target.title : dep;
          });
          return '<label class="flow-node' + (doneSet.has(node.id) ? ' is-done' : '') + '">' +
            '<input type="checkbox" data-guide-check data-proc="' + proc.id + '" data-node="' + node.id + '" aria-label="标记完成：' + escapeHtml(node.title) + '" ' + (doneSet.has(node.id) ? 'checked' : '') + '>' +
            '<span class="flow-check">' + icon('check') + '</span>' +
            '<div class="flow-main"><div class="flow-title"><h4>' + escapeHtml(node.title) + '</h4><span class="duration">' + escapeHtml(node.duration || '') + '</span></div>' +
            '<p>' + escapeHtml(node.desc || '') + '</p>' +
            ((node.materials && node.materials.length) ? '<div class="flow-materials">' + node.materials.map(function (m) { return '<span class="chip">' + escapeHtml(m) + '</span>'; }).join('') + '</div>' : '') +
            '<div class="flow-deps">' + icon('git-branch') + (deps.length ? '依赖：' + escapeHtml(deps.join('、')) : '起始节点，可直接办理') + '</div>' +
            '</div></label>';
        }).join('') + '</div></div>';
    });

    const allMaterials = [];
    proc.nodes.forEach(function (node) {
      (node.materials || []).forEach(function (m) {
        if (allMaterials.indexOf(m) === -1) allMaterials.push(m);
      });
    });

    const cycleHtml = topo.hasCycle
      ? '<div class="conflict-alert">' + icon('alert') + '<div><strong>检测到循环依赖</strong><p>节点：' + escapeHtml(topo.cycle.join(' → ')) + '。请检查流程配置后再办理。</p></div></div>'
      : '';

    return '<div>' +
      pageHead('Service Flow', '办事向导', '选一件事，自动生成材料清单和办理顺序；依赖关系由拓扑排序计算，同层节点可以并行办理。',
        '<span class="badge badge-primary">' + icon('git-branch') + '拓扑排序驱动</span>' +
        '<span class="badge">' + (storageAvailable ? '进度自动保存' : '当前浏览器未启用本地存储') + '</span>') +
      '<div class="guide-layout">' +
      '<section class="card procedure-list-card"><div class="procedure-list-head"><h2>选择要办理的事项</h2><span class="badge">' + DATA.procedures.length + ' 项</span></div>' +
      '<div class="procedure-list">' + procedureItems + '</div></section>' +
      '<section class="card guide-detail">' +
      '<div class="guide-detail-head"><div class="guide-detail-title"><div><span class="eyebrow">' + escapeHtml(proc.category) + '</span><h2>' + escapeHtml(proc.title) + '</h2><p>' + escapeHtml(proc.summary) + '</p></div>' +
      '<span class="badge badge-accent">' + icon('check-circle') + '已完成 ' + doneCount + ' / ' + total + '</span></div>' +
      '<div class="guide-meta">' +
      '<div>' + icon('clock') + '<span><strong>办理时长</strong>' + escapeHtml(proc.time) + '</span></div>' +
      '<div>' + icon('map-pin') + '<span><strong>办理地点</strong>' + escapeHtml(proc.place) + '</span></div>' +
      '<div>' + icon('layers') + '<span><strong>流程节点</strong>' + total + ' 个节点</span></div>' +
      '<div>' + icon('git-branch') + '<span><strong>并行阶段</strong>' + topo.parallelLevels.length + ' 个</span></div>' +
      '</div></div>' +
      '<div class="guide-body">' + cycleHtml +
      '<div class="progress-panel"><div class="progress-copy"><strong><em id="guidePercent">' + percent + '%</em> 已完成 ' + '<span id="guideDoneCount">' + doneCount + '</span> / ' + total + ' 个节点</strong><span>勾选左侧节点即可记录进度，刷新页面不会丢失。</span>' +
      '<div class="progress-track"><div class="progress-fill" id="guideProgressFill" style="width:' + percent + '%"></div></div></div>' +
      '<div class="progress-actions"><button class="btn btn-quiet btn-sm" type="button" data-action="reset-guide" data-proc="' + proc.id + '" ' + (doneCount ? '' : 'disabled') + '>' + icon('reset') + '重置进度</button></div></div>' +
      '<div class="saved-note">' + icon('check-circle') + (storageAvailable ? '进度已自动保存到本机 localStorage · ' + doneCount + ' 项完成' : '当前浏览器未启用本地存储，进度仅在本次打开有效') + '</div>' +
      '<div id="wizardCompleteBanner">' + (doneCount === total && total > 0 ? '<div class="wizard-complete"><span class="icon-tile">' + icon('check-circle') + '</span><div><strong>本流程全部节点已完成</strong><p>可以按材料清单做最后核对；如需重新办理，可重置进度。</p></div></div>' : '') + '</div>' +
      '<div class="flow-levels">' + levelsHtml + '</div>' +
      '<div class="material-summary"><h3>' + icon('file') + '材料清单汇总</h3><p style="margin-top:3px;font-size:9px;color:var(--text-3)">来自所有节点的材料去重汇总，可按办理顺序逐项准备。</p>' +
      (allMaterials.length ? allMaterials.map(function (m) { return '<span class="chip">' + escapeHtml(m) + '</span>'; }).join('') : '<span class="chip">本流程无需额外材料</span>') +
      '</div>' +
      '</div></section></div>' +
      '<div class="home-footnote">' + icon('info') + '<span>顺序由 Kahn 拓扑排序生成：每个节点在所有前置依赖完成后才可办理，同一层节点互不依赖，可以并行。演示数据，实际以学校最新通知为准。</span></div>' +
      '</div>';
  }

  function updateWizardUI(procId) {
    const proc = DATA.procedures.find(function (p) { return p.id === procId; });
    if (!proc) return;
    const completed = guideProgress(procId);
    const total = proc.nodes.length;
    const doneCount = completed.length;
    const percent = total ? Math.round(doneCount / total * 100) : 0;
    const percentEl = document.getElementById('guidePercent');
    const countEl = document.getElementById('guideDoneCount');
    const fill = document.getElementById('guideProgressFill');
    if (percentEl) percentEl.textContent = percent + '%';
    if (countEl) countEl.textContent = String(doneCount);
    if (fill) fill.style.width = percent + '%';
    const banner = document.getElementById('wizardCompleteBanner');
    if (banner) {
      banner.innerHTML = doneCount === total && total > 0
        ? '<div class="wizard-complete"><span class="icon-tile">' + icon('check-circle') + '</span><div><strong>本流程全部节点已完成</strong><p>可以按材料清单做最后核对；如需重新办理，可重置进度。</p></div></div>'
        : '';
    }
    const resetBtn = document.querySelector('[data-action="reset-guide"]');
    if (resetBtn) resetBtn.disabled = doneCount === 0;
  }

  function handleGuideCheck(input) {
    if (!input || !input.matches('[data-guide-check]')) return;
    const procId = input.getAttribute('data-proc');
    const nodeId = input.getAttribute('data-node');
    const completed = guideProgress(procId);
    const index = completed.indexOf(nodeId);
    if (input.checked && index === -1) completed.push(nodeId);
    if (!input.checked && index !== -1) completed.splice(index, 1);
    saveGuideProgress(procId, completed);
    const label = input.closest('.flow-node');
    if (label) label.classList.toggle('is-done', input.checked);
    updateWizardUI(procId);
    if (!storageAvailable) toast('进度仅在本次打开有效', '浏览器禁用了 localStorage，刷新后不会保留。', 'warning');
  }

  /* ------------------------------------------------------------------ *
   * 学习助手
   * ------------------------------------------------------------------ */

  function studyCourses() {
    let courses = activeCoursesForWeek(DATA.studentCourses, state.study.prefs.week);
    if (!state.study.conflictDemo) {
      courses = courses.filter(function (course) { return course.id !== 'SC-09'; });
    }
    return courses;
  }

  function renderTimetable(courses) {
    const conflictIds = new Set();
    const lanes = {};
    const conflicts = E.findConflicts(courses);
    conflicts.conflicts.forEach(function (item) {
      conflictIds.add(item.a.id);
      conflictIds.add(item.b.id);
      if (lanes[item.a.id] == null) lanes[item.a.id] = 0;
      if (lanes[item.b.id] == null) lanes[item.b.id] = 1;
    });

    let html = '<div class="timetable-scroll"><div class="timetable" role="img" aria-label="第 ' + state.study.prefs.week + ' 教学周个人课表">';
    html += '<div class="tt-corner">节次</div>';
    DAYS.forEach(function (d) {
      html += '<div class="tt-day" style="grid-column:' + (d.id + 1) + ';grid-row:1">' + d.name + '<span>' + (activeCoursesForWeek(courses, state.study.prefs.week).filter(function (c) { return c.day === d.id; }).length) + ' 门</span></div>';
    });
    for (let p = 1; p <= 12; p += 1) {
      html += '<div class="tt-period" style="grid-column:1;grid-row:' + (p + 1) + '" title="第 ' + p + ' 节 ' + E.PERIOD_TIMES[p - 1].start + '—' + E.PERIOD_TIMES[p - 1].end + '">' + p + '<span>' + E.PERIOD_TIMES[p - 1].start + '</span></div>';
      DAYS.forEach(function (d) {
        html += '<div class="tt-slot' + (p % 2 === 0 ? ' is-even' : '') + '" style="grid-column:' + (d.id + 1) + ';grid-row:' + (p + 1) + '"></div>';
      });
    }
    courses.forEach(function (course) {
      const isConflict = conflictIds.has(course.id);
      const lane = lanes[course.id];
      const classes = ['tt-course'];
      if (course.type === '选修') classes.push('is-optional');
      if (isConflict) classes.push('is-conflict');
      if (lane != null) classes.push('has-lane', 'lane-' + lane);
      html += '<div class="' + classes.join(' ') + '" style="grid-column:' + (course.day + 1) + ';grid-row:' + (course.start + 1) + ' / span ' + (course.end - course.start + 1) + '" title="' +
        escapeHtml(course.name + ' · ' + course.teacher + ' · ' + course.location + ' · ' + periodText(course.start, course.end)) + '">' +
        '<strong>' + escapeHtml(course.name.replace('（选修）', '')) + '</strong><span>' + escapeHtml(course.location) + '</span></div>';
    });
    html += '</div></div>';
    html += '<div class="tt-scroll-hint">' + icon('arrow-right') + '左右滑动查看完整 5 天课表</div>';
    return html;
  }

  function slotText(slot) {
    return dayName(slot.day) + ' ' + periodText(slot.start, slot.end) + ' · ' + slot.length + ' 节';
  }

  function renderFreeSlots(courses) {
    const prefs = state.study.prefs;
    const recommend = E.recommendSlots(courses, {
      week: prefs.week,
      dayStart: prefs.dayStart,
      dayEnd: prefs.dayEnd,
      minLength: prefs.minLength,
      preference: prefs.preference,
      limit: 5
    });
    const top = recommend[0] || null;
    const slots = E.findFreeSlots(courses, {
      week: prefs.week,
      start: prefs.dayStart,
      end: prefs.dayEnd,
      days: [1, 2, 3, 4, 5],
      minLength: prefs.minLength
    });
    const byDay = {};
    slots.forEach(function (slot) {
      if (!byDay[slot.day]) byDay[slot.day] = [];
      byDay[slot.day].push(slot);
    });
    const dayRows = DAYS.map(function (d) {
      const list = (byDay[d.id] || []).slice().sort(function (a, b) {
        if (b.length !== a.length) return b.length - a.length;
        return a.start - b.start;
      });
      const best = list.slice(0, 2);
      return '<div class="free-day"><span class="free-day-name">' + d.name + '</span><span class="free-day-slots">' +
        (best.length ? best.map(function (slot) {
          return '<span class="chip" title="' + escapeHtml(timeText(slot.start, slot.end)) + '">' + periodText(slot.start, slot.end) + '</span>';
        }).join('') : '<span class="empty-slot">已排满 / 无满足时长的空闲</span>') +
        '</span></div>';
    }).join('');

    const topHtml = top
      ? '<div class="top-slot"><span class="icon-tile">' + icon('sparkles') + '</span><div><strong>最推荐：' + escapeHtml(slotText(top)) + '</strong><span>' + escapeHtml(timeText(top.start, top.end)) + ' · 作息范围内连续空闲</span></div></div>'
      : '<div class="top-slot" style="border-color:var(--border);background:var(--surface-soft)"><span class="icon-tile">' + icon('clock') + '</span><div><strong>没有满足条件的空闲段</strong><span>可以缩短单次时长，或扩大作息节次范围。</span></div></div>';

    return '<div class="free-card">' +
      '<div class="card-head"><div><h3>每日空闲时段推荐</h3><p>结合个人课表与作息设置，按连续时长和偏好打分。</p></div></div>' +
      '<form class="free-prefs" data-form="studyPrefs" novalidate>' +
      '<div class="field"><label for="freePreference">偏好时段</label><select class="select" id="freePreference" name="preference">' +
      optionTags([{ value: 'any', label: '不限时段' }, { value: 'morning', label: '上午优先' }, { value: 'afternoon', label: '下午优先' }, { value: 'evening', label: '晚上优先' }], prefs.preference) + '</select></div>' +
      '<div class="field"><label for="freeMinLength">单次时长</label><select class="select" id="freeMinLength" name="minLength">' +
      optionTags([1, 2, 3, 4].map(function (n) { return { value: n, label: n + ' 节' }; }), prefs.minLength) + '</select></div>' +
      '<div class="field"><label for="freeDayStart">作息起始节</label><select class="select" id="freeDayStart" name="dayStart">' + optionTags(periodOptions(), prefs.dayStart) + '</select></div>' +
      '<div class="field"><label for="freeDayEnd">作息结束节</label><select class="select" id="freeDayEnd" name="dayEnd">' + optionTags(periodOptions(), prefs.dayEnd) + '</select></div>' +
      '<div class="free-submit"><button class="btn btn-primary" type="submit">' + icon('sparkles') + '按此作息重新推荐</button></div>' +
      '</form>' + topHtml +
      '<div class="free-days">' + dayRows + '</div>' +
      '<div class="saved-note">' + icon('info') + '当前统计第 ' + prefs.week + ' 周，作息 ' + periodText(prefs.dayStart, prefs.dayEnd) + '。偏好设置自动保存在本机。</div>' +
      '</div>';
  }

  function gpaPointCell(course) {
    const score = Number(course.score);
    const credits = Number(course.credits);
    if (!Number.isFinite(score) || score < 0 || score > 100 || !Number.isFinite(credits) || credits <= 0) return '—';
    return E.scoreToPoint(score).toFixed(1);
  }

  function renderGpaSummary() {
    const result = E.gpa(state.study.gpaCourses);
    const mappingRows = GPA_MAPPING.map(function (row) {
      return '<div class="mapping-row"><span>' + escapeHtml(row.range) + ' 分</span><strong>' + escapeHtml(row.point) + '</strong></div>';
    }).join('');
    return '<div class="gpa-hero">' +
      '<div class="gpa-big is-primary"><span>加权 GPA · 4.0 制</span><strong>' + Number(result.gpa4).toFixed(2) + '</strong><small>Σ(绩点×学分) ÷ Σ学分</small></div>' +
      '<div class="gpa-big"><span>加权平均分 · 百分制</span><strong>' + Number(result.gpa100).toFixed(2) + '</strong><small>Σ(成绩×学分) ÷ Σ学分</small></div>' +
      '</div>' +
      '<div class="gpa-formula">有效课程 ' + result.validCount + ' 门 · 总学分 ' + formatCredits(result.totalCredits) +
      (result.invalidCount ? '<br>已忽略 ' + result.invalidCount + ' 门无效输入（学分≤0 或成绩不在 0—100）' : '') + '</div>' +
      '<div class="mapping"><div class="mapping-row"><span>百分制分数段</span><strong>4.0 绩点</strong></div>' + mappingRows + '</div>';
  }

  function renderGpaTable() {
    const rows = state.study.gpaCourses.map(function (course, index) {
      return '<tr>' +
        '<td><input class="cell-input" type="text" data-gpa-field="name" data-index="' + index + '" value="' + escapeHtml(course.name) + '" aria-label="第 ' + (index + 1) + ' 门课程名称" placeholder="课程名称"></td>' +
        '<td><input class="cell-input num-input" type="number" min="0" max="12" step="0.5" data-gpa-field="credits" data-index="' + index + '" value="' + escapeHtml(String(course.credits)) + '" aria-label="第 ' + (index + 1) + ' 门课程学分"></td>' +
        '<td><input class="cell-input num-input" type="number" min="0" max="100" step="1" data-gpa-field="score" data-index="' + index + '" value="' + escapeHtml(String(course.score)) + '" aria-label="第 ' + (index + 1) + ' 门课程成绩"></td>' +
        '<td class="point-cell" data-point-index="' + index + '">' + gpaPointCell(course) + '</td>' +
        '<td><button class="row-delete" type="button" data-action="gpa-delete" data-index="' + index + '" aria-label="删除第 ' + (index + 1) + ' 门课程">' + icon('trash') + '</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="gpa-table-wrap"><table class="data-table"><thead><tr><th>课程</th><th>学分</th><th>成绩</th><th>绩点</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="gpa-tools"><button class="btn btn-quiet btn-sm" type="button" data-action="gpa-add">' + icon('plus') + '添加课程</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-action="gpa-reset">' + icon('reset') + '恢复示例成绩</button></div>';
  }

  function renderStudy() {
    const prefs = state.study.prefs;
    const courses = studyCourses();
    const conflicts = E.findConflicts(courses);
    const allSlotsCount = E.findFreeSlots(courses, {
      week: prefs.week, start: prefs.dayStart, end: prefs.dayEnd, days: [1, 2, 3, 4, 5], minLength: 1
    }).length;

    const conflictAlert = conflicts.hasConflict
      ? '<div class="conflict-alert">' + icon('alert') + '<div><strong>检测到 ' + conflicts.count + ' 处课表冲突</strong><p>同一节次在两处地点重复排课。请与辅导员或教学秘书确认，及时调整选课。</p></div></div>'
      : '<div class="conflict-alert is-clear">' + icon('check-circle') + '<div><strong>本周课表未发现冲突</strong><p>所有课程在时间与教学周上均不重叠。切换教学周可检查其他周次。</p></div></div>';

    const conflictList = conflicts.conflicts.map(function (item) {
      return '<div class="conflict-item">' + icon('alert') + '<div><strong>' + dayName(item.day) + ' ' + periodText(item.start, item.end) + ' · 两处地点同时段</strong>' +
        '<p>' + escapeHtml(item.a.name) + ' @ ' + escapeHtml(item.a.location || '未填写') + ' 与 ' + escapeHtml(item.b.name) + ' @ ' + escapeHtml(item.b.location || '未填写') + ' 重叠。' + escapeHtml(item.reason) + '</p></div></div>';
    }).join('');

    const weekSelect = '<label class="sr-only" for="studyWeek">教学周</label><select class="select" id="studyWeek" data-study-week aria-label="选择教学周">' + optionTags(teachingWeeks(), prefs.week) + '</select>';

    return '<div>' +
      pageHead('Study Planner', '学习助手', '把课表冲突、空闲时段和 GPA 放在一个页面：既能发现问题，也能安排下一段专注时间。',
        '<span class="badge badge-primary">' + icon('calendar') + '第 ' + prefs.week + ' 教学周</span>' +
        '<button class="btn btn-quiet btn-sm" type="button" data-action="toggle-conflict-demo">' + icon('git-branch') + (state.study.conflictDemo ? '隐藏示例冲突' : '恢复示例冲突') + '</button>') +
      '<div class="study-top">' +
      '<section class="card timetable-card"><div class="card-head"><div><h3>课表冲突检测</h3><p>同天节次区间求交 + 教学周区间求交，冲突课程会标红。</p></div></div>' +
      '<div class="tt-toolbar">' + weekSelect +
      '<div class="tt-legend"><span><span class="legend-dot"></span>必修</span><span><span class="legend-dot optional"></span>选修</span><span><span class="legend-dot conflict"></span>冲突</span></div></div>' +
      conflictAlert +
      renderTimetable(courses) +
      (conflictList ? '<div class="conflict-list">' + conflictList + '</div>' : '') +
      '<div class="saved-note">' + icon('info') + '演示课表中预置了 1 处冲突，可用右上角按钮隐藏后再次检测。</div>' +
      '</section>' +
      '<section class="card">' + renderFreeSlots(courses) + '</section>' +
      '</div>' +
      '<section class="card gpa-card"><div class="card-head"><div><h3>加权 GPA 计算</h3><p>支持学分加权，4.0 制与百分制双显示；修改成绩后实时重算。</p></div>' +
      '<span class="badge">有效课程 ' + E.gpa(state.study.gpaCourses).validCount + ' 门</span></div>' +
      '<div class="gpa-layout"><div>' + renderGpaTable() + '</div><div class="gpa-summary" id="gpaResults">' + renderGpaSummary() + '</div></div>' +
      '</section>' +
      '<div class="home-footnote">' + icon('info') + '<span>个人课表、成绩与作息为模拟数据。冲突检测只比较同一教学周内重叠的节次；空闲统计覆盖第 1—12 节，' + allSlotsCount + ' 个空闲段可选。</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 数据看板
   * ------------------------------------------------------------------ */

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 100;
    const step = value > 5000 ? 1000 : value > 1000 ? 500 : value > 200 ? 100 : value > 100 ? 50 : 10;
    return Math.ceil(value / step) * step;
  }

  function chartLine() {
    const data = DATA.dashboard.library;
    const labels = DATA.dashboard.months;
    const width = 760;
    const height = 288;
    const pad = { left: 46, right: 18, top: 18, bottom: 34 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max.apply(null, data.borrow.concat(data.return)));
    const x = function (i) { return pad.left + (i * innerW) / (labels.length - 1); };
    const y = function (v) { return pad.top + innerH - (v / max) * innerH; };
    let grid = '';
    for (let i = 0; i <= 4; i += 1) {
      const value = (max / 4) * i;
      const yPos = y(value);
      grid += '<line class="chart-grid-line" x1="' + pad.left + '" y1="' + yPos.toFixed(1) + '" x2="' + (width - pad.right) + '" y2="' + yPos.toFixed(1) + '"></line>';
      grid += '<text class="chart-axis-text" x="' + (pad.left - 9) + '" y="' + (yPos + 3).toFixed(1) + '" text-anchor="end">' + formatNumber(value) + '</text>';
    }
    let xLabels = '';
    labels.forEach(function (label, i) {
      xLabels += '<text class="chart-axis-text" x="' + x(i).toFixed(1) + '" y="' + (height - 12) + '" text-anchor="middle">' + escapeHtml(label) + '</text>';
    });
    const borrowPath = data.borrow.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    const returnPath = data.return.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    const areaPath = 'M' + x(0).toFixed(1) + ' ' + y(data.borrow[0]).toFixed(1) + ' ' +
      data.borrow.map(function (v, i) { return 'L' + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ') +
      ' L' + x(labels.length - 1).toFixed(1) + ' ' + (height - pad.bottom) + ' L' + x(0).toFixed(1) + ' ' + (height - pad.bottom) + ' Z';
    let points = '';
    data.borrow.forEach(function (v, i) {
      points += '<circle class="chart-point" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.2"><title>' + escapeHtml(labels[i] + '：借阅 ' + formatNumber(v) + ' 册') + '</title></circle>';
      points += '<circle class="chart-point-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="10"><title>' + escapeHtml(labels[i] + '：借阅 ' + formatNumber(v) + ' 册') + '</title></circle>';
    });
    data.return.forEach(function (v, i) {
      points += '<circle class="chart-point secondary" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.4"><title>' + escapeHtml(labels[i] + '：归还 ' + formatNumber(v) + ' 册') + '</title></circle>';
    });
    return '<figure class="chart-wrap" style="margin:0">' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="近 12 个月图书借阅量与归还量折线图">' +
      '<defs><linearGradient id="borrowArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-1)" stop-opacity="0.22"/><stop offset="100%" stop-color="var(--chart-1)" stop-opacity="0"/></linearGradient></defs>' +
      grid + xLabels +
      '<path class="chart-area" d="' + areaPath + '" style="fill:url(#borrowArea)"></path>' +
      '<path class="chart-line primary" d="' + borrowPath + '"></path>' +
      '<path class="chart-line secondary" d="' + returnPath + '"></path>' +
      points +
      '</svg></figure>';
  }

  function chartBar() {
    const data = DATA.dashboard.repairs;
    const labels = DATA.dashboard.months;
    const width = 760;
    const height = 270;
    const pad = { left: 42, right: 16, top: 18, bottom: 32 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const max = niceMax(Math.max.apply(null, data));
    const slot = innerW / data.length;
    const barW = Math.min(28, slot * 0.52);
    const x = function (i) { return pad.left + slot * i + (slot - barW) / 2; };
    const y = function (v) { return pad.top + innerH - (v / max) * innerH; };
    let grid = '';
    for (let i = 0; i <= 4; i += 1) {
      const value = (max / 4) * i;
      const yPos = y(value);
      grid += '<line class="chart-grid-line" x1="' + pad.left + '" y1="' + yPos.toFixed(1) + '" x2="' + (width - pad.right) + '" y2="' + yPos.toFixed(1) + '"></line>';
      grid += '<text class="chart-axis-text" x="' + (pad.left - 9) + '" y="' + (yPos + 3).toFixed(1) + '" text-anchor="end">' + formatNumber(value) + '</text>';
    }
    let bars = '';
    data.forEach(function (value, i) {
      const barH = Math.max(2, (value / max) * innerH);
      const barY = pad.top + innerH - barH;
      bars += '<rect class="chart-bar" x="' + x(i).toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="5"><title>' + escapeHtml(labels[i] + '：报修 ' + value + ' 单') + '</title></rect>';
      bars += '<text class="chart-value-text" x="' + (x(i) + barW / 2).toFixed(1) + '" y="' + (barY - 5).toFixed(1) + '" text-anchor="middle">' + value + '</text>';
      bars += '<text class="chart-axis-text" x="' + (x(i) + barW / 2).toFixed(1) + '" y="' + (height - 11) + '" text-anchor="middle">' + escapeHtml(labels[i]) + '</text>';
    });
    return '<figure class="chart-wrap" style="margin:0">' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="近 12 个月宿舍与校园报修单量柱状图">' +
      grid + bars +
      '</svg></figure>';
  }

  function chartDonut() {
    const services = DATA.dashboard.services;
    const total = services.reduce(function (sum, item) { return sum + item.value; }, 0);
    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    let segments = '';
    services.forEach(function (item) {
      const length = (item.value / total) * circumference;
      segments += '<circle class="donut-seg" cx="86" cy="86" r="' + radius + '" stroke="' + escapeHtml(item.color) + '" stroke-dasharray="' + length.toFixed(2) + ' ' + (circumference - length).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 86 86)"><title>' + escapeHtml(item.name + '：' + item.value + ' 件') + '</title></circle>';
      offset += length;
    });
    const legend = services.map(function (item) {
      const pct = (item.value / total * 100).toFixed(1);
      return '<div class="donut-legend-row"><span class="legend-dot" style="background:' + escapeHtml(item.color) + '"></span><span>' + escapeHtml(item.name) + '</span><strong>' + pct + '%</strong></div>';
    }).join('');
    return '<div class="donut-wrap"><svg viewBox="0 0 172 172" role="img" aria-label="办事办件类型占比环形图">' +
      '<circle cx="86" cy="86" r="' + radius + '" fill="none" stroke="var(--surface-muted)" stroke-width="22"></circle>' +
      segments +
      '<text class="donut-center-value" x="86" y="84">' + formatNumber(total) + '</text>' +
      '<text class="donut-center-label" x="86" y="99">年度办件量（件）</text>' +
      '</svg><div class="donut-legend">' + legend + '</div></div>';
  }

  function renderAnalytics() {
    const dash = DATA.dashboard;
    const kpiHtml = dash.kpis.map(function (kpi) {
      const good = kpi.id === 'response' ? kpi.trend <= 0 : kpi.trend >= 0;
      const arrow = kpi.trend >= 0 ? '↑' : '↓';
      const display = kpi.id === 'repair' ? Number(kpi.value).toFixed(1) : formatNumber(kpi.value);
      return '<div class="kpi-card"><div class="kpi-top"><span class="icon-tile tone-' + kpi.tone + '">' + icon(kpi.icon) + '</span>' +
        '<span class="trend ' + (good ? 'up' : 'down') + '">' + arrow + ' ' + Math.abs(kpi.trend).toFixed(1) + '%</span></div>' +
        '<div class="kpi-value">' + display + '<small>' + escapeHtml(kpi.unit) + '</small></div>' +
        '<div class="kpi-label">' + escapeHtml(kpi.label) + '</div></div>';
    }).join('');

    const maxBorrow = Math.max.apply(null, dash.library.borrow);
    const peakIndex = dash.library.borrow.indexOf(maxBorrow);
    const totalServices = dash.services.reduce(function (sum, item) { return sum + item.value; }, 0);
    const maxBuilding = Math.max.apply(null, dash.buildings.map(function (b) { return b.value; }));

    const buildingRows = dash.buildings.map(function (item) {
      return '<div class="rank-row"><span class="rank-label"><strong>' + escapeHtml(item.name) + '</strong></span>' +
        '<span class="rank-track"><span class="rank-fill" style="width:' + Math.round(item.value / maxBuilding * 100) + '%"></span></span>' +
        '<span class="rank-value">' + item.value + ' 单</span></div>';
    }).join('');

    const insightRows = dash.insights.map(function (text) {
      return '<div class="insight-item">' + icon('sparkles') + '<span>' + escapeHtml(text) + '</span></div>';
    }).join('');

    return '<div>' +
      pageHead('Campus Insights', '数据看板', '用原生 SVG 手绘折线、柱状和环形图，观察图书借阅、报修工单与办事办件的月度趋势。',
        '<span class="badge badge-primary">' + icon('chart') + '近 12 个月</span>' +
        '<span class="badge">' + icon('database') + '本地模拟数据</span>') +
      '<div class="kpi-grid">' + kpiHtml + '</div>' +
      '<div class="charts-grid">' +
      '<section class="card chart-card"><div class="chart-head"><div><h3>图书借阅与归还趋势</h3><p>折线图 · 原生 SVG · 单位：册</p></div>' +
      '<div class="chart-legend"><span class="legend-item"><span class="legend-swatch-line"></span>借阅</span><span class="legend-item"><span class="legend-swatch-line secondary"></span>归还</span></div></div>' +
      chartLine() +
      '<div class="chart-footnote">' + icon('info') + '<span>峰值出现在 ' + escapeHtml(dash.months[peakIndex]) + '，借阅 ' + formatNumber(maxBorrow) + ' 册；9—12 月开学季明显高于暑期。</span></div></section>' +
      '<section class="card chart-card"><div class="chart-head"><div><h3>办事办件类型占比</h3><p>环形图 · 年度累计 ' + formatNumber(totalServices) + ' 件</p></div></div>' +
      chartDonut() +
      '<div class="chart-footnote">' + icon('info') + '<span>学籍与证明、宿舍报修、校园卡服务位列前三，适合优先接入智能问答。</span></div></section>' +
      '</div>' +
      '<div class="analytics-lower">' +
      '<section class="card chart-card"><div class="chart-head"><div><h3>报修单量月度趋势</h3><p>柱状图 · 原生 SVG · 单位：单</p></div>' +
      '<span class="badge badge-accent">12 月 ' + dash.repairs[11] + ' 单</span></div>' + chartBar() +
      '<div class="chart-footnote">' + icon('info') + '<span>报修量随季节与开学季波动，9—12 月工单量较高；数据为本地模拟，用于演示图表与洞察表达。</span></div></section>' +
      '<section class="card chart-card"><div class="chart-head"><div><h3>洞察与楼宇分布</h3><p>把图表结论转成可执行的建议</p></div></div>' +
      '<div class="insight-list">' + insightRows + '</div>' +
      '<div class="rank-list">' + buildingRows + '</div>' +
      '<div class="chart-footnote">' + icon('info') + '<span>来源：本地模拟报修工单汇总，仅用于竞赛演示。</span></div></section>' +
      '</div>' +
      '<div class="home-footnote">' + icon('info') + '<span>' + escapeHtml(DATA.meta.dataNote) + ' 图表全部由手写 SVG 生成，未使用任何图表库或网络资源。</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 设置抽屉
   * ------------------------------------------------------------------ */

  function settingStatusHtml() {
    const status = AI.getStatus();
    const config = AI.getConfig();
    const desc = status.mode === 'api'
      ? '模型：' + (status.model || '未命名') + ' · 请求失败会自动回退本地'
      : '本地 TF-IDF 检索引擎 · 断网可用';
    return '<span class="icon-tile tone-' + (status.mode === 'api' ? 'violet' : 'blue') + '">' + icon(status.mode === 'api' ? 'sparkles' : 'database') + '</span>' +
      '<div><strong>' + escapeHtml(status.label) + '</strong><span>' + escapeHtml(desc) + '</span></div>' +
      '<span class="badge ' + (status.mode === 'api' ? 'badge-primary' : 'badge-accent') + '" style="margin-left:auto">' + (status.mode === 'api' ? 'API' : '离线') + '</span>' +
      '<span class="sr-only">' + (config.baseUrl ? '已配置接口地址' : '未配置接口地址') + '</span>';
  }

  function fillSettings() {
    const config = AI.getConfig();
    const base = document.getElementById('aiBaseUrl');
    const key = document.getElementById('aiKey');
    const model = document.getElementById('aiModel');
    if (base) base.value = config.baseUrl || '';
    if (key) key.value = config.apiKey || '';
    if (model) model.value = config.model || '';
    const status = document.getElementById('settingsStatus');
    if (status) status.innerHTML = settingStatusHtml();
    const stats = document.getElementById('settingsStats');
    if (stats) {
      stats.innerHTML =
        '<div><strong>' + DATA.knowledgeBase.length + '</strong>知识库条目</div>' +
        '<div><strong>' + DATA.rooms.length + '</strong>可查询教室</div>' +
        '<div><strong>' + DATA.timetableMeta.entries + '</strong>课表记录</div>' +
        '<div><strong>' + DATA.procedures.length + '</strong>办事流程</div>';
    }
    updateThemeUI();
  }

  function openSettings() {
    closePalette();
    const layer = document.getElementById('settingsLayer');
    if (!layer) return;
    lastFocusedBeforeLayer = document.activeElement;
    fillSettings();
    layer.hidden = false;
    lockBody(true);
    const err = document.getElementById('settingsError');
    if (err) err.hidden = true;
    setTimeout(function () {
      const input = document.getElementById('aiBaseUrl');
      if (input) input.focus();
    }, 30);
  }

  function closeSettings() {
    const layer = document.getElementById('settingsLayer');
    if (layer) layer.hidden = true;
    lockBody(layerOpen());
    if (lastFocusedBeforeLayer && typeof lastFocusedBeforeLayer.focus === 'function') {
      lastFocusedBeforeLayer.focus();
    }
  }

  /* ------------------------------------------------------------------ *
   * 命令面板
   * ------------------------------------------------------------------ */

  function buildPaletteItems() {
    const items = [];
    Object.keys(ROUTES).forEach(function (route) {
      items.push({
        group: '页面',
        label: ROUTES[route].title,
        hint: '跳转到' + ROUTES[route].title,
        icon: route === 'home' ? 'home' : route === 'ask' ? 'chat' : route === 'rooms' ? 'door' : route === 'guide' ? 'route' : route === 'study' ? 'book' : 'chart',
        keywords: route + ' ' + ROUTES[route].title + ' 跳转 页面',
        run: function () { setRoute(route); }
      });
    });
    DATA.procedures.forEach(function (proc) {
      items.push({
        group: '办事向导',
        label: proc.title,
        hint: proc.category + ' · ' + proc.time,
        icon: 'route',
        keywords: proc.title + ' ' + proc.category + ' 办理 流程',
        run: function () {
          state.guide.procedureId = proc.id;
          writeRaw(GUIDE_LAST_KEY, proc.id);
          setRoute('guide');
        }
      });
    });
    DATA.quickQuestions.forEach(function (question) {
      items.push({
        group: '快捷提问',
        label: question,
        hint: '在智能问答中提问',
        icon: 'sparkles',
        keywords: question + ' 提问 问答',
        run: function () {
          setRoute('ask');
          askQuestion(question);
        }
      });
    });
    items.push(
      {
        group: '操作',
        label: '一键演示完整路径',
        hint: '问答 → 空教室 → 办事向导 → 学习助手 → 数据看板',
        icon: 'play',
        keywords: 'demo 演示 一键 展示',
        run: function () { startDemo(); }
      },
      {
        group: '操作',
        label: state.theme === 'dark' ? '切换为浅色主题' : '切换为深色主题',
        hint: '主题偏好保存在 localStorage',
        icon: state.theme === 'dark' ? 'sun' : 'moon',
        keywords: '主题 深色 浅色 dark light 切换',
        run: function () { applyTheme(state.theme === 'dark' ? 'light' : 'dark', true); }
      },
      {
        group: '操作',
        label: '打开 AI 与界面设置',
        hint: '配置大模型 API、查看数据说明',
        icon: 'settings',
        keywords: '设置 api 配置 大模型 主题 快捷键',
        run: function () { openSettings(); }
      },
      {
        group: '操作',
        label: '清空问答记录',
        hint: '不会影响办事向导与学习助手数据',
        icon: 'reset',
        keywords: '清空 问答 记录 重置',
        run: function () {
          state.qa.history = [];
          state.qa.lastResult = null;
          setRoute('ask');
          toast('问答记录已清空', '知识库和本地数据没有受到影响。', 'success');
        }
      }
    );
    return items;
  }

  function openPalette() {
    closeSettings();
    const layer = document.getElementById('paletteLayer');
    const input = document.getElementById('paletteInput');
    if (!layer || !input) return;
    lastFocusedBeforeLayer = document.activeElement;
    paletteItems = buildPaletteItems();
    paletteIndex = 0;
    input.value = '';
    renderPaletteList('');
    layer.hidden = false;
    lockBody(true);
    setTimeout(function () { input.focus(); }, 30);
  }

  function closePalette() {
    const layer = document.getElementById('paletteLayer');
    if (!layer || layer.hidden) return;
    layer.hidden = true;
    lockBody(layerOpen());
    const trigger = document.getElementById('commandBtn');
    if (trigger) trigger.focus();
  }

  function renderPaletteList(query) {
    const q = String(query || '').trim().toLowerCase();
    filteredPalette = paletteItems.filter(function (item) {
      if (!q) return true;
      return (item.label + ' ' + item.hint + ' ' + item.keywords).toLowerCase().indexOf(q) >= 0;
    });
    paletteIndex = Math.max(0, Math.min(paletteIndex, filteredPalette.length - 1));
    const list = document.getElementById('paletteList');
    const count = document.getElementById('paletteCount');
    if (count) count.textContent = String(filteredPalette.length);
    if (!list) return;
    if (!filteredPalette.length) {
      list.innerHTML = '<div class="palette-empty">没有匹配的命令，试试“学籍证明”“空教室”或“主题”。</div>';
      return;
    }
    let html = '';
    let lastGroup = '';
    filteredPalette.forEach(function (item, index) {
      if (item.group !== lastGroup) {
        html += '<div class="palette-group-label">' + escapeHtml(item.group) + '</div>';
        lastGroup = item.group;
      }
      html += '<button class="palette-item' + (index === paletteIndex ? ' is-active' : '') + '" type="button" role="option" id="palette-item-' + index + '" aria-selected="' + (index === paletteIndex ? 'true' : 'false') + '" data-palette-index="' + index + '">' +
        '<span class="palette-item-icon">' + icon(item.icon) + '</span>' +
        '<span class="palette-item-copy"><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(item.hint) + '</span></span>' +
        '<span class="palette-item-enter">Enter</span></button>';
    });
    list.innerHTML = html;
    const input = document.getElementById('paletteInput');
    if (input) input.setAttribute('aria-activedescendant', 'palette-item-' + paletteIndex);
  }

  function movePalette(delta) {
    if (!filteredPalette.length) return;
    paletteIndex = (paletteIndex + delta + filteredPalette.length) % filteredPalette.length;
    renderPaletteList(document.getElementById('paletteInput') ? document.getElementById('paletteInput').value : '');
    const active = document.getElementById('palette-item-' + paletteIndex);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function runPaletteItem(index) {
    const item = filteredPalette[index];
    if (!item) return;
    const run = item.run;
    closePalette();
    try {
      const result = run();
      if (result && typeof result.catch === 'function') result.catch(function () {
        toast('操作没有完成', '请重试，或刷新页面后再试。', 'danger');
      });
    } catch (err) {
      toast('操作没有完成', err && err.message ? err.message : '命令执行失败。', 'danger');
    }
  }

  /* ------------------------------------------------------------------ *
   * 一键演示
   * ------------------------------------------------------------------ */

  const DEMO_STEPS = [
    {
      title: '智能问答：校园卡挂失',
      run: async function () {
        setRoute('ask');
        await sleep(260);
        await askQuestion('校园卡丢了怎么挂失？', { forceLocal: true });
        await sleep(2400);
      }
    },
    {
      title: '空教室：周三第 3—4 节',
      run: async function () {
        state.rooms.week = DATA.meta.week;
        state.rooms.day = 3;
        state.rooms.start = 3;
        state.rooms.end = 4;
        state.rooms.building = 'all';
        state.rooms.minCapacity = 60;
        state.rooms.multimedia = true;
        state.rooms.consecutive = 2;
        state.rooms.error = '';
        setRoute('rooms');
        await sleep(2600);
      }
    },
    {
      title: '办事向导：学籍证明',
      run: async function () {
        state.guide.procedureId = 'P01';
        writeRaw(GUIDE_LAST_KEY, 'P01');
        setRoute('guide');
        await sleep(2400);
      }
    },
    {
      title: '学习助手：冲突检测与 GPA',
      run: async function () {
        state.study.prefs.week = DATA.meta.week;
        state.study.conflictDemo = true;
        setRoute('study');
        await sleep(2600);
      }
    },
    {
      title: '数据看板：趋势与洞察',
      run: async function () {
        setRoute('analytics');
        await sleep(2400);
      }
    }
  ];

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function updateDemoHud(index, phase) {
    const stepEl = document.getElementById('demoStep');
    const titleEl = document.getElementById('demoTitle');
    const dots = document.getElementById('demoDots');
    if (stepEl) stepEl.textContent = '第 ' + (index + 1) + ' / ' + DEMO_STEPS.length + ' 步';
    if (titleEl) titleEl.textContent = DEMO_STEPS[index] ? DEMO_STEPS[index].title : '演示完成';
    if (dots) {
      dots.innerHTML = DEMO_STEPS.map(function (step, i) {
        const cls = i < index || (i === index && phase === 'done') ? 'is-done' : (i === index ? 'is-active' : '');
        return '<span class="demo-dot ' + cls + '"></span>';
      }).join('');
    }
  }

  async function startDemo() {
    if (state.demo.active) return;
    if (!storageAvailable) toast('本地存储不可用', '演示仍可运行，但办事进度与主题偏好不会保存。', 'warning');
    closeSettings();
    closePalette();
    state.demo.active = true;
    state.demo.index = 0;
    state.demo.token += 1;
    const token = state.demo.token;
    const hud = document.getElementById('demoHud');
    if (hud) hud.hidden = false;
    updateDemoHud(0, 'active');
    try {
      for (let i = 0; i < DEMO_STEPS.length; i += 1) {
        if (!state.demo.active || state.demo.token !== token) return;
        state.demo.index = i;
        updateDemoHud(i, 'active');
        await DEMO_STEPS[i].run();
        if (!state.demo.active || state.demo.token !== token) return;
        updateDemoHud(i, 'done');
      }
      if (state.demo.active && state.demo.token === token) {
        toast('一键演示完成', '路径：智能问答 → 空教室 → 办事向导 → 学习助手 → 数据看板。', 'success');
      }
    } catch (err) {
      toast('演示被中断', err && err.message ? err.message : '请停止后重试。', 'danger');
    } finally {
      if (state.demo.token === token) {
        state.demo.active = false;
        if (hud) hud.hidden = true;
      }
    }
  }

  function stopDemo() {
    if (!state.demo.active && document.getElementById('demoHud') && document.getElementById('demoHud').hidden) return;
    state.demo.active = false;
    state.demo.token += 1;
    const hud = document.getElementById('demoHud');
    if (hud) hud.hidden = true;
    toast('演示已停止', '你可以继续手动浏览各功能模块。', 'info');
  }

  /* ------------------------------------------------------------------ *
   * 事件处理
   * ------------------------------------------------------------------ */

  function onSubmit(event) {
    const form = event.target;
    if (!form || !form.matches || !form.matches('form[data-form]')) return;
    event.preventDefault();
    const kind = form.getAttribute('data-form');
    if (kind === 'qa') {
      const input = document.getElementById('qaInput');
      const text = input ? input.value.trim() : '';
      if (!text) {
        toast('先输入一个问题', '例如：宿舍报修多久能上门？', 'warning');
        if (input) input.focus();
        return;
      }
      if (input) input.value = '';
      askQuestion(text);
      return;
    }
    if (kind === 'rooms') {
      const formData = new FormData(form);
      const week = Number(formData.get('week'));
      const day = Number(formData.get('day'));
      const start = Number(formData.get('start'));
      const end = Number(formData.get('end'));
      const minCapacity = Number(formData.get('minCapacity')) || 0;
      const consecutive = Number(formData.get('consecutive')) || 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        state.rooms.error = '起始节次不能晚于结束节次，请重新选择查询区间。';
        render();
        toast('节次区间不合法', '起始节次必须小于或等于结束节次。', 'danger');
        return;
      }
      state.rooms = {
        week: Number.isFinite(week) ? week : DATA.meta.week,
        day: Number.isFinite(day) ? day : 1,
        start: start,
        end: end,
        building: String(formData.get('building') || 'all'),
        minCapacity: minCapacity,
        multimedia: formData.get('multimedia') === 'on',
        consecutive: Math.max(1, consecutive),
        error: ''
      };
      render();
      const count = roomResults().length;
      toast('筛选已更新', '找到 ' + count + ' 间符合条件的中空教室。', 'success');
      return;
    }
    if (kind === 'studyPrefs') {
      const formData = new FormData(form);
      const next = normalizeStudyPrefs({
        week: state.study.prefs.week,
        preference: formData.get('preference'),
        dayStart: Number(formData.get('dayStart')),
        dayEnd: Number(formData.get('dayEnd')),
        minLength: Number(formData.get('minLength'))
      });
      state.study.prefs = next;
      writeJson(STUDY_PREFS_KEY, next);
      render();
      toast('空闲推荐已更新', '已按第 ' + next.week + ' 周课表与作息范围重新计算。', 'success');
      return;
    }
    if (kind === 'settings') {
      const formData = new FormData(form);
      const result = AI.saveConfig({
        baseUrl: formData.get('baseUrl'),
        apiKey: formData.get('apiKey'),
        model: formData.get('model')
      });
      const error = document.getElementById('settingsError');
      if (!result.ok) {
        if (error) {
          error.textContent = result.error;
          error.hidden = false;
        }
        toast('配置未保存', result.error, 'danger');
        return;
      }
      if (error) error.hidden = true;
      syncModeUI();
      fillSettings();
      if (result.warning) {
        toast('AI 配置已启用（未持久化）', result.warning, 'warning');
      } else {
        toast('AI 配置已保存', AI.getStatus().label + (AI.getStatus().mode === 'api' ? '，下次提问将调用大模型。' : '，所有问答在本地完成。'), 'success');
      }
    }
  }

  function onInput(event) {
    const target = event.target;
    if (!target) return;
    if (target.id === 'qaInput') {
      target.style.height = 'auto';
      target.style.height = Math.min(target.scrollHeight, 108) + 'px';
      return;
    }
    if (target.matches('[data-gpa-field]')) {
      const index = Number(target.getAttribute('data-index'));
      const field = target.getAttribute('data-gpa-field');
      const course = state.study.gpaCourses[index];
      if (!course) return;
      course[field] = target.value;
      const row = target.closest('tr');
      const pointCell = row ? row.querySelector('.point-cell') : null;
      if (pointCell) pointCell.textContent = gpaPointCell(course);
      const results = document.getElementById('gpaResults');
      if (results) results.innerHTML = renderGpaSummary();
      writeJson(GPA_KEY, state.study.gpaCourses);
    }
  }

  function onChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.matches('[data-guide-check]')) {
      handleGuideCheck(target);
      return;
    }
    if (target.matches('[data-study-week]')) {
      state.study.prefs.week = Number(target.value) || DATA.meta.week;
      writeJson(STUDY_PREFS_KEY, state.study.prefs);
      render();
    }
  }

  function handleAction(actionEl) {
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    if (!action) return;
    switch (action) {
      case 'open-settings':
        openSettings();
        break;
      case 'close-settings':
        closeSettings();
        break;
      case 'open-palette':
        openPalette();
        break;
      case 'close-palette':
        closePalette();
        break;
      case 'start-demo':
        startDemo();
        break;
      case 'stop-demo':
        stopDemo();
        break;
      case 'clear-chat':
        state.qa.history = [];
        state.qa.lastResult = null;
        state.qa.pending = false;
        state.qa.seq += 1;
        render();
        toast('对话已清空', '可以重新发起校园办事提问。', 'success');
        break;
      case 'focus-ask': {
        const input = document.getElementById('qaInput');
        if (input) input.focus();
        break;
      }
      case 'copy-last':
        copyLastAnswer();
        break;
      case 'reset-rooms':
        state.rooms = {
          week: DATA.meta.week,
          day: currentDayInfo().day,
          start: 3,
          end: 4,
          building: 'all',
          minCapacity: 0,
          multimedia: false,
          consecutive: 2,
          error: ''
        };
        render();
        toast('已恢复默认筛选', '教学周、星期和节次已重置。', 'info');
        break;
      case 'reset-guide': {
        const procId = actionEl.getAttribute('data-proc');
        if (!procId) break;
        delete state.guide.progress[procId];
        writeJson(WIZARD_KEY, state.guide.progress);
        render();
        toast('流程进度已重置', '所有节点已恢复为未完成状态。', 'info');
        break;
      }
      case 'toggle-conflict-demo':
        state.study.conflictDemo = !state.study.conflictDemo;
        render();
        toast(state.study.conflictDemo ? '已恢复示例冲突' : '已隐藏示例冲突', state.study.conflictDemo ? '周三第 7—8 节重新出现两门课程。' : '课表现在没有重叠课程，可演示“无冲突”状态。', 'info');
        break;
      case 'gpa-add':
        state.study.gpaCourses.push({ name: '', credits: 2, score: 80 });
        writeJson(GPA_KEY, state.study.gpaCourses);
        render();
        break;
      case 'gpa-reset':
        state.study.gpaCourses = clone(DATA.gpaCourses);
        writeJson(GPA_KEY, state.study.gpaCourses);
        render();
        toast('成绩已恢复为示例数据', '可以重新编辑课程与学分。', 'success');
        break;
      case 'gpa-delete': {
        const index = Number(actionEl.getAttribute('data-index'));
        if (Number.isFinite(index)) {
          state.study.gpaCourses.splice(index, 1);
          writeJson(GPA_KEY, state.study.gpaCourses);
          render();
        }
        break;
      }
      case 'clear-ai': {
        AI.clearConfig();
        fillSettings();
        syncModeUI();
        const error = document.getElementById('settingsError');
        if (error) error.hidden = true;
        toast('已恢复本地引擎', 'API 配置已清除，后续问答全部在本地完成。', 'success');
        break;
      }
      case 'dismiss-toast': {
        const toastEl = actionEl.closest('.toast');
        if (toastEl) dismissToast(toastEl);
        break;
      }
      case 'retry-render':
        render();
        break;
      default:
        break;
    }
  }

  async function copyLastAnswer() {
    const last = state.qa.lastResult;
    if (!last || !last.answer) {
      toast('还没有可复制的回答', '先提一个问题，再复制检索结果。', 'warning');
      return;
    }
    const text = last.answer + '\n\n—— 校园智服通 CampusMate（' + (last.modeLabel || '本地引擎') + '）';
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(area);
    }
    if (ok) toast('回答已复制', '包含答案、步骤与依据编号，可直接粘贴到答辩材料。', 'success');
    else toast('复制失败', '当前浏览器拒绝了剪贴板操作，请手动选择文本复制。', 'warning');
  }

  function onClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;
    const paletteItem = target.closest('[data-palette-index]');
    if (paletteItem) {
      runPaletteItem(Number(paletteItem.getAttribute('data-palette-index')));
      return;
    }
    const actionEl = target.closest('[data-action]');
    if (actionEl) {
      handleAction(actionEl);
      return;
    }
    const questionEl = target.closest('[data-question]');
    if (questionEl) {
      const question = questionEl.getAttribute('data-question');
      if (state.route !== 'ask') setRoute('ask');
      askQuestion(question);
      return;
    }
    const procedureEl = target.closest('[data-procedure]');
    if (procedureEl) {
      const procId = procedureEl.getAttribute('data-procedure');
      if (procId) {
        state.guide.procedureId = procId;
        writeRaw(GUIDE_LAST_KEY, procId);
        render();
      }
      return;
    }
    const themeEl = target.closest('[data-theme-choice]');
    if (themeEl) {
      applyTheme(themeEl.getAttribute('data-theme-choice'), true);
      return;
    }
    const routeEl = target.closest('[data-route]');
    if (routeEl) {
      event.preventDefault();
      setRoute(routeEl.getAttribute('data-route'));
      return;
    }
    if (target.closest('#sidebarScrim')) {
      closeMobileSidebar();
    }
  }

  function onKeydown(event) {
    const key = event.key;
    const paletteLayer = document.getElementById('paletteLayer');
    const paletteOpen = paletteLayer && !paletteLayer.hidden;
    const settingsLayer = document.getElementById('settingsLayer');
    const settingsOpen = settingsLayer && !settingsLayer.hidden;

    if ((event.ctrlKey || event.metaKey) && String(key).toLowerCase() === 'k') {
      event.preventDefault();
      if (paletteOpen) closePalette();
      else openPalette();
      return;
    }
    if (key === 'Escape') {
      if (paletteOpen) {
        event.preventDefault();
        closePalette();
        return;
      }
      if (settingsOpen) {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (state.demo.active) {
        event.preventDefault();
        stopDemo();
        return;
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('is-open')) {
        closeSidebar();
      }
      return;
    }
    if (key === 'Tab' && (paletteOpen || settingsOpen)) {
      const container = paletteOpen ? document.querySelector('.palette') : document.querySelector('.drawer');
      if (container) {
        const focusables = Array.prototype.slice.call(container.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
        )).filter(function (el) { return el.offsetParent !== null; });
        if (focusables.length) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const activeInside = container.contains(document.activeElement);
          if (event.shiftKey && (!activeInside || document.activeElement === first)) {
            event.preventDefault();
            last.focus();
            return;
          }
          if (!event.shiftKey && (!activeInside || document.activeElement === last)) {
            event.preventDefault();
            first.focus();
            return;
          }
        }
      }
    }
    if (paletteOpen) {
      if (key === 'ArrowDown') {
        event.preventDefault();
        movePalette(1);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        movePalette(-1);
      } else if (key === 'Enter') {
        event.preventDefault();
        runPaletteItem(paletteIndex);
      }
      return;
    }
    if (event.target && event.target.id === 'qaInput' && key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const form = document.getElementById('qaForm');
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
      return;
    }
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const btn = document.getElementById('menuBtn');
    if (sidebar) sidebar.classList.remove('is-open');
    if (scrim) scrim.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    lockBody(layerOpen());
  }

  function bindEvents() {
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark', true);
      });
    }
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        const sidebar = document.getElementById('sidebar');
        const scrim = document.getElementById('sidebarScrim');
        if (!sidebar || !scrim) return;
        const open = !sidebar.classList.contains('is-open');
        sidebar.classList.toggle('is-open', open);
        scrim.hidden = !open;
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        lockBody(open);
      });
    }
    const scrim = document.getElementById('sidebarScrim');
    if (scrim) scrim.addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-item[data-nav]').forEach(function (item) {
      item.addEventListener('click', function () {
        closeMobileSidebar();
      });
    });
    const commandBtn = document.getElementById('commandBtn');
    if (commandBtn) commandBtn.addEventListener('click', openPalette);
    const paletteInput = document.getElementById('paletteInput');
    if (paletteInput) {
      paletteInput.addEventListener('input', function () {
        paletteIndex = 0;
        renderPaletteList(paletteInput.value);
      });
    }
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKeydown);
    root.addEventListener('hashchange', function () {
      if (programmaticHash && root.location.hash === programmaticHash) {
        programmaticHash = '';
        return;
      }
      state.route = routeFromHash();
      render();
    });
    root.addEventListener('resize', function () {
      if (root.innerWidth > 1024) closeSidebar();
    });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  function init() {
    if (!DATA || !E || !AI) {
      const rootEl = document.getElementById('viewRoot');
      if (rootEl) {
        rootEl.innerHTML = '<section class="card"><div class="empty-state"><span class="empty-icon">' +
          icon('alert') + '</span><h3>本地资源未加载完整</h3><p>请确认 assets/js/data.js、engine.js、ai.js 与本页面在同一目录下，并刷新重试。</p></div></section>';
      }
      return;
    }
    state.theme = themeNow();
    state.route = routeFromHash();
    try {
      AI.warmup();
    } catch (err) {
      // 索引构建失败时，问答会回退到按需构建；页面继续渲染，不阻断其他模块
    }
    bindEvents();
    updateThemeUI();
    syncModeUI();
    render();
    if (!storageAvailable) {
      toast('浏览器未启用本地存储', '办事进度、主题与 GPA 仍可操作，但刷新后不会保留。', 'warning');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
