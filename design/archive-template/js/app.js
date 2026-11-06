/* =====================================================================
   app.js — форма заявки и подключение собачки.
   Обычный скрипт (не модуль): работает и при открытии index.html
   прямо с диска (file://), и на любом хостинге.
   ===================================================================== */

/* ---------------------------------------------------------------------
   НАСТРОЙКИ ОТПРАВКИ ЗАЯВКИ
   endpoint — адрес обработчика, куда уходит заявка (POST, FormData).
              Подойдёт ваш серверный скрипт или сервис форм
              (Formspree, Getform, Basin и т. п.).
              Пустая строка '' = демо-режим: ничего никуда не уходит,
              через demoDelayMs показывается «Спасибо!».
   timeoutMs — сколько ждать ответа сервера, прежде чем показать ошибку.
   --------------------------------------------------------------------- */
var CONFIG = {
  endpoint: '',
  timeoutMs: 15000,
  demoDelayMs: 900
};

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var root = document.documentElement;
  var stage = $('stage');
  var canvas = $('dog');
  var formZone = $('formZone');
  var form = $('leadForm');
  var formView = $('formView');
  var successView = $('successView');
  var successTitle = $('successTitle');
  var successName = $('successName');
  var successNote = $('successNote');
  var submitBtn = $('submitBtn');
  var submitLabel = submitBtn ? submitBtn.querySelector('.btn__label') : null;
  var alertBox = $('formAlert');
  var alertText = $('formAlertText');
  var retryBtn = $('retryBtn');
  var againBtn = $('againBtn');
  var statusEl = $('formStatus');
  var honeypot = $('f-website');

  var LABEL_IDLE = 'Записаться на груминг';
  var LABEL_SENDING = 'Отправляем…';

  /* ===================================================================
     1. Собачка
     Если js/dog.js не загрузился или упал — страница работает без неё.
     =================================================================== */
  var dog = createDog();

  function readDebugOptions() {
    // Те же параметры, что у тестового стенда: ?paused&seed=7&norandom&reduced
    var opts = {};
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.has('paused')) opts.startPaused = true;
      if (q.has('seed')) {
        var seed = Number(q.get('seed'));
        if (isFinite(seed)) opts.seed = seed;
      }
      if (q.has('norandom')) opts.randomBehaviors = false;
      if (q.has('reduced')) opts.reducedMotion = true;
    } catch (e) { /* старый браузер — без отладочных параметров */ }
    return opts;
  }

  function createDog() {
    if (!stage || !canvas || !formZone) return null;
    try {
      if (!window.PuppyDog || typeof window.PuppyDog.create !== 'function') {
        throw new Error('PuppyDog не найден — js/dog.js не загрузился');
      }
      var opts = readDebugOptions();
      opts.stage = stage;
      opts.canvas = canvas;
      opts.formZone = formZone;
      var instance = window.PuppyDog.create(opts);
      if (!instance) throw new Error('PuppyDog.create() ничего не вернул');
      window.__dog = instance;
      root.classList.add('has-dog');
      return instance;
    } catch (err) {
      canvas.hidden = true;
      root.classList.add('no-dog');
      if (window.console && console.warn) {
        console.warn('[сайт] Собачка не запустилась, страница работает без неё:', err);
      }
      return null;
    }
  }

  function notifyDog(name) {
    if (!dog || typeof dog.notify !== 'function') return;
    try { dog.notify(name); } catch (e) { /* собачка не должна ломать форму */ }
  }

  /* Сценки «Мытьё» и «Стрижка» — не чаще раза в SCENE_COOLDOWN_MS,
     чтобы частые клики по чипсам и карточкам не превращали их в мельтешение. */
  var SCENE_COOLDOWN_MS = 6500;
  var lastSceneAt = -Infinity;

  function playScene(name) {
    if (!name) return false;
    var now = Date.now();
    if (now - lastSceneAt < SCENE_COOLDOWN_MS) return false;
    lastSceneAt = now;
    notifyDog(name);
    return true;
  }

  /* ===================================================================
     1б. Собачка не видна — не считаем её анимацию (экономим процессор).
     На компьютере сцена прилипает к экрану и почти всегда видна;
     на телефоне её можно прокрутить вверх.
     =================================================================== */
  var startPaused = /[?&]paused\b/.test(window.location.search);
  if (dog && dog.debug && !startPaused && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      try {
        if (entry.isIntersecting) dog.debug.resume();
        else dog.debug.pause();
      } catch (e) { /* без паузы тоже работает */ }
    }, { threshold: 0 }).observe(stage);
  }

  /* Колесо мыши двигает форму под неподвижным курсором, а собачка узнаёт
     о курсоре только по pointermove. Когда форма въезжает под курсор или
     уезжает из-под него, повторяем последнее положение курсора. */
  var lastPointer = null;
  window.addEventListener('pointermove', function (e) {
    if (e.isTrusted) lastPointer = { x: e.clientX, y: e.clientY, type: e.pointerType };
  }, { passive: true });

  if (dog && formZone && 'IntersectionObserver' in window && typeof window.PointerEvent === 'function') {
    var steps = [];
    for (var i = 0; i <= 20; i++) steps.push(i / 20);
    new IntersectionObserver(function () {
      if (!lastPointer || lastPointer.type !== 'mouse') return;
      try {
        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: lastPointer.x, clientY: lastPointer.y, pointerType: 'mouse'
        }));
      } catch (e) { /* не страшно */ }
    }, { threshold: steps }).observe(formZone);
  }

  if (!form) return;

  /* ===================================================================
     2. Фокус в форме → собачка встаёт и просит (на телефонах — главный
     способ: наведения мыши там нет). События шлём один раз на «вход»
     в форму и один раз на «выход», а не на каждое поле.
     =================================================================== */
  var formHasFocus = false;

  form.addEventListener('focusin', function () {
    if (formHasFocus) return;
    formHasFocus = true;
    notifyDog('form-focus');
  });

  form.addEventListener('focusout', function () {
    // Ждём, куда перейдёт фокус: если на соседнее поле — ничего не шлём.
    setTimeout(function () {
      if (!formHasFocus) return;
      var active = document.activeElement;
      if (active && form.contains(active)) return;
      formHasFocus = false;
      notifyDog('form-blur');
    }, 0);
  });

  function releaseFormFocus() {
    if (!formHasFocus) return;
    formHasFocus = false;
    notifyDog('form-blur');
  }

  /* ===================================================================
     2б. Выбор услуги → собачка показывает сценку (мытьё, стрижку).
     Сценка — только на включение чипса, не на выключение.
     =================================================================== */
  Array.prototype.forEach.call(form.querySelectorAll('[data-scene]'), function (input) {
    input.addEventListener('change', function () {
      if (input.checked) playScene(input.getAttribute('data-scene'));
    });
  });

  /* ===================================================================
     3. Проверка полей
     =================================================================== */
  var EMAIL_RE = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.\d]{2,}$/;
  var PHONE_CHARS_RE = /^\+?[\d\s().\-]+$/;

  function digitCount(value) { return value.replace(/\D+/g, '').length; }
  function isEmail(value) { return EMAIL_RE.test(value); }
  function isPhone(value) {
    if (!PHONE_CHARS_RE.test(value)) return false;
    var n = digitCount(value);
    return n >= 10 && n <= 15;
  }

  var RULES = {
    name: function (el) {
      if (!el.value.trim()) return 'Напишите, пожалуйста, как к вам обращаться.';
      return '';
    },
    contact: function (el) {
      var v = el.value.trim();
      if (!v) return 'Оставьте телефон или e-mail, иначе мы не сможем ответить.';
      if (isEmail(v) || isPhone(v)) return '';
      if (v.indexOf('@') !== -1) return 'Кажется, в e-mail опечатка. Пример: name@mail.ru';
      if (PHONE_CHARS_RE.test(v)) return 'В номере телефона нужно не меньше 10 цифр.';
      return 'Нужен e-mail или номер телефона, например +7 900 123-45-67.';
    },
    consent: function (el) {
      return el.checked ? '' : 'Поставьте галочку: без согласия мы не можем принять заявку.';
    }
  };

  var fields = ['name', 'contact', 'consent'].map(function (key) {
    var input = $('f-' + key);
    var box = $('f-' + key + '-error');
    return {
      key: key,
      input: input,
      wrap: form.querySelector('[data-field="' + key + '"]'),
      msg: box ? box.querySelector('p') : null,
      isCheckbox: input.type === 'checkbox'
    };
  });

  var attempted = false;   // была ли попытка отправки
  var sending = false;

  function setError(f, message) {
    if (message) {
      f.wrap.classList.add('is-invalid');
      f.input.setAttribute('aria-invalid', 'true');
      var current = f.msg.firstChild;
      if (!current || current.textContent !== message) {
        var span = document.createElement('span');
        span.className = 'field__msg';
        span.textContent = message;
        f.msg.textContent = '';
        f.msg.appendChild(span);
      }
    } else {
      f.wrap.classList.remove('is-invalid');
      f.input.removeAttribute('aria-invalid');
      f.msg.textContent = '';
    }
  }

  function validate(f) {
    var message = RULES[f.key](f.input);
    setError(f, message);
    return !message;
  }

  fields.forEach(function (f) {
    if (f.isCheckbox) {
      f.input.addEventListener('change', function () {
        if (attempted || f.wrap.classList.contains('is-invalid')) validate(f);
      });
      return;
    }
    // На выходе из поля: проверяем, если человек что-то ввёл
    // (или уже пытался отправить) — пустое поле не ругаем раньше времени.
    f.input.addEventListener('blur', function () {
      if (sending) return;
      if (f.input.value.trim() || attempted || f.wrap.classList.contains('is-invalid')) validate(f);
    });
    // Во время ввода только снимаем ошибку, как только значение стало верным;
    // новые замечания появятся не раньше, чем человек выйдет из поля.
    f.input.addEventListener('input', function () {
      if (f.wrap.classList.contains('is-invalid') && !RULES[f.key](f.input)) setError(f, '');
    });
  });

  /* ===================================================================
     4. Отправка
     =================================================================== */
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit();
  });

  if (retryBtn) retryBtn.addEventListener('click', submit);

  function submit() {
    if (sending) return;
    attempted = true;
    hideAlert();

    var firstInvalid = null;
    fields.forEach(function (f) {
      if (!validate(f) && !firstInvalid) firstInvalid = f;
    });

    if (firstInvalid) {
      firstInvalid.input.focus();
      announce('Проверьте, пожалуйста, отмеченные поля формы.');
      notifyDog('form-error');
      return;
    }

    // Бот заполнил скрытое поле — делаем вид, что всё хорошо, и ничего не шлём.
    if (honeypot && honeypot.value) {
      showSuccess();
      return;
    }

    var data = new FormData(form);
    setSending(true);
    announce('Отправляем заявку…');

    send(data).then(function () {
      setSending(false);
      showSuccess();
    }, function (err) {
      setSending(false);
      showFailure(err);
    });
  }

  function send(data) {
    if (!CONFIG.endpoint) {
      if (window.console && console.info) {
        console.info('[сайт] Демо-режим: заявка не отправлена. Укажите CONFIG.endpoint в js/app.js.');
      }
      return new Promise(function (resolve) {
        setTimeout(resolve, CONFIG.demoDelayMs);
      });
    }

    if (typeof window.fetch !== 'function') {
      return Promise.reject(sendError('network'));
    }

    var controller = typeof window.AbortController === 'function' ? new AbortController() : null;

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) controller.abort();
        reject(sendError('timeout'));
      }, CONFIG.timeoutMs);

      fetch(CONFIG.endpoint, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (response.ok) resolve(response);
        else reject(sendError('http', response.status));
      }, function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(sendError(navigator.onLine === false ? 'offline' : 'network'));
      });
    });
  }

  function sendError(kind, status) {
    var err = new Error('send failed: ' + kind + (status ? ' ' + status : ''));
    err.kind = kind;
    err.status = status || 0;
    return err;
  }

  function setSending(on) {
    sending = on;
    form.classList.toggle('is-sending', on);
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    submitBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
    if (submitLabel) submitLabel.textContent = on ? LABEL_SENDING : LABEL_IDLE;
    if (retryBtn) retryBtn.disabled = on;
  }

  function showFailure(err) {
    var kind = err && err.kind;
    var message =
      kind === 'offline' ? 'Похоже, пропал интернет. Данные на месте, можно попробовать ещё раз.' :
      kind === 'timeout' ? 'Сервер долго не отвечает. Данные на месте, можно попробовать ещё раз.' :
      'Заявка не отправилась. Данные на месте, можно попробовать ещё раз.';
    alertText.textContent = message;
    alertBox.hidden = false;
    announce(message);
    notifyDog('form-error');
  }

  function hideAlert() {
    if (alertBox) alertBox.hidden = true;
  }

  /* ===================================================================
     5. «Спасибо!» и «Отправить ещё»
     =================================================================== */
  var desktopQuery = window.matchMedia ? window.matchMedia('(min-width: 761px)') : null;

  function showSuccess() {
    var name = $('f-name').value.trim().replace(/\s+/g, ' ');
    if (name.length > 40) name = name.slice(0, 40).trim() + '…';
    successName.textContent = name ? ', ' + name : '';
    successNote.hidden = !dog;

    // На десктопе карточка держит прежнюю высоту — ничего не прыгает.
    if (desktopQuery && desktopQuery.matches) {
      formZone.style.minHeight = formZone.offsetHeight + 'px';
    }

    formView.hidden = true;
    successView.hidden = false;
    successTitle.focus();

    // Фокус ушёл из формы: сначала «blur», потом радость.
    releaseFormFocus();
    announce('Спасибо! Заявка отправлена.');
    notifyDog('form-submit-success');
  }

  if (againBtn) {
    againBtn.addEventListener('click', function () {
      form.reset();
      attempted = false;
      fields.forEach(function (f) { setError(f, ''); });
      hideAlert();
      formZone.style.minHeight = '';
      successView.hidden = true;
      formView.hidden = false;
      announce('');
      $('f-name').focus();
    });
  }

  window.addEventListener('resize', function () {
    if (formZone.style.minHeight) formZone.style.minHeight = '';
  });

  /* ===================================================================
     6. Объявления для экранных дикторов
     =================================================================== */
  var announceTimer = 0;

  function announce(message) {
    if (!statusEl) return;
    clearTimeout(announceTimer);
    statusEl.textContent = '';
    if (!message) return;
    // Небольшая пауза, чтобы одинаковое сообщение прозвучало повторно.
    announceTimer = setTimeout(function () { statusEl.textContent = message; }, 60);
  }

  /* ===================================================================
     7. Переход к форме из шапки, меню и прайса
     =================================================================== */
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // opts.field: true — поставить курсор в поле «Ваше имя» (собачка встанет и попросит),
  // иначе фокус уходит на заголовок формы, а сценка собачки не перебивается.
  function goToForm(opts) {
    opts = opts || {};
    var smooth = !(reducedQuery && reducedQuery.matches);
    var top;
    if (desktopQuery && desktopQuery.matches) {
      var section = $('contact') || formZone;
      top = window.pageYOffset + section.getBoundingClientRect().top;
    } else {
      // Телефон: прокручиваем так, чтобы снизу сцены осталась собачка, а под ней — форма.
      var r = stage.getBoundingClientRect();
      top = window.pageYOffset + r.top + r.height * 0.42;
    }
    try {
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    } catch (e) {
      window.scrollTo(0, Math.max(0, top));
    }

    var target;
    if (!successView.hidden) target = successTitle;
    else if (opts.field) target = $('f-name');
    else target = $('form-title');
    if (target) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }

  // Отметить услугу в форме. Возвращает чипс или null (например, на экране «Спасибо»).
  function selectService(value) {
    if (!successView.hidden) return null;
    var input = form.querySelector('input[name="service"][value="' + value + '"]');
    if (!input) return null;
    input.checked = true;
    return input;
  }

  function selectSize(value) {
    if (!successView.hidden) return null;
    var input = form.querySelector('input[name="size"][value="' + value + '"]');
    if (input) input.checked = true;
    return input;
  }

  // Для js/site.js
  window.Bublik = {
    dog: dog,
    playScene: playScene,
    goToForm: goToForm,
    selectService: selectService,
    selectSize: selectSize,
    announce: announce
  };
})();
