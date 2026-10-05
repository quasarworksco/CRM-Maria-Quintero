/* =========================================================
   Teléfono integrado (VoIP con Twilio)
   ---------------------------------------------------------
   Las agentes llaman desde la computadora con audífonos. Al
   colgar, el CRM guarda solo la duración, la agente, si
   contestaron o no y la hora; el resultado (Interesado, Cita,
   Venta…) lo elige la agente.

   Motores:
   - 'twilio': llamadas reales. Necesita las funciones de la
     carpeta /twilio publicadas en Twilio (ver twilio/LEEME.md).
   - 'demo':   simulación para enseñar y probar el flujo sin
     cuenta de Twilio (no hace llamadas de verdad).
   - 'off':    el botón Llamar abre el teléfono como antes.
   ========================================================= */
const Phone = (() => {
  const SDK_URL = 'https://unpkg.com/@twilio/voice-sdk@2/dist/twilio.min.js';
  const listeners = new Set();
  let backend = null;      // motor activo
  let endedHandler = null; // Modo llamadas registra el suyo mientras está abierto
  let pending = null;      // llamada contestada que aún no tiene resultado
  let timer = null;
  const state = { status: 'idle', clientId: null, number: '', direction: 'saliente', startedAt: 0, answeredAt: 0, muted: false, callSid: '', callerId: '', error: '' };

  /* ---------- Configuración ---------- */
  const settings = () => Store.settings();
  function mode() {
    const s = settings();
    if (s.phoneMode) return s.phoneMode;
    return Store.mode() === 'local' ? 'demo' : 'off';
  }
  const enabled = () => mode() === 'twilio' ? !!settings().phoneBaseUrl : mode() === 'demo';
  const baseUrl = () => String(settings().phoneBaseUrl || '').replace(/\/+$/, '');

  // Horario de llamadas: solo aplica a las agentes (la administración y la supervisión no tienen límite)
  const HOURS_DEFAULT = { start: '10:30', end: '19:30', tz: 'America/New_York' };
  function hours() { const s = settings(); return { start: s.phoneHoursStart || HOURS_DEFAULT.start, end: s.phoneHoursEnd || HOURS_DEFAULT.end, tz: s.phoneTz || HOURS_DEFAULT.tz }; }
  const restricted = (u = Store.realUser()) => !!u && u.role !== 'admin' && u.role !== 'supervisor' && settings().phoneEnforceHours !== false;
  function nowIn(tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour').value) % 24, m = Number(parts.find((p) => p.type === 'minute').value);
    return h * 60 + m;
  }
  const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const fmt12 = (hhmm) => { const d = new Date(); d.setHours(0, toMin(hhmm), 0, 0); return U.time(d); };
  function canCallNow() {
    if (!restricted()) return { ok: true };
    const h = hours(); const n = nowIn(h.tz);
    if (n >= toMin(h.start) && n < toMin(h.end)) return { ok: true };
    return { ok: false, msg: `Las llamadas están disponibles de ${fmt12(h.start)} a ${fmt12(h.end)} (hora de Miami).` };
  }
  const hoursLabel = () => { const h = hours(); return `${fmt12(h.start)} – ${fmt12(h.end)} (hora de Miami)`; };

  /* ---------- Números ---------- */
  // Formato internacional de EE. UU. / Puerto Rico: +1 y 10 dígitos
  function toE164(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length !== 10 || /^[01]/.test(d)) return null;
    return '+1' + d;
  }
  const isPR = (e164) => /^\+1(787|939)/.test(e164 || '');
  function findClientByPhone(raw) {
    const k = String(raw || '').replace(/\D/g, '').slice(-10);
    if (k.length < 7) return null;
    return Store.all('clients').find((c) => [c.phone, c.phone2].some((p) => String(p || '').replace(/\D/g, '').slice(-10) === k)) || null;
  }

  /* ---------- Eventos ---------- */
  const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); renderDock(); }
  const setEndedHandler = (fn) => { endedHandler = fn; };
  function set(patch) { Object.assign(state, patch); emit(); }
  const talkSec = () => (state.answeredAt ? Math.round(((state.endedAt || Date.now()) - state.answeredAt) / 1000) : 0);

  /* ---------- Llamar ---------- */
  async function call({ number, clientId }) {
    if (!enabled()) return false;
    if (state.status !== 'idle' && state.status !== 'ended') { UI.toast('Ya hay una llamada en curso', 'bad'); return true; }
    const chk = canCallNow();
    if (!chk.ok) { UI.toast(chk.msg, 'bad'); return true; }
    const c = clientId ? Store.get('clients', clientId) : findClientByPhone(number);
    const e164 = toE164(number || (c && c.phone));
    if (!e164) { UI.toast('El número no es válido para EE. UU. o Puerto Rico', 'bad'); return true; }
    if (c && c.dnc) { UI.toast('Este cliente pidió no volver a llamar', 'bad'); return true; }
    if (pending && pending.clientId && pending.clientId !== (c && c.id)) UI.toast('Tienes una llamada anterior sin resultado: regístralo cuando puedas');
    Object.assign(state, { status: 'connecting', clientId: c ? c.id : null, number: e164, direction: 'saliente', startedAt: Date.now(), answeredAt: 0, endedAt: 0, muted: false, callSid: '', callerId: '', error: '', ringAt: 0 });
    emit();
    Store.setCallActive(true);
    try {
      const b = await getBackend();
      await b.connect(e164, { clientId: state.clientId || '', agentId: Store.realUser().id });
    } catch (err) {
      console.error(err);
      finish({ status: 'failed', error: err && err.message ? err.message : 'No se pudo llamar' });
    }
    return true;
  }
  function hangup() { if (backend) backend.hangup(); }
  function mute() { if (!backend || state.status !== 'in-call') return; const v = !state.muted; backend.mute(v); set({ muted: v }); }
  function digits(d) { if (backend && state.status === 'in-call') backend.digits(d); }

  // Eventos que llegan del motor
  const events = {
    ringing: () => set({ status: 'ringing', ringAt: Date.now() }),
    accept: (sid) => { set({ status: 'in-call', answeredAt: Date.now(), callSid: sid || state.callSid }); tickStart(); },
    sid: (sid, callerId) => set({ callSid: sid, callerId: callerId || state.callerId }),
    disconnect: (info = {}) => finish(info),
    incoming: (info) => showIncoming(info)
  };

  function finish(info = {}) {
    if (state.status === 'ended' || state.status === 'idle') return;
    clearInterval(timer);
    state.endedAt = Date.now();
    const answered = info.answered !== undefined ? info.answered : !!state.answeredAt;
    const data = {
      clientId: state.clientId, number: state.number, direction: state.direction, answered,
      status: info.status || (answered ? 'completed' : 'no-answer'),
      talkSec: info.duration !== undefined ? info.duration : talkSec(),
      ringSec: Math.round(((state.answeredAt || state.endedAt) - (state.ringAt || state.startedAt)) / 1000),
      callSid: state.callSid, callerId: state.callerId, via: mode(), at: new Date(state.startedAt).toISOString()
    };
    set({ status: 'ended', error: info.error || '' });
    Store.setCallActive(false);
    if (info.error) { UI.toast('La llamada no se pudo completar: ' + info.error, 'bad'); setTimeout(reset, 2500); return; }
    // Detalle exacto desde Twilio (ocupado, no contestó, duración real); si tarda, se usa lo que vio el navegador
    if (mode() === 'twilio' && data.callSid && backend && backend.result && data.direction === 'saliente') {
      const wait = new Promise((r) => setTimeout(() => r(null), 3000));
      Promise.race([backend.result(data.callSid).catch(() => null), wait]).then((r) => { if (r) Object.assign(data, r); handleEnded(data); });
    } else handleEnded(data);
  }
  function reset() { if (state.status === 'ended') set({ status: 'idle', clientId: null, number: '', callSid: '' }); }

  // Qué pasa al colgar
  function handleEnded(data) {
    if (!data.clientId) saveRecent(data);
    if (endedHandler) { try { if (endedHandler(data) === true) return; } catch (e) { console.error(e); } }
    if (!data.answered && data.clientId && data.direction === 'saliente' && settings().phoneAutoLogNoAnswer !== false) {
      Store.logCall(data.clientId, { outcome: 'no_contesto', duration: 0, call: meta(data) });
      UI.toast('Registrado: No contestó', 'good');
      setTimeout(reset, 1500);
      return;
    }
    if (data.answered) {
      pending = data;
      renderDock();
      if (data.clientId && Views.cliente && Views.cliente.quickLog) setTimeout(() => Views.cliente.quickLog(data.clientId), 120);
    } else setTimeout(reset, 1500);
  }

  // Datos de la llamada que se guardan en el historial
  const meta = (d) => ({ via: d.via, answered: d.answered, callStatus: d.status, talkSec: d.talkSec, ringSec: d.ringSec, callSid: d.callSid || '', callerId: d.callerId || '', direction: d.direction, number: d.number });
  // Store.logCall lo usa para adjuntar la llamada recién terminada al resultado que elija la agente
  function takeCallMeta(clientId) {
    if (!pending || (pending.clientId && pending.clientId !== clientId)) return null;
    const m = meta(pending);
    removeRecent(pending.at); // ya queda en el historial del cliente
    pending = null;
    setTimeout(reset, 300);
    return m;
  }
  const hasPending = () => !!pending;
  const setPending = (d) => { pending = d; renderDock(); };

  function tickStart() { clearInterval(timer); timer = setInterval(() => { const t = document.getElementById('phTimer'); if (t) t.textContent = U.duration(talkSec()); }, 1000); }

  /* ---------- Motores ---------- */
  async function getBackend() {
    const m = mode();
    if (backend && backend.kind === m) return backend;
    if (backend && backend.destroy) backend.destroy();
    backend = m === 'twilio' ? await TwilioBackend() : DemoBackend();
    return backend;
  }

  // Simulación: suena 1–2 s, contestan o no (configurable para pruebas con window.__phoneDemo)
  function DemoBackend() {
    let t1, t2, live = false;
    return {
      kind: 'demo',
      async connect() {
        live = true;
        const cfg = window.__phoneDemo || {};
        const answer = cfg.answer !== undefined ? cfg.answer : Math.random() < 0.55;
        events.sid('CA-demo-' + Date.now().toString(36), '+14075550100');
        t1 = setTimeout(() => events.ringing(), cfg.ringMs || 900);
        t2 = setTimeout(() => { if (!live) return; if (answer) events.accept(); else { live = false; events.disconnect({ answered: false, status: 'no-answer' }); } }, (cfg.ringMs || 900) + (cfg.answerMs || 2500));
      },
      hangup() { clearTimeout(t1); clearTimeout(t2); if (!live) return; live = false; events.disconnect({ answered: !!state.answeredAt, status: state.answeredAt ? 'completed' : 'canceled' }); },
      mute() {}, digits() {}
    };
  }

  // Llamadas reales con Twilio Voice (SDK en el navegador + funciones en Twilio)
  async function TwilioBackend() {
    await loadSdk();
    const tok = await fetchToken();
    const device = new window.Twilio.Device(tok.token, { codecPreferences: ['opus', 'pcmu'], closeProtection: 'Hay una llamada en curso. ¿Seguro que quieres salir?', logLevel: 1 });
    device.on('tokenWillExpire', async () => { try { device.updateToken((await fetchToken()).token); } catch (e) { console.warn(e); } });
    device.on('error', (e) => { console.error(e); if (state.status === 'connecting' || state.status === 'ringing') finish({ error: twilioError(e) }); });
    device.on('incoming', (call) => events.incoming({ call, from: call.parameters.From }));
    try { await device.register(); } catch (e) { console.warn('No se pudo registrar para llamadas entrantes', e); }
    let cur = null;
    const wire = (call) => {
      cur = call;
      call.on('ringing', () => { events.ringing(); if (call.parameters && call.parameters.CallSid) events.sid(call.parameters.CallSid); });
      call.on('accept', () => events.accept(call.parameters && call.parameters.CallSid));
      call.on('disconnect', () => { cur = null; events.disconnect({}); });
      call.on('cancel', () => { cur = null; events.disconnect({ answered: false, status: 'canceled' }); });
      call.on('reject', () => { cur = null; events.disconnect({ answered: false, status: 'rejected' }); });
      call.on('error', (e) => { console.error(e); events.disconnect({ error: twilioError(e) }); });
    };
    return {
      kind: 'twilio', device, wire,
      callerIds: tok.callerIds || {},
      async connect(to, params) {
        const call = await device.connect({ params: Object.assign({ To: to }, params) });
        wire(call);
        events.sid('', isPR(to) ? (tok.callerIds || {}).pr : (tok.callerIds || {}).fl);
      },
      hangup() { if (cur) cur.disconnect(); else device.disconnectAll(); },
      mute(v) { if (cur) cur.mute(v); },
      digits(d) { if (cur) cur.sendDigits(d); },
      async result(sid) {
        const r = await post('/call-result', { sid });
        return r && r.status ? { status: r.status, answered: !!r.answered, talkSec: Number(r.duration) || 0 } : null;
      },
      destroy() { try { device.destroy(); } catch (e) {} }
    };
  }
  const twilioError = (e) => (e && (e.message || e.description)) || 'Error de conexión';
  function loadSdk() {
    if (window.Twilio && window.Twilio.Device) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = SDK_URL; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el teléfono (revisa tu internet)')); document.head.appendChild(s); });
  }
  // Las funciones de Twilio verifican quién eres con tu sesión de Firebase
  async function post(path, data) {
    const idToken = Store.auth() ? await Store.auth().idToken() : '';
    const body = new URLSearchParams(Object.assign({ idToken }, data || {}));
    const res = await fetch(baseUrl() + path, { method: 'POST', body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'El servidor de llamadas respondió ' + res.status);
    return j;
  }
  const fetchToken = () => post('/token');
  async function testConnection() {
    if (mode() === 'demo') return { ok: true, msg: 'Modo demostración: no hace llamadas reales.' };
    if (!baseUrl()) return { ok: false, msg: 'Falta la dirección de las funciones de Twilio.' };
    try { const t = await fetchToken(); return { ok: true, msg: `Conectado como ${t.identity}. Números: ${[t.callerIds && t.callerIds.fl, t.callerIds && t.callerIds.pr].filter(Boolean).join(' y ') || 'sin configurar'}.` }; }
    catch (e) { return { ok: false, msg: e.message }; }
  }

  /* ---------- Llamada entrante ---------- */
  function showIncoming({ call, from }) {
    if (state.status !== 'idle' && state.status !== 'ended') { try { call.reject(); } catch (e) {} return; }
    const c = findClientByPhone(from);
    const box = document.createElement('div');
    box.className = 'incoming';
    box.innerHTML = `<div class="row" style="gap:10px">${icon('phone')}<div class="grow"><strong>Llamada entrante</strong><div class="small">${c ? U.esc(c.name) + ' · ' : ''}${U.esc(from || 'Número oculto')}</div></div></div>
      <div class="row" style="gap:8px;margin-top:10px"><button class="btn good sm" data-in="ok">${icon('phone', 'sm')} Contestar</button><button class="btn danger sm" data-in="no">Rechazar</button></div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    call.on('cancel', close);
    box.querySelector('[data-in="ok"]').onclick = () => {
      close();
      Object.assign(state, { status: 'in-call', clientId: c ? c.id : null, number: from, direction: 'entrante', startedAt: Date.now(), answeredAt: Date.now(), endedAt: 0, muted: false, callSid: call.parameters.CallSid || '', ringAt: Date.now() });
      if (backend && backend.wire) backend.wire(call);
      call.accept();
      Store.setCallActive(true);
      tickStart(); emit();
    };
    box.querySelector('[data-in="no"]').onclick = () => { close(); call.reject(); };
  }

  /* ---------- Barra de llamada (abajo a la izquierda) ---------- */
  const STATUS = { connecting: 'Conectando…', ringing: 'Timbrando…', 'in-call': 'En llamada', ended: 'Llamada terminada' };
  function renderDock() {
    let dock = document.getElementById('phoneDock');
    const show = state.status !== 'idle' || pending;
    if (!show) { if (dock) dock.remove(); return; }
    if (!dock) { dock = document.createElement('div'); dock.id = 'phoneDock'; dock.className = 'phone-dock'; document.body.appendChild(dock); }
    if (pending && !pending.clientId) { const m = findClientByPhone(pending.number); if (m) pending.clientId = m.id; }
    const c = state.clientId ? Store.get('clients', state.clientId) : (pending && pending.clientId ? Store.get('clients', pending.clientId) : null);
    const live = state.status === 'connecting' || state.status === 'ringing' || state.status === 'in-call';
    const p = !live && pending;
    dock.className = 'phone-dock ' + (live ? 'live ' + state.status : p ? 'pending' : '');
    dock.innerHTML = `
      <div class="row" style="gap:10px;align-items:center">
        <span class="ph-ico">${icon('phone', 'sm')}</span>
        <div class="grow" style="min-width:0">
          <div class="ph-name">${c ? U.esc(c.name) : U.esc(state.number || (pending && pending.number) || '')}</div>
          <div class="small ph-sub">${p ? `Terminó · ${U.duration(pending.talkSec)} · falta el resultado` : `${STATUS[state.status] || ''}${state.direction === 'entrante' ? ' (entrante)' : ''}${state.callerId && live ? ' · desde ' + U.esc(state.callerId) : ''}`}</div>
        </div>
        ${state.status === 'in-call' ? `<span class="ph-timer num" id="phTimer">${U.duration(talkSec())}</span>` : ''}
      </div>
      ${live ? `<div class="row" style="gap:6px;margin-top:10px">
        ${state.status === 'in-call' ? `<button class="btn sm ${state.muted ? 'primary' : ''}" data-ph="mute">${state.muted ? 'Activar micrófono' : 'Silenciar'}</button><button class="btn sm" data-ph="keys">Teclado</button>` : ''}
        <button class="btn sm danger solid" data-ph="hang" style="margin-left:auto">Colgar</button>
      </div>
      <div class="ph-keys hidden" id="phKeys">${'123456789*0#'.split('').map((k) => `<button class="btn sm" data-key="${k}">${k}</button>`).join('')}</div>` : ''}
      ${p ? `<div class="row wrap" style="gap:6px;margin-top:10px">${pending.clientId ? '<button class="btn sm primary" data-ph="log">Registrar resultado</button>' : Store.can('prospects') ? '<button class="btn sm primary" data-ph="newc">Guardar como prospecto</button>' : ''}<button class="btn sm ghost" data-ph="dismiss">Descartar</button></div>` : ''}`;
    const q = (s) => dock.querySelector(s);
    if (q('[data-ph="hang"]')) q('[data-ph="hang"]').onclick = hangup;
    if (q('[data-ph="mute"]')) q('[data-ph="mute"]').onclick = mute;
    if (q('[data-ph="keys"]')) q('[data-ph="keys"]').onclick = () => q('#phKeys').classList.toggle('hidden');
    dock.querySelectorAll('[data-key]').forEach((b) => b.onclick = () => digits(b.dataset.key));
    if (q('[data-ph="log"]')) q('[data-ph="log"]').onclick = () => Views.cliente.quickLog(pending.clientId);
    if (q('[data-ph="newc"]')) q('[data-ph="newc"]').onclick = () => newProspectFromPending();
    if (q('[data-ph="dismiss"]')) q('[data-ph="dismiss"]').onclick = () => { pending = null; reset(); renderDock(); };
  }

  /* ---------- Marcador libre: llamar a cualquier número ---------- */
  const RECENT_KEY = 'crm_mq_recent_calls';
  function readRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function saveRecent(d) {
    if (d.direction !== 'saliente') return;
    const list = readRecent().filter((x) => x.at !== d.at);
    list.unshift({ number: d.number, at: d.at, answered: !!d.answered, talkSec: d.talkSec || 0 });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 15))); } catch (e) {}
  }
  function removeRecent(at) { const list = readRecent(); const next = list.filter((x) => x.at !== at); if (next.length !== list.length) try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch (e) {} }
  // Quién puede usarlo: administración y supervisión siempre; las agentes solo si la administración lo activa
  function canDial(u = Store.realUser()) {
    if (!enabled() || !u) return false;
    if (u.role === 'admin' || u.role === 'supervisor') return true;
    return settings().phoneDialerAgents === true && Store.can('prospects');
  }
  // Últimas llamadas: las del historial de clientes y las hechas a números sueltos
  function recentCalls() {
    const me = Store.realUser();
    const fromClients = Store.all('activities').filter((a) => a.call && a.userId === me.id && a.call.direction !== 'entrante')
      .map((a) => ({ number: a.call.number, at: a.createdAt, answered: a.call.answered, talkSec: a.call.talkSec || 0, clientId: a.clientId }));
    return fromClients.concat(readRecent()).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
  }
  function pretty(e164) { const d = String(e164 || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(e164 || ''); }

  function openDialer(preset = '') {
    if (!canDial()) { UI.toast(enabled() ? 'Tu usuario no tiene el marcador activado' : 'Activa el teléfono en Panel admin → Conexiones', 'bad'); return; }
    const hrs = restricted() ? `<div class="small muted" style="text-align:center;margin-top:6px">Horario de llamadas: ${U.esc(hoursLabel())}</div>` : '';
    const m = UI.modal({
      title: `${icon('phone', 'sm')} Teléfono`,
      size: 'sm',
      hideFooter: true,
      body: `
        <div class="dialer">
          <div class="dial-display"><input id="dlNum" inputmode="tel" autocomplete="off" placeholder="Escribe o pega un número" value="${U.esc(preset)}"><button type="button" class="btn ghost icon sm" id="dlDel" title="Borrar">${icon('x', 'sm')}</button></div>
          <div class="dial-match small" id="dlMatch"></div>
          <div class="dial-pad">${[['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']].map(([k, l]) => `<button type="button" class="dial-key" data-k="${k}"><b>${k}</b><small>${l}</small></button>`).join('')}</div>
          <button type="button" class="btn primary dial-call" id="dlCall">${icon('phone', 'sm')} Llamar</button>
          ${hrs}
          <div class="dial-recent">
            <div class="small muted" style="margin:14px 0 6px;font-weight:600">Llamadas recientes</div>
            <div id="dlRecent"></div>
          </div>
        </div>`
    });
    const root = m.el.querySelector('.dialer');
    const inp = root.querySelector('#dlNum');
    const match = root.querySelector('#dlMatch');
    const update = () => {
      const v = inp.value;
      const e = toE164(v);
      const c = findClientByPhone(v);
      match.innerHTML = c ? `${icon('user', 'sm')} <a href="#/cliente/${c.id}" data-dl-close>${U.esc(c.name)}</a>${c.dnc ? ' · <span style="color:var(--bad)">no volver a llamar</span>' : ''}`
        : e ? `${isPR(e) ? 'Puerto Rico' : 'EE. UU.'} · ${pretty(e)} · no está en tus clientes` : (v.replace(/\D/g, '').length >= 10 ? '<span style="color:var(--bad)">Número no válido para EE. UU. o Puerto Rico</span>' : '');
      root.querySelectorAll('[data-dl-close]').forEach((a) => a.onclick = () => close());
    };
    const close = m.close;
    const doCall = async () => {
      const c = findClientByPhone(inp.value);
      if (!toE164(inp.value)) { UI.toast('Escribe un número de 10 dígitos de EE. UU. o Puerto Rico', 'bad'); inp.focus(); return; }
      close();
      await call({ number: inp.value, clientId: c ? c.id : null });
    };
    root.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { inp.value += b.dataset.k; update(); inp.focus(); });
    root.querySelector('#dlDel').onclick = () => { inp.value = inp.value.slice(0, -1); update(); inp.focus(); };
    root.querySelector('#dlCall').onclick = doCall;
    inp.addEventListener('input', update);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doCall(); } });
    const rec = recentCalls();
    root.querySelector('#dlRecent').innerHTML = rec.length ? rec.map((r) => {
      const c = r.clientId ? Store.get('clients', r.clientId) : findClientByPhone(r.number);
      return `<button type="button" class="dial-rec" data-num="${U.esc(r.number)}">
        <span class="grow" style="min-width:0;text-align:left"><strong>${U.esc(c ? c.name : pretty(r.number))}</strong><span class="small muted" style="display:block">${c ? pretty(r.number) + ' · ' : ''}${U.esc(U.dateTime(r.at))}</span></span>
        <span class="small" style="color:${r.answered ? 'var(--good)' : 'var(--muted)'}">${r.answered ? U.duration(r.talkSec) : 'No contestó'}</span></button>`;
    }).join('') : '<div class="small muted">Aún no hay llamadas.</div>';
    root.querySelectorAll('[data-num]').forEach((b) => b.onclick = () => { inp.value = pretty(b.dataset.num); update(); inp.focus(); });
    update();
    setTimeout(() => inp.focus(), 50);
    return m;
  }

  // Una llamada a un número suelto que resultó ser un prospecto: se crea y se registra el resultado
  function newProspectFromPending() {
    if (!pending) return;
    const num = pending.number;
    Views.clientes.openForm(null, { phone: pretty(num), source: '' });
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const c = findClientByPhone(num);
      if (c && pending && !pending.clientId) {
        clearInterval(iv);
        pending.clientId = c.id;
        renderDock();
        setTimeout(() => Views.cliente.quickLog(c.id), 400);
      } else if (!pending || tries > 240) clearInterval(iv);
    }, 500);
  }

  /* ---------- Clic en cualquier botón "Llamar" del CRM ---------- */
  function init() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="tel:"]');
      if (!a || !enabled()) return;
      e.preventDefault(); e.stopPropagation();
      const number = decodeURIComponent(a.getAttribute('href').slice(4));
      call({ number, clientId: a.dataset.clientId || null });
    }, true);
    // En línea: prepara el teléfono al entrar para poder recibir llamadas
    if (mode() === 'twilio' && enabled() && Store.auth()) setTimeout(() => getBackend().catch((e) => console.warn('Teléfono:', e.message)), 2500);
  }

  return { init, mode, enabled, canDial, openDialer, call, hangup, mute, digits, on, setEndedHandler, state, takeCallMeta, hasPending, setPending, canCallNow, hoursLabel, restricted, toE164, isPR, findClientByPhone, testConnection, reset };
})();
