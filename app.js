/* Кабинет клиента Интерсофт — PWA v2 (стиль Интерсофт, письмо «Изменения в кабинете клиента»).
   Источник данных — существующий веб-сервис plpk (через CORS-шлюз). Кэш ответов в localStorage:
   экраны рисуются мгновенно из кэша и тихо обновляются с сервера (лечит «медленно» на туннеле). */
(function () {
  'use strict';

  var LS = window.localStorage;
  var state = {
    api: LS.getItem('api') || '',
    mode: LS.getItem('apiMode') || 'auto',
    id: LS.getItem('cid') || '',
    pwd: LS.getItem('cpwd') || '',
    user: LS.getItem('cuser') || '',
    dash: null, recs: null, appeals: [], filter: LS.getItem('filter') || '',
    current: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(s) {
    if (!s) { return ''; }
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : String(s);
  }
  var toastT = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast on';
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = 'toast'; }, 2600);
  }
  function show(name) {
    var scr = document.querySelectorAll('.screen');
    for (var i = 0; i < scr.length; i++) { scr[i].className = 'screen'; }
    $('scr-' + name).className = 'screen on';
    var nb = document.querySelectorAll('.nav button');
    for (var j = 0; j < nb.length; j++) {
      nb[j].className = (nb[j].getAttribute('data-go') === name) ? 'on' : '';
    }
    $('nav').style.display = state.id ? 'flex' : 'none';
    window.scrollTo(0, 0);
  }

  /* ---------- кэш (stale-while-revalidate) ---------- */
  function cacheGet(key) {
    try { return JSON.parse(LS.getItem('c:' + key)); } catch (e) { return null; }
  }
  function cacheSet(key, val) {
    try { LS.setItem('c:' + key, JSON.stringify(val)); } catch (e) { }
  }

  /* ---------- API ---------- */
  function apiBase() { return (state.api || '').replace(/\/+$/, ''); }
  function creds() { return 'Id = ' + state.id + ' & Pwd = ' + state.pwd + ' & UserName = ' + state.user; }
  function call(method, body, extraHeaders) {
    var h = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (extraHeaders) { for (var k in extraHeaders) { h[k] = extraHeaders[k]; } }
    return fetch(apiBase() + '/plpk/' + method, { method: 'POST', headers: h, body: body == null ? '' : body })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      }).then(function (t) { return t ? JSON.parse(t) : {}; });
  }
  function resolveApi() {
    if (state.mode === 'manual' && state.api) { return Promise.resolve(state.api); }
    return fetch('api.json?t=' + Date.now()).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.api) { state.api = j.api; LS.setItem('api', j.api); }
        return state.api;
      }).catch(function () { return state.api; });
  }

  /* ---------- вход ---------- */
  function doLogin() {
    var id = $('f-id').value.trim(), pwd = $('f-pwd').value.trim(), user = $('f-user').value.trim();
    var err = $('login-err');
    err.style.display = 'none';
    if (!id || !pwd || !user) { err.textContent = 'Заполните все поля.'; err.style.display = 'block'; return; }
    var b = $('btn-login');
    b.innerHTML = '<span class="spin" style="border-top-color:#fff;"></span> Проверяем…';
    state.id = id; state.pwd = pwd; state.user = user;
    resolveApi().then(function () {
      if (!state.api) { throw new Error('нет адреса API — задайте в «Ещё»'); }
      return call('ClientDashboard', creds());
    }).then(function (d) {
      if (d['Отказ'] === true) { throw new Error(d['Причина'] || 'Неверные данные'); }
      LS.setItem('cid', id); LS.setItem('cpwd', pwd); LS.setItem('cuser', user);
      state.dash = d; cacheSet('dash', d);
      enterCabinet();
    }).catch(function (e) {
      err.textContent = 'Не удалось войти: ' + e.message;
      err.style.display = 'block';
    }).then(function () { b.textContent = 'Войти в кабинет'; });
  }

  function enterCabinet() {
    renderDash(); renderServices(); renderRecs();
    show('dash');
    refreshAll(true);
  }

  function refreshAll(silent) {
    loadAppeals();
    loadNews();
    loadDocs();
    loadServicesUsage();
    loadRecommendations();
    loadConsult();
    call('ClientDashboard', creds()).then(function (d) {
      if (d['Отказ'] !== true) {
        state.dash = d; cacheSet('dash', d);
        renderDash(); renderServices(); renderRecs();
        if (!silent) { toast('Обновлено'); }
      }
    }).catch(function () { });
  }

  /* ---------- КАБИНЕТ ---------- */
  function renderDash() {
    var d = state.dash || {};
    var cli = d['Клиент'] || {};
    $('dash-client').textContent = (cli['Наименование'] || '') + ' · код ' + state.id;

    var att = d['Внимание'];
    if (att && att['Заголовок']) {
      $('p-attention').style.display = 'block';
      $('p-attention').innerHTML =
        '<div class="row" style="align-items:flex-start;">' +
        '<span class="badge red" style="flex:0 0 auto;">!</span>' +
        '<div><div style="font-weight:600;font-size:14px;">' + esc(att['Заголовок']) + '</div>' +
        '<div class="small" style="margin-top:3px;">' + esc(att['Текст'] || '') + '</div></div></div>';
    } else { $('p-attention').style.display = 'none'; }

    var m = d['Менеджер'] || {};
    var mi = (m['Имя'] || 'М').toString();
    var initials = mi.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
    $('p-manager').innerHTML =
      '<div class="row"><div class="mgr-ava">' + esc(initials) + '</div>' +
      '<div style="min-width:0;"><div class="tiny">Ваш персональный менеджер</div>' +
      '<div style="font-weight:700;font-size:15px;">' + esc(m['Имя'] || '—') + '</div>' +
      '<div class="small">' + esc(m['Телефон'] || '') +
      (m['Почта'] ? ' · <a href="mailto:' + esc(m['Почта']) + '">' + esc(m['Почта']) + '</a>' : '') + '</div>' +
      '</div></div>' +
      '<div class="row" style="margin-top:14px;">' +
      (m['Телефон'] ? '<a class="btn ghost" style="flex:1;text-align:center;text-decoration:none;font-size:13px;padding:11px;" href="tel:' + esc(String(m['Телефон']).replace(/[^+\d]/g, '')) + '">Позвонить</a>' : '') +
      (m['Почта'] ? '<a class="btn ghost" style="flex:1;text-align:center;text-decoration:none;font-size:13px;padding:11px;" href="mailto:' + esc(m['Почта']) + '">Написать</a>' : '') +
      '</div>';

    var s = d['Сводка'] || {};
    var months = d['ПоМесяцам'] || [];
    var bars = '', mx = 1;
    for (var i = 0; i < months.length; i++) { mx = Math.max(mx, months[i]['Количество'] || months[i] || 0); }
    for (var i2 = 0; i2 < months.length; i2++) {
      var v = months[i2]['Количество'] != null ? months[i2]['Количество'] : months[i2];
      bars += '<i style="height:' + Math.max(5, Math.round(v / mx * 100)) + '%"></i>';
    }
    $('p-summary').innerHTML =
      '<h2>Состояние сопровождения</h2>' +
      '<div class="grid3">' +
      '<div class="tile"><b>' + esc(s['ВРаботе'] != null ? s['ВРаботе'] : '—') + '</b><span>в работе</span></div>' +
      '<div class="tile"><b>' + esc(s['Зарегистрировано'] != null ? s['Зарегистрировано'] : '—') + '</b><span>зарегистрировано</span></div>' +
      '<div class="tile"><b>' + esc(s['ОжидаетКлиента'] != null ? s['ОжидаетКлиента'] : '—') + '</b><span>ожидает вас</span></div>' +
      '</div>' +
      (s['ВСрокПроцент'] != null ?
        '<div class="row" style="margin-top:12px;justify-content:space-between;"><span class="small">активные обращения ведутся в срок</span><b>' + esc(s['ВСрокПроцент']) + '%</b></div>' : '') +
      (months.length ? '<div class="bars">' + bars + '</div><div class="tiny" style="margin-top:6px;">обращения по месяцам · 12 мес</div>' : '');
  }

  /* отборы: счётчики строятся из САМОГО списка — цифра на чипе всегда равна числу строк */
  function appealStatus(a) { return String(a['Статус'] || a['Status'] || 'Без статуса'); }
  function renderFilters() {
    var counts = {}, order = [];
    for (var i = 0; i < state.appeals.length; i++) {
      var st = appealStatus(state.appeals[i]);
      if (!(st in counts)) { counts[st] = 0; order.push(st); }
      counts[st]++;
    }
    var html = '<span class="chip' + (state.filter === '' ? ' on' : '') + '" data-f="">Все · ' + state.appeals.length + '</span>';
    for (var j = 0; j < order.length; j++) {
      html += '<span class="chip' + (state.filter === order[j] ? ' on' : '') + '" data-f="' + esc(order[j]) + '">' +
        esc(order[j]) + ' · ' + counts[order[j]] + '</span>';
    }
    $('p-filters').innerHTML = html;
    var chips = $('p-filters').querySelectorAll('.chip');
    for (var k = 0; k < chips.length; k++) {
      chips[k].addEventListener('click', function () {
        state.filter = this.getAttribute('data-f');
        LS.setItem('filter', state.filter);
        renderFilters(); renderFeed();
      });
    }
  }
  function renderFeed() {
    var host = $('p-feed');
    var list = state.appeals.filter(function (a) {
      return !state.filter || appealStatus(a) === state.filter;
    });
    if (!list.length) { host.innerHTML = '<div class="small" style="padding:8px 0;">Нет обращений с таким статусом.</div>'; return; }
    var out = '';
    for (var i = 0; i < Math.min(list.length, 30); i++) {
      var a = list[i];
      var num = a['Номер'] || a['Number'] || '';
      out += '<div class="feed-item" data-num="' + esc(num) + '">' +
        '<div class="feed-title">' + esc(a['Тема'] || a['Наименование'] || a['Subject'] || ('Обращение ' + num)) + '</div>' +
        '<div class="feed-meta">' + esc(num) + ' · ' + fmtDate(a['Дата'] || a['Date']) +
        ' · <span class="badge" style="padding:2px 9px;">' + esc(appealStatus(a)) + '</span></div></div>';
    }
    host.innerHTML = out;
    var items = host.querySelectorAll('.feed-item');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', function () { openAppeal(this.getAttribute('data-num')); });
    }
  }
  function loadAppeals() {
    var cached = cacheGet('appeals');
    if (cached) { state.appeals = cached; renderFilters(); renderFeed(); }
    else { $('p-feed').innerHTML = '<div class="skel"></div><div class="skel" style="width:70%;"></div><div class="skel" style="width:85%;"></div>'; }
    var d2 = '' + (new Date().getFullYear() + 1) + '1231';
    call('ClientRequests', creds() + ' & Date1 = 20200101 & Date2 = ' + d2).then(function (j) {
      var list = (j instanceof Array) ? j : (j['Обращения'] || j['data'] || []);
      state.appeals = list; cacheSet('appeals', list);
      renderFilters(); renderFeed();
    }).catch(function (e) {
      if (!cached) { $('p-feed').innerHTML = '<div class="small">Не удалось загрузить: ' + esc(e.message) + '</div>'; }
    });
  }

  /* ---------- ТЕКУЩИЕ СЕРВИСЫ ---------- */
  function renderServices() {
    var d = state.dash || {};
    var svcs = d['Сервисы'] || [];
    var host = $('svc-list');
    if (!svcs.length) { host.innerHTML = '<div class="small">Сведений о подключённых сервисах нет.</div>'; return; }
    var out = '';
    for (var i = 0; i < svcs.length; i++) {
      var s = svcs[i];
      var active = String(s['Действует']) === 'true' || s['Действует'] === true;
      out += '<div class="svc"><div class="ic">▤</div><div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;">' + esc(s['ВидПодписки'] || s['ВидСервиса'] || 'Сервис') + '</div>' +
        '<div class="small">' + esc(s['ВидСервиса'] || '') +
        (s['ДатаОкончания'] ? ' · до ' + fmtDate(s['ДатаОкончания']) : '') + '</div></div>' +
        '<span class="badge ' + (active ? 'ok' : 'red') + '">' + (active ? 'действует' : 'истёк') + '</span></div>';
    }
    host.innerHTML = out;
  }
  function loadNews() {
    var host = $('p-news');
    var cached = cacheGet('news');
    if (cached) { renderNews(cached); }
    else { host.innerHTML = '<div class="skel"></div><div class="skel" style="width:60%;"></div>'; }
    var cfg = ((state.dash || {})['КонфигурацияПредставление'] || '');
    var cfgs = ((state.dash || {})['Конфигурации'] || []);
    var q = (cfgs instanceof Array && cfgs.length) ? cfgs.join(';') : cfg;
    call('Releases', 'Configs = ' + q).then(function (j) {
      var list = (j instanceof Array) ? j : (j['Релизы'] || j['data'] || []);
      cacheSet('news', list); renderNews(list);
    }).catch(function () { if (!cached) { host.innerHTML = '<div class="small">Раздел недоступен.</div>'; } });
  }
  function renderNews(list) {
    var host = $('p-news');
    if (!list.length) { host.innerHTML = '<div class="small">Свежих релизов по вашим программам нет.</div>'; return; }
    var out = '';
    for (var i = 0; i < Math.min(list.length, 6); i++) {
      var r = list[i];
      out += '<div class="feed-item" style="cursor:default;"><div class="feed-title">' + esc(r['Наименование'] || '') + '</div>' +
        '<div class="feed-meta">версия ' + esc(r['Версия'] || '') + ' · ' + fmtDate(r['ДатаРелиза']) + '</div></div>';
    }
    host.innerHTML = out;
  }
  function loadDocs() {
    var host = $('p-docs');
    var cached = cacheGet('docs');
    if (cached) { renderDocs(cached); }
    else { host.innerHTML = '<div class="skel"></div><div class="skel" style="width:75%;"></div>'; }
    call('ClientDocuments', creds()).then(function (j) {
      var list = (j instanceof Array) ? j : (j['Документы'] || j['data'] || []);
      cacheSet('docs', list); renderDocs(list);
    }).catch(function () { if (!cached) { host.innerHTML = '<div class="small">Раздел недоступен.</div>'; } });
  }
  function renderDocs(list) {
    var host = $('p-docs');
    if (!list.length) { host.innerHTML = '<div class="small">Документов нет.</div>'; return; }
    var out = '';
    for (var i = 0; i < Math.min(list.length, 10); i++) {
      var doc = list[i];
      out += '<div class="feed-item" style="cursor:default;"><div class="feed-title">' + esc(doc['Наименование'] || doc['Номер'] || '') + '</div>' +
        '<div class="feed-meta">' + fmtDate(doc['Дата']) + (doc['Сумма'] ? ' · ' + esc(doc['Сумма']) + ' ₽' : '') + '</div></div>';
    }
    host.innerHTML = out;
  }

  /* ---------- ПОТРЕБЛЕНИЕ СЕРВИСОВ (п.9c) ---------- */
  function loadServicesUsage() {
    var cached = cacheGet('usage');
    if (cached) { renderUsage(cached); }
    call('ServicesInfo', creds()).then(function (j) {
      if (j['Отказ'] === true) { return; }
      var list = j['Сервисы'] || [];
      cacheSet('usage', list); renderUsage(list);
    }).catch(function () { });
  }
  function renderUsage(list) {
    var host = $('svc-list');
    if (!host) { return; }
    if (!list.length) { host.innerHTML = '<div class="small">Сведений о подписках нет.</div>'; return; }
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var s2 = list[i];
      var st = String(s2['Состояние'] || '');
      var cls = st === 'действует' ? 'ok' : (st === 'истекает' ? 'amber' : 'red');
      var extra = [];
      if (Number(s2['КоличествоБаз']) > 0) { extra.push(s2['КоличествоБаз'] + ' баз'); }
      if (Number(s2['КоличествоСеансов']) > 0) { extra.push(s2['КоличествоСеансов'] + ' сеансов'); }
      out += '<div class="svc"><div class="ic">▤</div><div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:14px;">' + esc(s2['ВидПодписки'] || s2['ВидСервиса'] || 'Сервис') + '</div>' +
        '<div class="small">' + esc(s2['ВидСервиса'] || '') +
        (s2['ДатаОкончания'] ? ' · до ' + fmtDate(s2['ДатаОкончания']) : '') +
        ((st === 'действует' || st === 'истекает') ? ' · осталось ' + Number(s2['ДнейОсталось'] || 0) + ' дн.' : '') +
        (extra.length ? ' · ' + esc(extra.join(' · ')) : '') + '</div></div>' +
        '<span class="badge ' + cls + '">' + esc(st) + '</span></div>';
    }
    host.innerHTML = out;
  }

  /* ---------- ЛИНИЯ КОНСУЛЬТАЦИЙ (п.11f) ---------- */
  function loadConsult() {
    var cached = cacheGet('consult');
    if (cached) { renderConsult(cached); }
    call('ConsultInfo', creds()).then(function (j) {
      if (j['Отказ'] === true) { return; }
      cacheSet('consult', j); renderConsult(j);
    }).catch(function () { });
  }
  function renderConsult(j) {
    var host = $('svc-consult');
    if (!host) { return; }
    var left = Number(j['Остаток'] || 0);
    var out = '<div class="row" style="justify-content:space-between;margin-bottom:10px;">' +
      '<span class="badge ' + (left > 0 ? 'brand' : 'amber') + '">Остаток: ' + left + '</span>' +
      '<span class="small">оплачено ' + Number(j['Оплачено'] || 0) + ' · использовано ' + Number(j['Потрачено'] || 0) + '</span></div>';
    var packs = j['Пакеты'] || [];
    if (packs.length) {
      for (var i = 0; i < Math.min(packs.length, 5); i++) {
        var p = packs[i];
        var period = (p['ДатаНачала'] || '') + (p['ДатаОкончания'] ? ' — ' + p['ДатаОкончания'] : '');
        out += '<div class="feed-item" style="cursor:default;"><div class="feed-title">' + esc(p['Документ'] || 'Пакет') + '</div>' +
          '<div class="feed-meta">' + esc(period || fmtDate(p['Дата'])) + ' · +' + esc(p['Количество']) + '</div></div>';
      }
    } else {
      out += '<div class="small">Оплаченных пакетов не найдено.</div>';
    }
    out += '<div class="row" style="margin-top:12px;">' +
      '<button class="btn ghost" data-pack="7" style="font-size:13px;padding:11px;">+7 консультаций</button>' +
      '<button class="btn ghost" data-pack="8" style="font-size:13px;padding:11px;">+8 консультаций</button></div>';
    host.innerHTML = out;
    var btns = host.querySelectorAll('[data-pack]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        var nn = this.getAttribute('data-pack');
        $('n-topic').value = 'Другое';
        $('n-text').value = 'Прошу выставить счёт на пакет +' + nn + ' консультаций.';
        show('new');
      });
    }
  }

  /* ---------- РЕКОМЕНДАЦИИ ---------- */
  var CATALOG = [
    { name: '1С-Отчётность', note: 'Сдача отчётности во все контролирующие органы прямо из 1С.' },
    { name: '1С:Контрагент', note: 'Автозаполнение реквизитов и досье контрагентов по ИНН.' },
    { name: '1С-ЭДО', note: 'Юридически значимый электронный документооборот с контрагентами.' },
    { name: '1СПАРК Риски', note: 'Оценка надёжности контрагентов и мониторинг изменений.' },
    { name: '1С:Облачный архив', note: 'Автоматическое резервное копирование базы в облако.' }
  ];
  function loadRecommendations() {
    var cached = cacheGet('recs');
    if (cached) { state.recs = cached; renderRecs(); }
    call('Recommendations', creds()).then(function (j) {
      if (j['Отказ'] === true) { return; }
      state.recs = j; cacheSet('recs', j); renderRecs();
    }).catch(function () { });
  }

  function renderRecs() {
    var d = state.dash || {};
    var host = $('rec-list');
    var out = '';
    var att = d['Внимание'];
    if (att && att['Заголовок']) {
      out += '<div class="panel"><div class="row" style="align-items:flex-start;">' +
        '<span class="badge red">!</span><div>' +
        '<div style="font-weight:600;font-size:14px;">' + esc(att['Заголовок']) + '</div>' +
        '<div class="small" style="margin-top:3px;">' + esc(att['Текст'] || '') + '</div></div></div></div>';
    }
    if (d['Вебинар']) {
      out += '<div class="panel"><div class="row" style="align-items:flex-start;">' +
        '<span class="badge brand">Вебинар</span><div>' +
        '<div style="font-weight:600;font-size:14px;">' + esc(d['Вебинар']) + '</div>' +
        '<div class="small" style="margin-top:3px;">Ближайшее обучающее мероприятие для клиентов сопровождения.</div></div></div></div>';
    }
    // рекомендации: живые с сервера (профиль клиента), иначе — общий каталог
    var live = state.recs;
    var rec = '';
    if (live && live['Рекомендации'] && live['Рекомендации'].length) {
      var items = live['Рекомендации'];
      for (var li = 0; li < items.length; li++) {
        rec += '<div class="svc"><div class="ic">★</div><div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:14px;">' + esc(items[li]['Сервис']) + '</div>' +
          '<div class="small">' + esc(items[li]['Описание'] || '') + '</div>' +
          '<div class="tiny">' + esc(items[li]['Причина'] || '') + '</div></div>' +
          '<span class="badge">не подключён</span></div>';
      }
    } else {
      var have = {};
      var svcs = d['Сервисы'] || [];
      for (var i = 0; i < svcs.length; i++) {
        have[String(svcs[i]['ВидСервиса'] || svcs[i]['ВидПодписки'] || '').toLowerCase()] = 1;
      }
      for (var k = 0; k < CATALOG.length; k++) {
        var c = CATALOG[k];
        var hit = false;
        for (var hk in have) { if (hk.indexOf(c.name.toLowerCase()) >= 0) { hit = true; } }
        if (!hit) {
          rec += '<div class="svc"><div class="ic">★</div><div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + esc(c.name) + '</div>' +
            '<div class="small">' + esc(c.note) + '</div></div>' +
            '<span class="badge">не подключён</span></div>';
        }
      }
    }
    if (rec) {
      var prof = live ? String(live['Отрасль'] || live['ОКВЭД'] || '') : '';
      out += '<div class="panel"><h2>Сервисы, которые могут пригодиться</h2>' + rec +
        '<div class="tiny" style="margin-top:10px;">' +
        (prof ? 'Подобрано по профилю: ' + esc(prof) + '. ' : 'Профиль деятельности не заполнен — показаны сервисы для всех. ') +
        'Подключение — через вашего менеджера.</div></div>';
    }
    host.innerHTML = out || '<div class="panel"><div class="small">Рекомендаций пока нет.</div></div>';
  }

  /* ---------- КАРТОЧКА ---------- */
  function openAppeal(num) {
    state.current = num;
    $('ap-num').textContent = 'Обращение ' + num;
    $('ap-status').textContent = '';
    $('ap-body').innerHTML = '<div class="skel"></div><div class="skel" style="width:80%;"></div><div class="skel" style="width:60%;"></div>';
    show('appeal');
    call('RequestInfo', creds() + ' & Number = ' + num).then(function (j) {
      $('ap-status').textContent = j['Статус'] || j['Status'] || '';
      var tl = j['История'] || j['Таймлайн'] || j['History'] || [];
      var msgs = j['Переписка'] || j['Комментарии'] || j['Messages'] || [];
      var html = '';
      if (j['Тема'] || j['Содержание']) {
        html += '<div style="font-weight:600;margin-bottom:6px;">' + esc(j['Тема'] || '') + '</div>' +
          '<div class="small" style="white-space:pre-wrap;margin-bottom:14px;">' + esc(j['Содержание'] || '') + '</div>';
      }
      if (tl.length) {
        html += '<h2>Ход работ</h2><div class="tl">';
        for (var i = 0; i < tl.length; i++) {
          var t = tl[i];
          html += '<div class="tl-item"><div style="font-size:13.5px;">' + esc(t['Статус'] || t['Событие'] || t) + '</div>' +
            '<div class="feed-meta">' + fmtDate(t['Дата']) + '</div></div>';
        }
        html += '</div>';
      }
      if (msgs.length) {
        html += '<h2 style="margin-top:10px;">Переписка</h2>';
        for (var k = 0; k < msgs.length; k++) {
          var m = msgs[k];
          var mine = (m['Автор'] || '').indexOf(state.user) >= 0;
          html += '<div class="' + (mine ? 'chat-q' : 'chat-a') + '">' + esc(m['Текст'] || m['Text'] || m) +
            '<div class="feed-meta" style="margin-top:4px;' + (mine ? 'color:rgba(255,255,255,.75);' : '') + '">' +
            esc(m['Автор'] || '') + ' · ' + fmtDate(m['Дата']) + '</div></div>';
        }
      }
      $('ap-body').innerHTML = html || '<div class="small">Подробности недоступны.</div>';
    }).catch(function (e) {
      $('ap-body').innerHTML = '<div class="small">Не удалось загрузить: ' + esc(e.message) + '</div>';
    });
  }
  function sendComment() {
    var txt = $('ap-comment').value.trim();
    if (!txt) { return; }
    var b = $('btn-comment');
    b.innerHTML = '<span class="spin" style="border-top-color:#fff;"></span>';
    call('AddComment', creds() + ' & Number = ' + state.current + ' & Text = ' + txt.replace(/&/g, 'и'))
      .then(function (j) {
        if (j['Отказ'] === true) { throw new Error(j['Причина'] || 'отказ сервиса'); }
        $('ap-comment').value = '';
        toast('Дополнение отправлено');
        openAppeal(state.current);
      })
      .catch(function (e) { toast('Не удалось: ' + e.message); })
      .then(function () { b.textContent = 'Отправить'; });
  }

  /* ---------- НОВОЕ ОБРАЩЕНИЕ (линия + дерево тем) ---------- */
  function fillNewForm() {
    var lines = ((state.dash || {})['Линии'] || []);
    var lh = '';
    for (var i = 0; i < lines.length; i++) { lh += '<option>' + esc(lines[i]) + '</option>'; }
    $('n-line').innerHTML = lh || '<option>Основная линия</option>';
    var th = '';
    var tp = (window.TOPICS || []);
    for (var j = 0; j < tp.length; j++) { th += '<option>' + esc(tp[j].label) + '</option>'; }
    th += '<option>Другое</option>';
    $('n-topic').innerHTML = th;
    fillSubs();
  }
  function fillSubs() {
    var sel = $('n-topic').value;
    var tp = (window.TOPICS || []);
    var subs = [];
    for (var i = 0; i < tp.length; i++) { if (tp[i].label === sel) { subs = tp[i].subs || []; } }
    if (subs.length) {
      var h = '';
      for (var j = 0; j < subs.length; j++) { h += '<option>' + esc(subs[j]) + '</option>'; }
      $('n-sub').innerHTML = h;
      $('n-sub').style.display = 'block';
      $('n-sub-label').style.display = 'block';
    } else {
      $('n-sub').style.display = 'none';
      $('n-sub-label').style.display = 'none';
    }
  }
  function sendNew() {
    var line = $('n-line').value, topic = $('n-topic').value, text = $('n-text').value.trim();
    var sub = ($('n-sub').style.display !== 'none') ? $('n-sub').value : '';
    if (!text) { toast('Опишите суть вопроса'); return; }
    var b = $('btn-send');
    b.innerHTML = '<span class="spin" style="border-top-color:#fff;"></span> Отправляем…';
    var subj = topic + (sub ? ' / ' + sub : '');
    var content = 'Линия: ' + line + '\nТема: ' + subj + '\nСуть вопроса: ' + text +
      '\n---\nОтправлено из мобильного кабинета (PWA)';
    var body = JSON.stringify({
      Id: state.id, Pwd: state.pwd, UserName: state.user,
      SupportLine: line, Phone: '',
      'Тема': subj,
      Content: content.replace(/&/g, 'и'),
      'НавигационнаяСсылкаТекст': '',
      UserAccess: '["' + state.user + '"]'
    });
    call('CreateRequest', body, { 'Content-Type': 'application/json' }).then(function (j) {
      if (j && j['Отказ'] === true) { throw new Error(j['Причина'] || 'отказ сервиса'); }
      toast('Обращение создано и передано в поддержку');
      $('n-text').value = '';
      show('dash');
      loadAppeals();
    }).catch(function (e) { toast('Не удалось создать: ' + e.message); })
      .then(function () { b.textContent = 'Отправить в поддержку'; });
  }

  /* ---------- ИИ ---------- */
  function ask() {
    var q = $('ask-q').value.trim();
    if (!q) { return; }
    var log = $('ask-log');
    log.innerHTML += '<div class="chat-q">' + esc(q) + '</div>' +
      '<div class="chat-a" id="ask-wait"><span class="spin"></span> думаю…</div>';
    $('ask-q').value = '';
    window.scrollTo(0, document.body.scrollHeight);
    call('AiProxy', JSON.stringify({ question: q }), {
      'Content-Type': 'application/json', 'X-Ai-Path': '/ask_final', 'X-Client': 'pwa-' + state.id
    }).then(function (j) {
      $('ask-wait').outerHTML = '<div class="chat-a">' + esc(j['answer'] || 'ИИ не вернул ответ.') + '</div>';
      window.scrollTo(0, document.body.scrollHeight);
    }).catch(function (e) {
      $('ask-wait').outerHTML = '<div class="chat-a">ИИ недоступен: ' + esc(e.message) + '</div>';
    });
  }

  /* ---------- ЕЩЁ ---------- */
  function renderSettings() {
    $('s-mode').value = state.mode;
    $('s-api').value = state.api;
    $('s-api').disabled = state.mode === 'auto';
    $('s-who').textContent = state.id ? ('Вы вошли как: ' + state.user + ' · клиент ' + state.id) : 'Вход не выполнен';
    $('s-state').textContent = state.api ? ('Текущий адрес: ' + state.api) : 'Адрес API не определён';
  }
  function saveSettings() {
    state.mode = $('s-mode').value;
    LS.setItem('apiMode', state.mode);
    if (state.mode === 'manual') { state.api = $('s-api').value.trim(); LS.setItem('api', state.api); }
    toast('Сохранено'); renderSettings();
  }
  function logout() {
    var keys = [];
    for (var i = 0; i < LS.length; i++) { keys.push(LS.key(i)); }
    for (var j = 0; j < keys.length; j++) {
      if (keys[j] === 'cid' || keys[j] === 'cpwd' || keys[j] === 'cuser' || keys[j].indexOf('c:') === 0) { LS.removeItem(keys[j]); }
    }
    state.id = state.pwd = state.user = ''; state.dash = null; state.appeals = [];
    show('login');
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('btn-login').addEventListener('click', doLogin);
    $('f-user').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doLogin(); } });
    $('btn-new').addEventListener('click', function () { fillNewForm(); show('new'); });
    $('n-topic').addEventListener('change', fillSubs);
    $('btn-send').addEventListener('click', sendNew);
    $('btn-comment').addEventListener('click', sendComment);
    $('btn-ask').addEventListener('click', ask);
    $('ask-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { ask(); } });
    $('btn-save-set').addEventListener('click', saveSettings);
    $('btn-logout').addEventListener('click', logout);
    $('dash-refresh').addEventListener('click', function () { refreshAll(false); });
    $('s-mode').addEventListener('change', function () { $('s-api').disabled = this.value === 'auto'; });
    var nav = document.querySelectorAll('[data-go]');
    for (var i = 0; i < nav.length; i++) {
      nav[i].addEventListener('click', function () {
        var go = this.getAttribute('data-go');
        if (go === 'set') { renderSettings(); }
        show(go);
      });
    }
    if (state.id && state.pwd && state.user) {
      // мгновенный вход из кэша, данные обновляются фоном
      var cd = cacheGet('dash');
      if (cd) { state.dash = cd; enterCabinet(); resolveApi(); }
      else {
        resolveApi().then(function () { return call('ClientDashboard', creds()); })
          .then(function (d) {
            if (d['Отказ'] === true) { show('login'); return; }
            state.dash = d; cacheSet('dash', d); enterCabinet();
          }).catch(function () { show('login'); });
      }
    } else {
      resolveApi();
      show('login');
    }
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () { }); }
  });
})();
