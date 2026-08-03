/* Кабинет клиента Интерсофт — PWA. Данные: HTTP-сервис plpk через CORS-шлюз.
   Адрес шлюза берётся из api.json репозитория (режим «Авто») или задаётся вручную. */
(function () {
  'use strict';

  var LS = window.localStorage;
  var API_META_URL = 'api.json'; // рядом с приложением; при деплое обновляется сервером туннеля
  var state = {
    api: LS.getItem('api') || '',
    mode: LS.getItem('apiMode') || 'auto',
    id: LS.getItem('cid') || '',
    pwd: LS.getItem('cpwd') || '',
    user: LS.getItem('cuser') || '',
    dash: null,
    appeals: [],
    current: null
  };

  /* ---------- утилиты ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var toastT = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast on';
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

  /* ---------- API ---------- */
  function apiBase() { return (state.api || '').replace(/\/+$/, ''); }
  function creds() {
    return 'Id = ' + state.id + ' & Pwd = ' + state.pwd + ' & UserName = ' + state.user;
  }
  function call(method, body, extraHeaders) {
    var h = { 'Content-Type': 'text/plain; charset=utf-8' };
    if (extraHeaders) { for (var k in extraHeaders) { h[k] = extraHeaders[k]; } }
    return fetch(apiBase() + '/plpk/' + method, {
      method: 'POST', headers: h, body: body == null ? '' : body
    }).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.text();
    }).then(function (t) { return t ? JSON.parse(t) : {}; });
  }

  // режим «Авто»: адрес шлюза из api.json (обновляется автоматически при смене туннеля)
  function resolveApi() {
    if (state.mode === 'manual' && state.api) { return Promise.resolve(state.api); }
    return fetch(API_META_URL + '?t=' + Date.now()).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.api) { state.api = j.api; LS.setItem('api', j.api); }
        return state.api;
      })
      .catch(function () { return state.api; });
  }

  /* ---------- вход ---------- */
  function doLogin() {
    var id = $('f-id').value.trim(), pwd = $('f-pwd').value.trim(), user = $('f-user').value.trim();
    var err = $('login-err');
    err.style.display = 'none';
    if (!id || !pwd || !user) { err.textContent = 'Заполните все поля.'; err.style.display = 'block'; return; }
    var b = $('btn-login');
    b.innerHTML = '<span class="spin"></span> Проверяем…';
    state.id = id; state.pwd = pwd; state.user = user;
    resolveApi().then(function () {
      if (!state.api) { throw new Error('нет адреса API — задайте в настройках'); }
      return call('ClientDashboard', creds());
    }).then(function (d) {
      if (d['Отказ'] === true) { throw new Error(d['Причина'] || 'Неверные данные'); }
      LS.setItem('cid', id); LS.setItem('cpwd', pwd); LS.setItem('cuser', user);
      state.dash = d;
      renderDash();
      show('dash');
      loadAppeals(); loadNews(); loadDocs();
    }).catch(function (e) {
      err.textContent = 'Не удалось войти: ' + e.message;
      err.style.display = 'block';
    }).then(function () { b.textContent = 'Войти в кабинет'; });
  }

  /* ---------- дашборд ---------- */
  function renderDash() {
    var d = state.dash || {};
    var cli = d['Клиент'] || {};
    $('dash-client').textContent = (cli['Наименование'] || '') + ' · код ' + state.id;

    var m = d['Менеджер'] || {};
    var mi = (m['Имя'] || m['name'] || 'М').toString();
    var initials = mi.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
    $('p-manager').innerHTML =
      '<div class="row"><div class="mgr-ava">' + esc(initials) + '</div>' +
      '<div><div class="small">Ваш личный менеджер</div>' +
      '<div style="font-weight:600;font-size:15px;">' + esc(m['Имя'] || m['name'] || '—') + '</div>' +
      '<div class="small">' + esc(m['Телефон'] || m['phone'] || '') + '</div>' +
      (m['Почта'] || m['email'] ? '<div class="small"><a href="mailto:' + esc(m['Почта'] || m['email']) + '">' + esc(m['Почта'] || m['email']) + '</a></div>' : '') +
      '</div></div>';

    var s = d['Сводка'] || {};
    var months = d['ПоМесяцам'] || [];
    var bars = '';
    var mx = 1;
    for (var i = 0; i < months.length; i++) { mx = Math.max(mx, months[i]['Количество'] || months[i] || 0); }
    for (var i2 = 0; i2 < months.length; i2++) {
      var v = months[i2]['Количество'] != null ? months[i2]['Количество'] : months[i2];
      bars += '<i style="height:' + Math.max(5, Math.round(v / mx * 100)) + '%"></i>';
    }
    $('p-summary').innerHTML =
      '<h2>Состояние сопровождения</h2>' +
      '<div class="grid2">' +
      '<div class="tile"><b>' + esc(s['ВРаботе'] != null ? s['ВРаботе'] : '—') + '</b><span>в работе</span></div>' +
      '<div class="tile"><b>' + esc(s['ОжидаетКлиента'] != null ? s['ОжидаетКлиента'] : '—') + '</b><span>ожидает вас</span></div>' +
      '</div>' +
      (months.length ? '<div class="bars">' + bars + '</div><div class="small" style="margin-top:5px;">обращения за 12 месяцев</div>' : '');
  }

  function loadAppeals() {
    var host = $('p-feed');
    host.innerHTML = '<div class="small"><span class="spin"></span> загрузка…</div>';
    var today = new Date();
    var d2 = '' + (today.getFullYear() + 1) + '1231';
    call('ClientRequests', creds() + ' & Date1 = 20200101 & Date2 = ' + d2).then(function (j) {
      var list = j;
      if (!(list instanceof Array)) { list = j['Обращения'] || j['data'] || []; }
      state.appeals = list;
      if (!list.length) { host.innerHTML = '<div class="small">Обращений пока нет.</div>'; return; }
      var out = '';
      for (var i = 0; i < Math.min(list.length, 20); i++) {
        var a = list[i];
        var num = a['Номер'] || a['Number'] || '';
        var status = a['Статус'] || a['Status'] || '';
        out += '<div class="feed-item" data-num="' + esc(num) + '">' +
          '<div class="feed-title">' + esc(a['Тема'] || a['Наименование'] || a['Subject'] || ('Обращение ' + num)) + '</div>' +
          '<div class="feed-meta">' + esc(num) + ' · ' + esc(a['Дата'] || a['Date'] || '') +
          (status ? ' · <span class="badge" style="padding:2px 8px;">' + esc(status) + '</span>' : '') + '</div></div>';
      }
      host.innerHTML = out;
      var items = host.querySelectorAll('.feed-item');
      for (var k = 0; k < items.length; k++) {
        items[k].addEventListener('click', function () { openAppeal(this.getAttribute('data-num')); });
      }
    }).catch(function (e) { host.innerHTML = '<div class="small">Не удалось загрузить: ' + esc(e.message) + '</div>'; });
  }

  function loadNews() {
    var host = $('p-news');
    host.innerHTML = '<div class="small"><span class="spin"></span></div>';
    var cfg = ((state.dash || {})['КонфигурацияПредставление'] || 'Управление торговлей');
    call('Releases', 'Configs = ' + cfg).then(function (j) {
      var list = (j instanceof Array) ? j : (j['Релизы'] || j['data'] || []);
      if (!list.length) { host.innerHTML = '<div class="small">Свежих релизов нет.</div>'; return; }
      var out = '';
      for (var i = 0; i < Math.min(list.length, 5); i++) {
        var r = list[i];
        out += '<div class="feed-item"><div class="feed-title">' + esc(r['Наименование'] || '') + ' ' + esc(r['Версия'] || '') + '</div>' +
          '<div class="feed-meta">' + esc(r['ДатаРелиза'] || '') + '</div></div>';
      }
      host.innerHTML = out;
    }).catch(function () { host.innerHTML = '<div class="small">Раздел недоступен.</div>'; });
  }

  function loadDocs() {
    var host = $('p-docs');
    host.innerHTML = '<div class="small"><span class="spin"></span></div>';
    call('ClientDocuments', creds()).then(function (j) {
      var list = (j instanceof Array) ? j : (j['Документы'] || j['data'] || []);
      if (!list.length) { host.innerHTML = '<div class="small">Документов нет.</div>'; return; }
      var out = '';
      for (var i = 0; i < Math.min(list.length, 8); i++) {
        var doc = list[i];
        out += '<div class="feed-item"><div class="feed-title">' + esc(doc['Наименование'] || doc['Номер'] || '') + '</div>' +
          '<div class="feed-meta">' + esc(doc['Дата'] || '') + (doc['Сумма'] ? ' · ' + esc(doc['Сумма']) + ' ₽' : '') + '</div></div>';
      }
      host.innerHTML = out;
    }).catch(function () { host.innerHTML = '<div class="small">Раздел недоступен.</div>'; });
  }

  /* ---------- карточка обращения ---------- */
  function openAppeal(num) {
    state.current = num;
    $('ap-num').textContent = 'Обращение ' + num;
    $('ap-status').textContent = '';
    $('ap-body').innerHTML = '<div class="small"><span class="spin"></span> загрузка…</div>';
    show('appeal');
    call('RequestInfo', creds() + ' & Number = ' + num).then(function (j) {
      var st = j['Статус'] || j['Status'] || '';
      $('ap-status').textContent = st;
      var tl = j['История'] || j['Таймлайн'] || j['History'] || [];
      var msgs = j['Переписка'] || j['Комментарии'] || j['Messages'] || [];
      var html = '';
      if (j['Тема'] || j['Содержание']) {
        html += '<div style="font-weight:600;margin-bottom:6px;">' + esc(j['Тема'] || '') + '</div>' +
          '<div class="small" style="white-space:pre-wrap;margin-bottom:12px;">' + esc(j['Содержание'] || '') + '</div>';
      }
      if (tl.length) {
        html += '<h2>Ход работ</h2><div class="tl">';
        for (var i = 0; i < tl.length; i++) {
          var t = tl[i];
          html += '<div class="tl-item"><div style="font-size:13.5px;">' + esc(t['Статус'] || t['Событие'] || t) + '</div>' +
            '<div class="feed-meta">' + esc(t['Дата'] || '') + '</div></div>';
        }
        html += '</div>';
      }
      if (msgs.length) {
        html += '<h2 style="margin-top:8px;">Переписка</h2>';
        for (var k = 0; k < msgs.length; k++) {
          var m = msgs[k];
          var mine = (m['Автор'] || '').indexOf(state.user) >= 0;
          html += '<div class="' + (mine ? 'chat-q' : 'chat-a') + '">' + esc(m['Текст'] || m['Text'] || m) +
            '<div class="feed-meta" style="margin-top:4px;">' + esc(m['Автор'] || '') + ' · ' + esc(m['Дата'] || '') + '</div></div>';
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
    b.innerHTML = '<span class="spin"></span>';
    call('AddComment', creds() + ' & Number = ' + state.current + ' & Text = ' + txt.replace(/&/g, 'и'))
      .then(function (j) {
        if (j['Отказ'] === true) { throw new Error(j['Причина'] || 'отказ сервиса'); }
        $('ap-comment').value = '';
        toast('Дополнение отправлено — исполнитель увидит его в переписке');
        openAppeal(state.current);
      })
      .catch(function (e) { toast('Не удалось: ' + e.message); })
      .then(function () { b.textContent = 'Отправить'; });
  }

  /* ---------- новое обращение ---------- */
  function sendNew() {
    var topic = $('n-topic').value, text = $('n-text').value.trim();
    if (!text) { toast('Опишите суть вопроса'); return; }
    var b = $('btn-send');
    b.innerHTML = '<span class="spin"></span> Отправляем…';
    var content = 'Тема: ' + topic + '\nСуть вопроса: ' + text +
      '\n---\nОтправлено из мобильного кабинета (PWA)';
    var body = JSON.stringify({
      Id: state.id, Pwd: state.pwd, UserName: state.user,
      SupportLine: '', Phone: '',
      'Тема': topic + ' (мобильный кабинет)',
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

  /* ---------- вопрос ИИ ---------- */
  function ask() {
    var q = $('ask-q').value.trim();
    if (!q) { return; }
    var log = $('ask-log');
    log.innerHTML += '<div class="chat-q">' + esc(q) + '</div>';
    log.innerHTML += '<div class="chat-a" id="ask-wait"><span class="spin"></span> думаю…</div>';
    $('ask-q').value = '';
    window.scrollTo(0, document.body.scrollHeight);
    call('AiProxy', JSON.stringify({ question: q }), {
      'Content-Type': 'application/json', 'X-Ai-Path': '/ask_final', 'X-Client': 'pwa-' + state.id
    }).then(function (j) {
      var a = j['answer'] || 'ИИ не вернул ответ.';
      $('ask-wait').outerHTML = '<div class="chat-a">' + esc(a) + '</div>';
      window.scrollTo(0, document.body.scrollHeight);
    }).catch(function (e) {
      $('ask-wait').outerHTML = '<div class="chat-a">ИИ недоступен: ' + esc(e.message) + '</div>';
    });
  }

  /* ---------- настройки ---------- */
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
    if (state.mode === 'manual') {
      state.api = $('s-api').value.trim();
      LS.setItem('api', state.api);
    }
    toast('Сохранено');
    renderSettings();
  }
  function logout() {
    LS.removeItem('cid'); LS.removeItem('cpwd'); LS.removeItem('cuser');
    state.id = state.pwd = state.user = '';
    show('login');
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('btn-login').addEventListener('click', doLogin);
    $('f-user').addEventListener('keydown', function (e) { if (e.key === 'Enter') { doLogin(); } });
    $('btn-new').addEventListener('click', function () { show('new'); });
    $('btn-send').addEventListener('click', sendNew);
    $('btn-comment').addEventListener('click', sendComment);
    $('btn-ask').addEventListener('click', ask);
    $('ask-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { ask(); } });
    $('btn-save-set').addEventListener('click', saveSettings);
    $('btn-logout').addEventListener('click', logout);
    $('dash-refresh').addEventListener('click', function () {
      call('ClientDashboard', creds()).then(function (d) { state.dash = d; renderDash(); loadAppeals(); loadNews(); loadDocs(); toast('Обновлено'); });
    });
    $('s-mode').addEventListener('change', function () { $('s-api').disabled = this.value === 'auto'; });
    var nav = document.querySelectorAll('[data-go]');
    for (var i = 0; i < nav.length; i++) {
      nav[i].addEventListener('click', function () {
        var go = this.getAttribute('data-go');
        if (go === 'set') { renderSettings(); }
        show(go);
      });
    }
    // автовход, если креды сохранены
    if (state.id && state.pwd && state.user) {
      resolveApi().then(function () {
        return call('ClientDashboard', creds());
      }).then(function (d) {
        if (d['Отказ'] === true) { show('login'); return; }
        state.dash = d; renderDash(); show('dash');
        loadAppeals(); loadNews(); loadDocs();
      }).catch(function () { show('login'); });
    } else {
      resolveApi();
      show('login');
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    }
  });
})();
