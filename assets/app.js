/* ==========================================================================
   SW VIỆC LÀM · app.js · bản 01 · 08/10/2026
   Đọc data/jobs.json (do Apps Script đẩy lên) → dựng trang danh sách / chi tiết.
   - index.html  (data-page="list")
   - job.html?slug=...  (data-page="job")
   - Chế độ xem thử 1 file: window.SW_CONFIG = { router: 'hash' } + window.SW_DATA
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.SW_CONFIG || {};
  var HASH = CFG.router === 'hash';
  var DATA_URL = CFG.dataUrl || 'data/jobs.json';
  var PAGE = document.body.getAttribute('data-page') || 'list';
  var app = document.getElementById('app');

  var state = { q: '', levels: [], province: '', industry: '', salary: '', sort: 'new', filterOpen: false };
  var DATA = null;

  var SALARY = [
    { v: '', l: 'Tất cả mức lương' },
    { v: 'lt15', l: 'Dưới 15 triệu', min: 0, max: 15e6 },
    { v: '15-25', l: '15 - 25 triệu', min: 15e6, max: 25e6 },
    { v: '25-40', l: '25 - 40 triệu', min: 25e6, max: 40e6 },
    { v: 'gt40', l: 'Trên 40 triệu', min: 40e6, max: Infinity },
    { v: 'tt', l: 'Thỏa thuận / chưa công bố' }
  ];

  /* ===================== Tiện ích ===================== */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
  function parseD(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtD(s) { var d = parseD(s); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function fmtShort(s) { var d = parseD(s); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) : ''; }
  function daysLeft(s) { var d = parseD(s); return d ? Math.round((d - today()) / 86400000) : null; }
  function daysAgo(s) { var d = parseD(s); return d ? Math.round((today() - d) / 86400000) : null; }

  function initials(company) {
    var s = String(company || '').replace(/\(.*?\)/g, ' ')
      .replace(/^\s*(công ty|cty)\s+/i, '')
      .replace(/^(tnhh một thành viên|tnhh mtv|tnhh|cổ phần|cp)\s+/i, '')
      .replace(/^(thương mại|dịch vụ|kinh doanh|sản xuất)\s+/i, '');
    var w = s.split(/\s+/).filter(Boolean);
    if (!w.length) return 'SW';
    return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
  }
  function shortCompany(c) { return String(c || '').replace(/^\s*(công ty|cty)\s+(tnhh|cổ phần|cp)?\s*/i, ''); }

  function jobUrl(slug) { return HASH ? '#/job/' + encodeURIComponent(slug) : 'job.html?slug=' + encodeURIComponent(slug); }
  function homeUrl() { return HASH ? '#/' : './'; }

  function location_(j, full) {
    var parts = full ? [j.address, j.ward, j.district, j.province] : [j.district, j.province];
    return parts.filter(Boolean).join(', ');
  }
  function isNew(j) { var n = daysAgo(j.published); return n != null && n <= ((DATA.site && DATA.site.new_days) || 7); }
  function isUrgent(j) { var n = daysLeft(j.expires); return n != null && n >= 0 && n <= 5; }
  function deadlineText(j) {
    var n = daysLeft(j.expires);
    if (n == null) return 'Không ghi hạn nộp';
    if (n === 0) return 'Hết hạn hôm nay';
    return 'Còn ' + n + ' ngày · ' + fmtD(j.expires);
  }

  /* Bộ biểu tượng (stroke = currentColor) */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    level: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    exp: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    ext: '<path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    source: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>'
  };
  function ico(name, cls) {
    return '<svg class="sw-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* ===================== Tải dữ liệu ===================== */

  function loadData() {
    if (window.SW_DATA) return Promise.resolve(window.SW_DATA);
    var bust = Math.floor(Date.now() / 300000); // làm mới bộ đệm mỗi 5 phút
    return fetch(DATA_URL + '?v=' + bust, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function prepare(data) {
    var t = today();
    data.jobs = (data.jobs || []).filter(function (j) {
      var e = parseD(j.expires);
      return !e || e >= t; // ẩn tin quá hạn dù lịch hằng ngày chưa chạy
    });
    data.jobs.forEach(function (j) {
      j._hay = norm([j.title, j.company, j.province, j.district, j.industry, j.level, j.requirements].join(' '));
    });
    data.site = data.site || {};
    data.filters = data.filters || {};
    return data;
  }

  /* ===================== Khung: thanh điều hướng + chân trang ===================== */

  function renderChrome() {
    var s = DATA.site, f = s.footer || {};
    var nav = document.getElementById('swNav');
    if (nav) {
      nav.innerHTML = '<div class="sw-nav__inner">' +
        '<a class="sw-nav__brand" href="' + homeUrl() + '">' +
        (s.logo ? '<img class="sw-nav__logo" src="' + esc(s.logo) + '" alt="">' : '') +
        '<span class="sw-nav__name">' + esc(s.name || 'Việc làm') + '</span></a>' +
        '<nav class="sw-nav__links">' +
        '<a class="sw-nav__btn sw-nav__btn--ghost" href="' + homeUrl() + '">Việc làm</a>' +
        (f.zalo ? '<a class="sw-nav__btn sw-nav__btn--primary" href="' + esc(f.zalo) + '" target="_blank" rel="noopener">Nhận tin qua Zalo</a>' : '') +
        '</nav></div>';
    }
    var foot = document.getElementById('swFoot');
    if (foot) {
      var contact = [
        f.address ? row('pin', esc(f.address)) : '',
        f.phone ? row('phone', '<a href="tel:' + esc(f.phone.replace(/\s/g, '')) + '">' + esc(f.phone) + '</a>') : '',
        f.email ? row('mail', '<a href="mailto:' + esc(f.email) + '">' + esc(f.email) + '</a>') : ''
      ].join('');
      var links = [
        f.zalo ? link(f.zalo, 'chat', 'Cộng đồng Zalo') : '',
        f.fanpage ? link(f.fanpage, 'share', 'Fanpage') : ''
      ].join('');
      var cols = ['<div class="sw-foot__col"><p class="sw-foot__org">' + esc(f.org || s.name) + '</p><p>' + esc(f.note || '') + '</p></div>'];
      if (contact) cols.push('<div class="sw-foot__col"><p class="sw-foot__title">Liên hệ</p>' + contact + '</div>');
      if (links) cols.push('<div class="sw-foot__col"><p class="sw-foot__title">Kết nối</p><div class="sw-foot__links">' + links + '</div></div>');
      foot.innerHTML = '<div class="sw-container"><div class="sw-foot__grid sw-foot__grid--' + cols.length + '">' + cols.join('') + '</div>' +
        '<p class="sw-foot__copy">© ' + new Date().getFullYear() + ' ' + esc(f.org || s.name) +
        (DATA.generated_at ? ' · Dữ liệu cập nhật ' + fmtD(DATA.generated_at.slice(0, 10)) : '') + '</p></div>';
    }
    function row(i, v) { return '<p class="sw-foot__row"><span class="sw-foot__ico">' + ico(i) + '</span><span class="sw-foot__val">' + v + '</span></p>'; }
    function link(u, i, t) { return '<a class="sw-foot__link" href="' + esc(u) + '" target="_blank" rel="noopener"><span class="sw-foot__icon">' + ico(i) + '</span>' + esc(t) + '</a>'; }
  }

  /* ===================== Trang danh sách ===================== */

  function readQuery() {
    if (HASH) return;
    var p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    state.levels = (p.get('cap') || '').split(',').filter(Boolean);
    state.province = p.get('tinh') || '';
    state.industry = p.get('nganh') || '';
    state.salary = p.get('luong') || '';
    state.sort = p.get('sx') || 'new';
  }
  function writeQuery() {
    if (HASH || PAGE !== 'list') return;
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.levels.length) p.set('cap', state.levels.join(','));
    if (state.province) p.set('tinh', state.province);
    if (state.industry) p.set('nganh', state.industry);
    if (state.salary) p.set('luong', state.salary);
    if (state.sort !== 'new') p.set('sx', state.sort);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function renderList() {
    var s = DATA.site, F = DATA.filters, jobs = DATA.jobs;
    document.title = (s.name || 'Việc làm') + ' — ' + (s.tagline || 'Tin tuyển dụng chọn lọc');
    var companies = {};
    jobs.forEach(function (j) { companies[j.company] = 1; });

    var levelChips = (F.levels || []).map(function (o) {
      return '<button type="button" class="sw-badge sw-filter sw-badge--outline" data-level="' + esc(o.value) + '" data-active="' + (state.levels.indexOf(o.value) >= 0) + '">' +
        esc(o.value) + ' <span class="side-n">' + o.count + '</span></button>';
    }).join('');
    var opt = function (list, cur, all) {
      return '<option value="">' + all + '</option>' + (list || []).map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(o.value) + ' (' + o.count + ')</option>';
      }).join('');
    };
    var salaryChips = SALARY.slice(1).map(function (b) {
      return '<button type="button" class="sw-badge sw-filter sw-badge--outline" data-salary="' + b.v + '" data-active="' + (state.salary === b.v) + '">' + b.l + '</button>';
    }).join('');

    app.innerHTML =
      '<section class="job-hero"><div class="sw-container">' +
        '<p class="hero-tag">' + ico('tag') + ' Tin tuyển dụng chọn lọc</p>' +
        '<h1 class="sw-h1 hero-title">Tìm đúng việc, ứng tuyển tại nguồn chính thức</h1>' +
        '<p class="hero-lede">' + esc(s.tagline || '') + '</p>' +
        '<form class="job-search" role="search" id="jobSearch">' +
          '<label class="job-search__field"><span class="sw-sr">Từ khóa</span>' + ico('search') +
          '<input class="job-search__input" id="q" type="search" placeholder="Vị trí hoặc công ty…" value="' + esc(state.q) + '" autocomplete="off"></label>' +
          '<button class="sw-btn sw-btn--primary sw-btn--lg" type="submit">Tìm việc</button>' +
        '</form>' +
        '<p class="job-hero__stats"><span><b>' + jobs.length + '</b> việc làm đang tuyển</span><span><b>' + Object.keys(companies).length + '</b> nhà tuyển dụng</span>' +
        (DATA.generated_at ? '<span>Cập nhật ' + fmtD(DATA.generated_at.slice(0, 10)) + '</span>' : '') + '</p>' +
      '</div></section>' +

      '<div class="index-wrap index-wrap--side job-wrap">' +
        '<aside class="index-side job-side' + (state.filterOpen ? ' is-open' : '') + '" id="jobSide" aria-label="Bộ lọc">' +
          (levelChips ? '<div class="side-block"><p class="index-side__title">Cấp bậc</p><div class="job-chips">' + levelChips + '</div></div>' : '') +
          '<div class="side-block"><p class="index-side__title">Mức lương</p><div class="job-chips">' + salaryChips + '</div></div>' +
          '<div class="side-block"><label class="index-side__title" for="fProv">Địa điểm</label><select class="sw-select" id="fProv">' + opt(F.provinces, state.province, 'Tất cả tỉnh / thành phố') + '</select></div>' +
          ((F.industries || []).length ? '<div class="side-block"><label class="index-side__title" for="fInd">Ngành nghề</label><select class="sw-select" id="fInd">' + opt(F.industries, state.industry, 'Tất cả ngành nghề') + '</select></div>' : '') +
          '<div class="side-block"><button type="button" class="sw-btn sw-btn--ghost sw-btn--sm" id="fReset">Xóa bộ lọc</button></div>' +
        '</aside>' +
        '<div class="index-main">' +
          '<div class="job-toolbar">' +
            '<p class="job-toolbar__count" id="jobCount"></p>' +
            '<div class="job-toolbar__right">' +
              '<button type="button" class="sw-btn sw-btn--secondary sw-btn--sm job-filter-toggle" id="fToggle" aria-controls="jobSide" aria-expanded="' + state.filterOpen + '">' + ico('filter') + ' Bộ lọc<span id="fN"></span></button>' +
              '<label class="sw-sr" for="fSort">Sắp xếp</label>' +
              '<select class="sw-select" id="fSort">' +
                '<option value="new"' + (state.sort === 'new' ? ' selected' : '') + '>Mới cập nhật</option>' +
                '<option value="salary"' + (state.sort === 'salary' ? ' selected' : '') + '>Lương cao nhất</option>' +
                '<option value="deadline"' + (state.sort === 'deadline' ? ' selected' : '') + '>Sắp hết hạn</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="job-list" id="jobList"></div>' +
        '</div>' +
      '</div>';

    bindList();
    applyFilters();
  }

  function bindList() {
    var q = document.getElementById('q');
    var timer;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { state.q = q.value.trim(); applyFilters(); }, 180); });
    document.getElementById('jobSearch').addEventListener('submit', function (e) {
      e.preventDefault(); state.q = q.value.trim(); applyFilters();
      document.getElementById('jobCount').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    app.querySelectorAll('[data-level]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-level'), i = state.levels.indexOf(v);
        if (i >= 0) state.levels.splice(i, 1); else state.levels.push(v);
        b.setAttribute('data-active', i < 0); applyFilters();
      });
    });
    app.querySelectorAll('[data-salary]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-salary');
        state.salary = state.salary === v ? '' : v;
        app.querySelectorAll('[data-salary]').forEach(function (x) { x.setAttribute('data-active', x.getAttribute('data-salary') === state.salary); });
        applyFilters();
      });
    });
    var prov = document.getElementById('fProv');
    prov.addEventListener('change', function () { state.province = prov.value; applyFilters(); });
    var ind = document.getElementById('fInd');
    if (ind) ind.addEventListener('change', function () { state.industry = ind.value; applyFilters(); });
    var sort = document.getElementById('fSort');
    sort.addEventListener('change', function () { state.sort = sort.value; applyFilters(); });
    document.getElementById('fReset').addEventListener('click', resetFilters);
    var tg = document.getElementById('fToggle'), side = document.getElementById('jobSide');
    tg.addEventListener('click', function () {
      state.filterOpen = !state.filterOpen;
      side.classList.toggle('is-open', state.filterOpen);
      tg.setAttribute('aria-expanded', state.filterOpen);
    });
  }

  function resetFilters() {
    state.q = ''; state.levels = []; state.province = ''; state.industry = ''; state.salary = '';
    renderList();
  }

  function salaryMatch(j, v) {
    if (!v) return true;
    var s = j.salary || {};
    var ranged = s.type === 'Có dải lương' && (s.min || s.max);
    if (v === 'tt') return !ranged;
    if (!ranged) return false;
    var b = SALARY.filter(function (x) { return x.v === v; })[0];
    var lo = s.min || s.max, hi = s.max || s.min;
    return hi >= b.min && lo < b.max;
  }

  function filtered() {
    var terms = norm(state.q).split(/\s+/).filter(Boolean);
    var out = DATA.jobs.filter(function (j) {
      if (terms.length && !terms.every(function (t) { return j._hay.indexOf(t) >= 0; })) return false;
      if (state.levels.length && state.levels.indexOf(j.level) < 0) return false;
      if (state.province && j.province !== state.province) return false;
      if (state.industry && j.industry !== state.industry) return false;
      return salaryMatch(j, state.salary);
    });
    var key = {
      new: function (a, b) { return String(b.updated || b.published).localeCompare(String(a.updated || a.published)); },
      salary: function (a, b) { return ((b.salary.max || b.salary.min || 0) - (a.salary.max || a.salary.min || 0)); },
      deadline: function (a, b) { return String(a.expires || '9999').localeCompare(String(b.expires || '9999')); }
    }[state.sort] || function () { return 0; };
    return out.sort(key);
  }

  function applyFilters() {
    var list = filtered();
    var n = state.levels.length + (state.province ? 1 : 0) + (state.industry ? 1 : 0) + (state.salary ? 1 : 0);
    document.getElementById('fN').textContent = n ? ' (' + n + ')' : '';
    document.getElementById('jobCount').innerHTML = 'Tìm thấy <b>' + list.length + '</b> việc làm' + (state.q ? ' cho “' + esc(state.q) + '”' : '');
    document.getElementById('jobList').innerHTML = list.length ? list.map(card).join('') :
      '<div class="sw-card sw-empty"><h3>Chưa có việc làm phù hợp</h3><p>Thử bỏ bớt bộ lọc hoặc đổi từ khóa.</p>' +
      '<button type="button" class="sw-btn sw-btn--secondary" id="emptyReset">Xóa bộ lọc</button></div>';
    writeQuery();
  }

  function card(j) {
    var badges = (isNew(j) ? '<span class="sw-badge sw-badge--new">Mới</span>' : '') +
      (isUrgent(j) ? '<span class="sw-badge sw-badge--hot">Sắp hết hạn</span>' : '');
    return '<a class="sw-card job-card" href="' + jobUrl(j.slug) + '">' +
      '<div class="job-card__top">' +
        '<span class="job-logo" aria-hidden="true">' + esc(initials(j.company)) + '</span>' +
        '<div class="job-card__head"><h3 class="job-card__title">' + esc(j.title) + '</h3>' +
        '<p class="job-card__co">' + esc(j.company) + '</p></div>' +
        '<div class="job-card__badges">' + badges + '</div>' +
      '</div>' +
      '<ul class="job-meta">' +
        '<li class="job-meta__salary">' + ico('money') + esc(j.salary.text) + '</li>' +
        '<li>' + ico('pin') + esc(location_(j) || j.province) + '</li>' +
        (j.level ? '<li>' + ico('level') + esc(j.level) + '</li>' : '') +
        (j.exp_years ? '<li>' + ico('exp') + esc(j.exp_years) + '</li>' : '') +
      '</ul>' +
      '<div class="job-card__foot"><span>' + ico('clock') + ' ' + esc(deadlineText(j)) + '</span>' +
      '<span class="sw-btn sw-btn--secondary sw-btn--sm job-card__cta">Xem chi tiết</span></div>' +
    '</a>';
  }

  /* ===================== Trang chi tiết ===================== */

  function textBlocks(t) {
    if (!t) return '';
    var lines = String(t).split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (lines.length === 1) {
      var parts = lines[0].split(/\s*;\s*/).filter(Boolean);
      if (parts.length > 1) lines = parts;
    }
    if (lines.length === 1) return '<p>' + esc(lines[0]) + '</p>';
    return '<ul>' + lines.map(function (l) { return '<li>' + esc(l.replace(/^[-•*+]\s*/, '')) + '</li>'; }).join('') + '</ul>';
  }

  function fact(icon, label, value, cls) {
    return '<div class="job-fact ' + (cls || '') + '"><span class="job-fact__ico">' + ico(icon) + '</span>' +
      '<div><p class="job-fact__label">' + label + '</p><p class="job-fact__value">' + esc(value) + '</p></div></div>';
  }

  function renderDetail(slug) {
    var j = DATA.jobs.filter(function (x) { return x.slug === slug; })[0];
    document.body.classList.remove('has-applybar');
    if (!j) {
      document.title = 'Tin không còn hiển thị — ' + (DATA.site.name || '');
      app.innerHTML = '<div class="sw-container" style="padding:64px 24px"><div class="sw-card sw-empty">' +
        '<h3>Tin tuyển dụng không còn hiển thị</h3><p>Tin đã hết hạn hoặc đã được gỡ. Xem các việc làm khác đang tuyển.</p>' +
        '<a class="sw-btn sw-btn--primary" href="' + homeUrl() + '">Xem việc làm đang tuyển</a></div></div>';
      return;
    }
    var site = DATA.site, src = j.source || 'trang tuyển dụng gốc';
    document.title = j.title + ' — ' + shortCompany(j.company) + ' | ' + (site.name || '');
    setMeta('description', j.title + ' tại ' + j.company + '. Lương: ' + j.salary.text + '. Địa điểm: ' + location_(j) + '. ' + (j.requirements || '').slice(0, 120));
    setJsonLd(j);

    var badges = '<span class="sw-badge sw-badge--outline">' + esc(j.level) + '</span>' +
      (j.industry ? '<span class="sw-badge sw-badge--outline">' + esc(j.industry) + '</span>' : '') +
      (isNew(j) ? '<span class="sw-badge sw-badge--new">Mới</span>' : '') +
      (isUrgent(j) ? '<span class="sw-badge sw-badge--hot">Sắp hết hạn</span>' : '');

    var applyBtn = '<a class="sw-btn sw-btn--primary sw-btn--lg sw-btn--block" href="' + esc(j.apply_url) + '" target="_blank" rel="noopener nofollow">Ứng tuyển ngay ' + ico('ext') + '</a>';

    var related = DATA.jobs.filter(function (x) { return x.slug !== j.slug && (x.level === j.level || x.province === j.province); }).slice(0, 3);

    app.innerHTML =
      '<section class="job-dhero"><div class="sw-container">' +
        '<nav class="breadcrumb sw-row" aria-label="Đường dẫn"><a href="' + homeUrl() + '">Việc làm</a><span class="sep">/</span><span>' + esc(j.province) + '</span><span class="sep">/</span><span>' + esc(j.level) + '</span></nav>' +
        '<div class="job-dhero__row"><span class="job-logo" aria-hidden="true">' + esc(initials(j.company)) + '</span>' +
        '<div><p class="job-dhero__co">' + esc(j.company) + '</p><h1>' + esc(j.title) + '</h1>' +
        '<div class="job-dhero__badges">' + badges + '</div></div></div>' +
      '</div></section>' +

      '<div class="sw-container job-detail">' +
        '<article>' +
          '<div class="job-facts" aria-label="Tóm tắt nhanh">' +
            fact('money', 'Mức lương', j.salary.text, 'job-fact--salary') +
            fact('level', 'Cấp bậc', j.level) +
            fact('exp', 'Kinh nghiệm', j.exp_years || 'Không yêu cầu') +
            fact('pin', 'Nơi làm việc', location_(j) || j.province) +
            fact('cal', 'Hạn nộp hồ sơ', j.expires ? fmtD(j.expires) : 'Không ghi hạn') +
            fact('clock', 'Ngày cập nhật', fmtD(j.updated || j.published)) +
          '</div>' +

          (j.requirements ? '<section class="job-section"><h2>Yêu cầu công việc</h2>' + textBlocks(j.requirements) + '</section>' : '') +

          '<section class="job-section"><h2>Thông tin nhà tuyển dụng</h2><div class="job-co">' +
            '<p class="job-co__row">' + ico('building') + '<span>' + esc(j.company) + '</span></p>' +
            '<p class="job-co__row">' + ico('pin') + '<span>' + esc(location_(j, true)) + '</span></p>' +
            (j.website ? '<p class="job-co__row">' + ico('globe') + '<a href="' + esc(j.website) + '" target="_blank" rel="noopener nofollow">' + esc(j.website.replace(/^https?:\/\//, '')) + '</a></p>' : '') +
          '</div></section>' +

          '<div class="sw-note">Tin được tổng hợp từ <b>' + esc(src) + '</b>. Mô tả công việc, quyền lợi và cách nộp hồ sơ đầy đủ xem tại trang gốc. Không nộp phí dưới bất kỳ hình thức nào khi ứng tuyển.</div>' +

          (related.length ? '<section class="job-section job-related" style="margin-top:32px"><h2>Việc làm tương tự</h2><div class="job-list">' + related.map(card).join('') + '</div></section>' : '') +
          '<a class="sw-link job-back" href="' + homeUrl() + '">' + ico('back') + ' Xem tất cả việc làm</a>' +
        '</article>' +

        '<aside class="job-apply--side"><div class="sw-card job-apply">' +
          '<p class="job-apply__label">Mức lương</p><p class="job-apply__salary">' + esc(j.salary.text) + '</p>' +
          '<p class="job-apply__dl">' + ico('cal') + '<span>' + (j.expires ? 'Hạn nộp <b>' + fmtD(j.expires) + '</b>' + (daysLeft(j.expires) != null ? ' · còn ' + daysLeft(j.expires) + ' ngày' : '') : 'Không ghi hạn nộp') + '</span></p>' +
          applyBtn +
          '<button type="button" class="sw-btn sw-btn--secondary sw-btn--block" data-share>' + ico('share') + ' Chia sẻ tin này</button>' +
          '<p class="job-apply__note">Bạn sẽ được chuyển sang ' + esc(src) + ' để nộp hồ sơ.</p>' +
        '</div></aside>' +
      '</div>' +

      '<div class="job-applybar" role="region" aria-label="Ứng tuyển">' +
        '<div class="job-applybar__info"><p class="job-applybar__salary">' + esc(j.salary.text) + '</p><p class="job-applybar__dl">' + esc(deadlineText(j)) + '</p></div>' +
        '<button type="button" class="sw-btn sw-btn--secondary" data-share aria-label="Chia sẻ">' + ico('share') + '</button>' +
        '<a class="sw-btn sw-btn--primary" href="' + esc(j.apply_url) + '" target="_blank" rel="noopener nofollow">Ứng tuyển ngay</a>' +
      '</div>' +
      '<div class="job-toast" id="toast">Đã sao chép link</div>';

    document.body.classList.add('has-applybar');
    app.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () { share(j); });
    });
  }

  function share(j) {
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: j.title, text: j.title + ' — ' + j.company, url: url }).catch(function () {});
      return;
    }
    var done = function () {
      var t = document.getElementById('toast');
      t.classList.add('is-on'); setTimeout(function () { t.classList.remove('is-on'); }, 1800);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
  }

  function setMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m); }
    m.setAttribute('content', content);
  }

  /* Dữ liệu có cấu trúc JobPosting cho Google */
  function setJsonLd(j) {
    var old = document.getElementById('ldJob');
    if (old) old.remove();
    var ld = {
      '@context': 'https://schema.org', '@type': 'JobPosting',
      title: j.title,
      description: (j.requirements || j.title).replace(/\n/g, '<br>'),
      datePosted: j.published || j.updated,
      hiringOrganization: { '@type': 'Organization', name: j.company, sameAs: j.website || undefined },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: j.address || undefined, addressLocality: j.district || undefined, addressRegion: j.province, addressCountry: 'VN' } },
      directApply: false
    };
    if (j.expires) ld.validThrough = j.expires + 'T23:59:59+07:00';
    if (j.salary && (j.salary.min || j.salary.max)) {
      ld.baseSalary = { '@type': 'MonetaryAmount', currency: 'VND', value: { '@type': 'QuantitativeValue', minValue: j.salary.min || j.salary.max, maxValue: j.salary.max || j.salary.min, unitText: 'MONTH' } };
    }
    var s = document.createElement('script');
    s.type = 'application/ld+json'; s.id = 'ldJob'; s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }

  /* ===================== Điều hướng + khởi động ===================== */

  function route() {
    if (HASH) {
      var m = location.hash.match(/^#\/job\/(.+)$/);
      if (m) renderDetail(decodeURIComponent(m[1])); else { document.body.classList.remove('has-applybar'); renderList(); }
    } else if (PAGE === 'job') {
      renderDetail(new URLSearchParams(location.search).get('slug') || '');
    } else {
      renderList();
    }
    window.scrollTo(0, 0);
  }

  function skeleton() {
    var s = '';
    for (var i = 0; i < 4; i++) s += '<div class="sw-skeleton job-skel"></div>';
    app.innerHTML = '<div class="sw-container" style="padding-top:32px;padding-bottom:32px"><div class="job-list">' + s + '</div></div>';
  }

  function fail(err) {
    console.error(err);
    app.innerHTML = '<div class="sw-container" style="padding:64px 24px"><div class="sw-card sw-empty">' +
      '<h3>Chưa tải được danh sách việc làm</h3><p>Kết nối mạng chập chờn hoặc dữ liệu đang được cập nhật. Vui lòng thử lại sau ít phút.</p>' +
      '<button type="button" class="sw-btn sw-btn--primary" onclick="location.reload()">Tải lại</button></div></div>';
  }

  app.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'emptyReset') resetFilters();
  });

  readQuery();
  if (!window.SW_DATA) skeleton();
  loadData().then(function (d) {
    DATA = prepare(d);
    renderChrome();
    route();
    if (HASH) window.addEventListener('hashchange', route);
  }).catch(fail);
})();
