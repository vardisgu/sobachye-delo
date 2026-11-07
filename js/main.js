/* «Собачье дело» (DOGDELO): скрипт страницы.
   Обычный скрипт: работает и с диска (file://), и на любом хостинге.
   На странице одна живая собачка, в блоке «Запишите меня!». Больше ничего само не двигается.

   НАСТРОЙКИ ОТПРАВКИ ЗАЯВКИ
   endpoint: адрес обработчика (POST, FormData). Подойдёт свой сервер или сервис форм
             (Formspree, Getform, Basin). Пустая строка = демо: заявка никуда не уходит,
             через demoDelayMs показывается «Заявка у нас!». */
var CONFIG = { endpoint: '', timeoutMs: 15000, demoDelayMs: 900 };

(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var reduced = q.has('reduced') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var manual = q.has('paused');                       // для записи роликов: время идёт только через __site.step(ms)
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- шапка: тонкая линия, когда страница прокручена ---------- */
  var top = $('.top');
  function onScroll() { top.classList.toggle('is-stuck', scrollY > 4); }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- «До и после»: стрелки листают ленту ---------- */
  $$('.arrows').forEach(function (box) {
    var track = document.getElementById(box.getAttribute('data-for')), btns = $$('button', box);
    function step() { var li = track.firstElementChild; return li ? li.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : track.clientWidth; }
    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      btns[0].disabled = track.scrollLeft <= 2; btns[1].disabled = track.scrollLeft >= max;
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { track.scrollBy({ left: +b.getAttribute('data-dir') * step(), behavior: reduced ? 'auto' : 'smooth' }); }); });
    track.addEventListener('scroll', sync, { passive: true }); addEventListener('resize', sync); sync();
  });

  /* ---------- цены: переключатель размера ---------- */
  function rub(n) { return 'от ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }
  function showPrices() {
    var i = +($('input[name=psize]:checked') || { value: 0 }).value;
    $$('.menu__price').forEach(function (el) { el.textContent = rub(el.getAttribute('data-p').split(',')[i]); });
  }
  $$('input[name=psize]').forEach(function (r) { r.addEventListener('change', showPrices); });
  showPrices();

  /* нажатие на услугу или «Записаться к мастеру» сразу отмечает это в заявке */
  var form = $('#leadForm');
  $$('.menu a[data-service]').forEach(function (a) {
    a.addEventListener('click', function () {
      var box = form.querySelector('input[name=service][value="' + a.getAttribute('data-service') + '"]');
      if (box) box.checked = true;
      var pet = form.querySelector('input[name=pet][value="' + (a.getAttribute('data-pet') === 'cat' ? 'Кошку' : 'Собаку') + '"]');
      if (pet) pet.checked = true;
    });
  });
  $$('a[data-master]').forEach(function (a) {
    a.addEventListener('click', function () { form.elements.master.value = a.getAttribute('data-master'); });
  });

  /* =====================================================================
     Собачка в блоке «Запишите меня!»: просится к экрану, пока вы заполняете форму
     ===================================================================== */
  var clock = { t: 0 }, dogs = [];
  var formZone = $('#formZone'), bookStage = $('#bookStage'), bookDog = null;
  if (window.PuppyDog && PuppyDog.create) {
    try {
      var api = PuppyDog.create({ stage: bookStage, formZone: formZone, seed: 21, randomBehaviors: true, reducedMotion: reduced, startPaused: manual,
        shadow: '#5a1f33', homeX: 0.5, ground: 0.88, size: 0.56, sizeMax: 300, maxW: 0.62 });
      bookDog = { api: api, el: bookStage, visible: true };
      dogs.push(bookDog);
    } catch (e) { if (window.console) console.error(e); }
  }
  // собачка не считается, пока её не видно: страница не тратит силы зря
  if (bookDog && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        bookDog.visible = e.isIntersecting;
        if (!manual) { if (e.isIntersecting) bookDog.api.debug.resume(); else bookDog.api.debug.pause(); }
      });
    }, { rootMargin: '60px 0px' }).observe(bookStage);
  }
  if (bookDog) {
    formZone.addEventListener('focusin', function () { bookDog.api.notify('form-focus'); });
    formZone.addEventListener('focusout', function () { bookDog.api.notify('form-blur'); });
  }

  /* ---------- форма: проверка, отправка, «Заявка у нас!» ---------- */
  var submitBtn = $('#submitBtn'), alertBox = $('#formAlert'), doneView = $('#doneView');
  function fieldErr(name, msg) {
    var wrap = form.querySelector('[data-field="' + name + '"]'); if (!wrap) return;
    wrap.classList.toggle('is-bad', !!msg);
    var em = $('.field__err', wrap); if (em) em.textContent = msg || '';
  }
  function validate() {
    var ok = true, first = null, d = form.elements;
    var name = d.name.value.trim(), digits = d.contact.value.replace(/\D/g, '');
    if (!name) { fieldErr('name', 'Как к вам обращаться?'); ok = false; first = first || d.name; } else fieldErr('name');
    if (!digits) { fieldErr('contact', 'Оставьте телефон, мы перезвоним'); ok = false; first = first || d.contact; }
    else if (digits.length < 10 || digits.length > 12) { fieldErr('contact', 'Проверьте номер: нужно 10–11 цифр'); ok = false; first = first || d.contact; }
    else fieldErr('contact');
    var cons = form.querySelector('[data-field="consent"]');
    cons.classList.toggle('is-bad', !d.consent.checked);
    if (!d.consent.checked) { ok = false; first = first || d.consent; }
    if (first) first.focus();
    return ok;
  }
  ['name', 'contact'].forEach(function (n) { form.elements[n].addEventListener('input', function () { if (form.querySelector('[data-field="' + n + '"]').classList.contains('is-bad')) validate(); }); });
  form.elements.consent.addEventListener('change', function () { form.querySelector('[data-field="consent"]').classList.toggle('is-bad', !form.elements.consent.checked); });
  function busy(on) { submitBtn.setAttribute('aria-busy', on ? 'true' : 'false'); $('.btn__label', submitBtn).textContent = on ? 'Отправляем…' : 'Отправить заявку'; }
  function showDone() {
    var name = form.elements.name.value.trim();
    $('#doneText').textContent = (name ? name + ', спасибо! ' : 'Спасибо! ') + 'Администратор перезвонит в рабочее время (10:00–20:00) и подберёт удобный день.';
    doneView.style.minHeight = form.offsetHeight + 'px';            // блок не схлопывается
    form.hidden = true; doneView.hidden = false; doneView.focus({ preventScroll: true });
    if (bookDog) bookDog.api.notify('form-submit-success');
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); alertBox.hidden = true;
    if (!validate()) { if (bookDog) bookDog.api.notify('form-error'); return; }
    if (form.elements.website.value) { showDone(); return; }      // ловушка для ботов: делаем вид, что всё ушло
    busy(true);
    if (!CONFIG.endpoint) { setTimeout(function () { busy(false); showDone(); }, CONFIG.demoDelayMs); return; }
    var ctrl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.timeoutMs);
    fetch(CONFIG.endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); clearTimeout(to); busy(false); showDone(); })
      .catch(function () {
        clearTimeout(to); busy(false);
        alertBox.textContent = 'Не получилось отправить заявку. Проверьте интернет и попробуйте ещё раз или позвоните: +7 905 311-22-83.';
        alertBox.hidden = false; if (bookDog) bookDog.api.notify('form-error');
      });
  });
  $('#againBtn').addEventListener('click', function () { form.reset(); doneView.hidden = true; form.hidden = false; form.elements.name.focus(); });

  /* для записи роликов: ?paused и __site.step(ms) двигают время вручную */
  window.__site = {
    step: function (ms) { clock.t += ms / 1000; dogs.forEach(function (d) { if (d.visible) d.api.debug.step(ms); }); },
    dogs: dogs, book: function () { return bookDog; }
  };
})();
