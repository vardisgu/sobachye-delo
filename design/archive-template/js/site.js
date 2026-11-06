/* =====================================================================
   site.js — всё, что вокруг формы: шапка, меню, прайс, «Сейчас открыто»,
   появление блоков при прокрутке. Загружается после app.js и пользуется
   его window.Bublik (переход к форме, выбор услуги, сценки собачки).
   Обычный скрипт: работает и с диска (file://).
   ===================================================================== */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function mq(query) { return window.matchMedia ? window.matchMedia(query) : { matches: false }; }

  var B = window.Bublik || {};
  var hasIO = 'IntersectionObserver' in window;
  var reduced = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');

  var stage = $('stage');
  var topbar = $('topbar');
  var menu = $('menu');
  var services = $('services');
  var form = $('leadForm');

  /* ===================================================================
     1. Шапка на телефоне: прозрачная над сценой, плотная ниже неё.
     На компьютере сцена всегда на экране, и шапка не меняется.
     =================================================================== */
  if (topbar && stage && hasIO) {
    new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      topbar.classList.toggle('is-solid', !entry.isIntersecting);
    }, { rootMargin: '-40px 0px 0px 0px', threshold: 0 }).observe(stage);
  }

  /* ===================================================================
     2. Подсветка текущего раздела в шапке
     =================================================================== */
  var navLinks = document.querySelectorAll('.topbar__link');
  if (navLinks.length && hasIO) {
    var current = null;
    var setCurrent = function (id) {
      current = id;
      each(navLinks, function (link) {
        if (id && link.hash === '#' + id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    // Раздел «текущий», когда пересекает узкую полосу чуть выше середины экрана.
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrent(entry.target.id);
        else if (current === entry.target.id) setCurrent(null);
      });
    }, { rootMargin: '-42% 0px -57% 0px', threshold: 0 });
    each(document.querySelectorAll('main > section[id]'), function (s) { navIO.observe(s); });
  }

  /* ===================================================================
     3. Меню (popover): закрываем после выбора пункта, фокус — на первый пункт
     =================================================================== */
  function menuIsOpen() {
    try { return !!(menu && menu.matches(':popover-open')); } catch (e) { return false; }
  }

  if (menu && typeof menu.hidePopover === 'function') {
    menu.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (link && menuIsOpen() && !link.hasAttribute('data-go-form')) menu.hidePopover();
    });
    menu.addEventListener('toggle', function (event) {
      if (event.newState !== 'open') return;
      var first = menu.querySelector('.menu__link');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
      }
    });
  }

  /* ===================================================================
     4. «Записаться» в шапке и в меню: к форме.
     С мышью — сразу курсор в поле имени (собачка встаёт и просит),
     на телефоне — без клавиатуры, фокус на заголовок формы.
     =================================================================== */
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-go-form]');
    if (!trigger || typeof B.goToForm !== 'function') return;
    event.preventDefault();
    if (menuIsOpen()) menu.hidePopover();
    B.goToForm({ field: finePointer.matches });
  });

  /* ===================================================================
     5. Прайс: переключатель размера и карточки услуг
     =================================================================== */
  if (services) {
    var priceInputs = services.querySelectorAll('.sizes__input');
    var sizeTouched = false;

    var priceSize = function () {
      var checked = services.querySelector('.sizes__input:checked');
      return checked ? checked.value : 'mini';
    };

    each(priceInputs, function (input) {
      input.addEventListener('change', function () { sizeTouched = true; });
    });

    // Размер, выбранный в форме, сразу показывает цены для этого размера.
    if (form) {
      each(form.querySelectorAll('input[name="size"]'), function (radio) {
        radio.addEventListener('change', function () {
          if (!radio.checked) return;
          var twin = services.querySelector('.sizes__input[value="' + radio.value + '"]');
          if (twin) twin.checked = true;
        });
      });
    }

    // Клик по карточке: услуга отмечается в форме, страница едет к форме,
    // собачка показывает сценку (если она есть у услуги). Без JS ссылка просто ведёт к форме.
    services.addEventListener('click', function (event) {
      var tile = event.target.closest('.svc');
      if (!tile || typeof B.goToForm !== 'function') return;
      event.preventDefault();

      var nameEl = tile.querySelector('.svc__name');
      var serviceName = nameEl ? nameEl.textContent.trim() : '';
      var chip = B.selectService ? B.selectService(tile.getAttribute('data-service')) : null;
      if (chip && sizeTouched && B.selectSize) B.selectSize(priceSize());

      B.goToForm({ field: false });

      var scene = tile.getAttribute('data-scene');
      if (scene && B.playScene) B.playScene(scene);

      if (chip) {
        if (B.announce) B.announce('Услуга «' + serviceName + '» отмечена в заявке.');
        flash(chip.nextElementSibling);
      }
    });
  }

  // Короткая карамельная вспышка на чипсе, когда страница доехала до формы
  function flash(face) {
    if (!face) return;
    setTimeout(function () {
      face.classList.add('is-flash');
      setTimeout(function () { face.classList.remove('is-flash'); }, 900);
    }, reduced.matches ? 0 : 420);
  }

  /* ===================================================================
     6. «Сейчас открыто» по часам работы из data-open / data-close
     (в часовом поясе студии data-tz)
     =================================================================== */
  var status = document.querySelector('.open-status');

  function minutesOf(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function nowMinutes(tz) {
    try {
      var parts = new Intl.DateTimeFormat('ru-RU', {
        timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var h = 0, min = 0;
      parts.forEach(function (p) {
        if (p.type === 'hour') h = Number(p.value) % 24;
        if (p.type === 'minute') min = Number(p.value);
      });
      return h * 60 + min;
    } catch (e) {
      var d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  function updateStatus() {
    var open = minutesOf(status.getAttribute('data-open'));
    var close = minutesOf(status.getAttribute('data-close'));
    if (open == null || close == null) return;
    var now = nowMinutes(status.getAttribute('data-tz'));
    var isOpen = now >= open && now < close;
    status.textContent = isOpen
      ? 'Сейчас открыто, до ' + status.getAttribute('data-close')
      : 'Сейчас закрыто, откроемся ' + (now < open ? 'сегодня' : 'завтра') + ' в ' + status.getAttribute('data-open');
    status.classList.toggle('is-closed', !isOpen);
    status.hidden = false;
  }

  if (status) {
    updateStatus();
    setInterval(updateStatus, 60 * 1000);
  }

  /* ===================================================================
     7. Мастера листаются вбок: если не помещаются, даём листать с клавиатуры
     =================================================================== */
  var mastersList = document.querySelector('.masters__list');
  function checkMastersScroll() {
    if (!mastersList) return;
    if (mastersList.scrollWidth > mastersList.clientWidth + 2) {
      mastersList.setAttribute('tabindex', '0');
      mastersList.setAttribute('aria-label', 'Мастера, список листается вбок');
    } else {
      mastersList.removeAttribute('tabindex');
      mastersList.removeAttribute('aria-label');
    }
  }
  if (mastersList) {
    checkMastersScroll();
    if (window.ResizeObserver) new ResizeObserver(checkMastersScroll).observe(mastersList);
  }

  /* ===================================================================
     8. Появление карточек при прокрутке.
     Блоки, которые уже на экране, не трогаем; прятать (.reveal-pending)
     будем только то, что ниже. Блоки, въехавшие на экран вместе,
     появляются с небольшой лесенкой.
     =================================================================== */
  if (!reduced.matches && hasIO && document.visibilityState !== 'hidden') {
    var revealIO = new IntersectionObserver(function (entries) {
      var order = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        revealIO.unobserve(el);
        el.style.setProperty('--i', order++);
        el.classList.remove('reveal-pending');
        el.classList.add('reveal-in');
        var done = function (e) {
          if (e.target !== el) return;
          el.classList.remove('reveal-in');
          el.style.removeProperty('--i');
          el.removeEventListener('animationend', done);
        };
        el.addEventListener('animationend', done);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });

    var fold = window.innerHeight || document.documentElement.clientHeight;
    each(document.querySelectorAll('[data-reveal]'), function (el) {
      if (el.getBoundingClientRect().top < fold) return;
      el.classList.add('reveal-pending');
      revealIO.observe(el);
    });

    // Печать и «сохранить как PDF»: показываем всё сразу
    window.addEventListener('beforeprint', function () {
      each(document.querySelectorAll('.reveal-pending'), function (el) { el.classList.remove('reveal-pending'); });
    });
  }
})();
