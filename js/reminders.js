/* =========================================================
   Avisos de tareas
   ---------------------------------------------------------
   Mientras el CRM está abierto, cada persona recibe un aviso
   cuando llega la hora de una tarea suya (y 15 minutos antes si
   es de prioridad Alta). No hace lecturas extra: revisa las
   tareas que ya están cargadas.
   ========================================================= */
const Reminders = (() => {
  const KEY = 'crm_mq_notified';
  const LEAD = 15 * 60000;
  let notified = {};
  let started = false;
  let summaryShown = false;

  function load() {
    try { notified = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { notified = {}; }
    const old = Date.now() - 4 * U.DAY;
    Object.keys(notified).forEach((k) => { if (notified[k] < old) delete notified[k]; });
  }
  function mark(k) { notified[k] = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(notified)); } catch (e) {} }

  function start() {
    if (started) return;
    started = true;
    load();
    setTimeout(check, 3000);
    setInterval(check, 30000);
  }

  function check() {
    if (typeof Store === 'undefined' || !Store.realUser) return;
    const me = Store.realUser();
    if (!me || !me.id) return;
    const now = Date.now();
    const mine = Store.all('tasks').filter((t) => !t.done && t.userId === me.id && t.due);
    mine.forEach((t) => {
      const due = new Date(t.due).getTime();
      const k = t.id + '|' + t.due;
      if (t.priority === 'alta' && now >= due - LEAD && now < due && !notified[k + '|antes']) { mark(k + '|antes'); show(t, 'antes'); }
      if (now >= due && now - due < 2 * 3600000 && !notified[k + '|hora']) { mark(k + '|hora'); show(t, 'hora'); }
    });
    // Al entrar: un solo aviso con las tareas que ya estaban vencidas
    if (!summaryShown) {
      summaryShown = true;
      try { if (sessionStorage.getItem('crm_mq_late_shown')) return; sessionStorage.setItem('crm_mq_late_shown', '1'); } catch (e) {}
      const late = mine.filter((t) => now - new Date(t.due).getTime() >= 2 * 3600000);
      if (late.length) showSummary(late);
    }
  }

  function stack() {
    let s = document.getElementById('reminders');
    if (!s) { s = document.createElement('div'); s.id = 'reminders'; s.className = 'reminders'; s.setAttribute('aria-live', 'polite'); document.body.appendChild(s); }
    return s;
  }

  function card(html, cls = '') {
    const s = stack();
    while (s.children.length >= 4) s.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'reminder ' + cls;
    el.innerHTML = html;
    s.appendChild(el);
    el.querySelector('[data-r-close]').onclick = () => el.remove();
    return el;
  }

  function show(t, kind) {
    const c = t.clientId && Store.get('clients', t.clientId);
    const alta = t.priority === 'alta';
    const when = kind === 'antes' ? `En 15 minutos · ${U.time(t.due)}` : `Es la hora · ${U.time(t.due)}`;
    const el = card(`
      <div class="reminder-head">${icon('clock', 'sm')}<strong>${kind === 'antes' ? 'Tarea por empezar' : 'Tarea pendiente'}</strong>${alta ? '<span class="badge bad">Alta</span>' : ''}<button class="btn ghost xs icon" data-r-close title="Cerrar">${icon('x', 'sm')}</button></div>
      <div class="reminder-title">${U.esc(t.title)}</div>
      <div class="small muted">${when}${c ? ' · ' + U.esc(c.name) : ''}</div>
      <div class="row wrap" style="gap:6px;margin-top:8px">
        <button class="btn xs primary" data-r-done>${icon('check', 'sm')} Hecha</button>
        <button class="btn xs" data-r-snooze>Posponer 15 min</button>
        <button class="btn xs ghost" data-r-open>Ver</button>
      </div>`, alta ? 'alta' : '');
    el.querySelector('[data-r-done]').onclick = () => {
      Store.update('tasks', t.id, { done: true, doneAt: new Date().toISOString() });
      if (t.clientId) Store.logActivity({ clientId: t.clientId, type: 'sistema', text: 'Tarea completada: ' + t.title });
      el.remove(); UI.toast('Tarea completada', 'good');
    };
    el.querySelector('[data-r-snooze]').onclick = () => { Store.update('tasks', t.id, { due: new Date(Date.now() + 15 * 60000).toISOString() }); el.remove(); UI.toast('Te avisamos de nuevo en 15 minutos'); };
    el.querySelector('[data-r-open]').onclick = () => { el.remove(); location.hash = c ? '#/cliente/' + c.id : '#/agenda'; };
    beep();
    browserNotify(kind === 'antes' ? 'Tarea en 15 minutos' : 'Tarea pendiente', `${t.title}${c ? ' · ' + c.name : ''} (${U.time(t.due)})`);
  }

  function showSummary(late) {
    const el = card(`
      <div class="reminder-head">${icon('alert', 'sm')}<strong>Tareas vencidas</strong><button class="btn ghost xs icon" data-r-close title="Cerrar">${icon('x', 'sm')}</button></div>
      <div class="reminder-title">Tienes ${late.length} ${late.length === 1 ? 'tarea vencida' : 'tareas vencidas'} sin completar</div>
      <div class="row" style="margin-top:8px"><button class="btn xs primary" data-r-open>Ver en la agenda</button></div>`, 'alta');
    el.querySelector('[data-r-open]').onclick = () => { el.remove(); location.hash = '#/agenda'; };
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.start(); o.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  const canNotify = () => 'Notification' in window;
  const permission = () => (canNotify() ? Notification.permission : 'unsupported');
  function browserNotify(title, body) {
    try { if (canNotify() && Notification.permission === 'granted') new Notification(title, { body, icon: 'favicon.svg', tag: title + body }); } catch (e) {}
  }
  async function askPermission() {
    if (!canNotify()) { UI.toast('Este navegador no permite avisos', 'bad'); return 'unsupported'; }
    const r = await Notification.requestPermission();
    UI.toast(r === 'granted' ? 'Listo: recibirás avisos aunque estés en otra pestaña' : 'No se activaron los avisos del navegador', r === 'granted' ? 'good' : 'bad');
    return r;
  }

  return { start, check, permission, askPermission };
})();
