/* =========================================================
   Productividad del equipo (solo administración)
   ---------------------------------------------------------
   Se calcula con las llamadas que ya están cargadas en el CRM:
   no hace lecturas extra a la base. El tiempo conectado sale de
   la "presencia" (minutos con el CRM abierto y en uso): una
   lectura por persona al abrir el día.
   ========================================================= */
const Productivity = (() => {
  const GAP_MIN = 20; // una pausa de más de 20 min entre llamadas corta la sesión de trabajo
  const CALL_TYPES = ['llamada', 'whatsapp'];
  const GROUPS = [
    { id: 'interesado', name: 'Interesado', color: '#16a34a', test: (o) => o && o.id === 'contactado' },
    { id: 'seguimiento', name: 'Llamar después', color: '#22c55e', test: (o) => o && o.id === 'llamar_despues' },
    { id: 'cita', name: 'Cita', color: '#9333ea', test: (o) => o && o.appointment },
    { id: 'venta', name: 'Venta', color: '#b8860b', test: (o) => o && o.sale },
    { id: 'no_contesto', name: 'No contestó', color: '#2563eb', test: (o) => o && ['no_contesto', 'buzon', 'whatsapp', 'email'].includes(o.id) },
    { id: 'perdido', name: 'Descartado', color: '#dc2626', test: (o) => o && !!o.lose }
  ];
  const groupOf = (outcome) => { const o = outcomeById(outcome); return GROUPS.find((g) => g.test(o)) || null; };

  function targets() {
    const s = Store.settings();
    return { cph: Number(s.prodCallsPerHour) || 20, contact: (Number(s.prodContactRate) || 30) / 100, aph: Number(s.prodApptsPerHour) || 1 };
  }

  // Calificación: 40 % ritmo de llamadas, 30 % tasa de contacto, 30 % citas por hora (cada parte hasta 125 %)
  function score({ calls, contacts, appts, minutes }) {
    if (!calls) return null;
    const h = Math.max(minutes, 1) / 60;
    const t = targets();
    const r = { cph: calls / h, contactRate: contacts / calls, aph: appts / h };
    const cap = (x) => Math.min(1.25, x);
    const value = 0.4 * cap(r.cph / t.cph) + 0.3 * cap(r.contactRate / t.contact) + 0.3 * cap(r.aph / t.aph);
    return Object.assign(r, { value, level: level(value) });
  }
  function level(v) {
    if (v == null) return { id: 'none', name: 'Sin actividad', cls: '' };
    if (v >= 1) return { id: 'excelente', name: 'Excelente', cls: 'good' };
    if (v >= 0.8) return { id: 'buena', name: 'Buena', cls: 'info' };
    if (v >= 0.6) return { id: 'regular', name: 'Regular', cls: 'warn' };
    return { id: 'baja', name: 'Baja', cls: 'bad' };
  }

  // Sesiones de trabajo a partir de las llamadas (respaldo si no hay presencia)
  function workMinutes(times) {
    if (!times.length) return 0;
    let total = 0, start = times[0], prev = times[0];
    for (let i = 1; i <= times.length; i++) {
      const t = times[i];
      if (t === undefined || t - prev > GAP_MIN * 60000) { total += (prev - start) / 60000 + 3; start = t; }
      prev = t;
    }
    return Math.round(total);
  }

  // Resumen de una persona en un día. presence: { minutes: [minuto del día…] } o null
  function forUser(userId, day, presence) {
    const from = U.startOfDay(day).getTime(), to = U.endOfDay(day).getTime();
    const acts = Store.all('activities').filter((a) => a.userId === userId && (t => t >= from && t <= to)(new Date(a.createdAt).getTime()));
    const calls = U.sortBy(acts.filter((a) => CALL_TYPES.includes(a.type) && a.outcome), (a) => a.createdAt);
    const by = {};
    GROUPS.forEach((g) => { by[g.id] = 0; });
    calls.forEach((a) => { const g = groupOf(a.outcome); if (g) by[g.id]++; });
    const contacts = calls.filter((a) => { const o = outcomeById(a.outcome); return o && o.contact; }).length;
    const appts = Math.max(by.cita, acts.filter((a) => a.type === 'cita' && a.kind === 'agendada').length);
    const times = calls.map((a) => new Date(a.createdAt).getTime());
    const presMin = presence && presence.minutes ? presence.minutes.length : 0;
    const callMin = workMinutes(times);
    const minutes = presMin || callMin;
    const talk = U.sum(calls, (a) => (outcomeById(a.outcome) || {}).contact ? a.duration || 0 : 0);
    const first = presMin ? Math.min(...presence.minutes) : null;
    const last = presMin ? Math.max(...presence.minutes) : null;
    const now = Date.now();
    const tasks = Store.all('tasks').filter((t) => t.userId === userId);
    const overdueTasks = tasks.filter((t) => !t.done && new Date(t.due).getTime() < now).length;
    const lateDone = tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt) > new Date(t.due) && new Date(t.doneAt).getTime() >= from && new Date(t.doneAt).getTime() <= to).length;
    const dayOrders = Store.all('orders').filter((o) => o.userId === userId && o.status !== 'cancelada' && (t => t >= from && t <= to)(new Date(o.createdAt).getTime()));
    const sales = new Set(dayOrders.map((o) => o.clientId).concat(calls.filter((a) => (outcomeById(a.outcome) || {}).sale).map((a) => a.clientId))).size;
    const commission = U.sum(dayOrders, Store.orderCommission);
    const res = { userId, calls, n: calls.length, contacts, appts, sales, commission, by, talk, minutes, presMin, callMin, firstCall: times[0] || null, lastCall: times[times.length - 1] || null, first, last, overdueTasks, lateDone };
    // Con muy poco tiempo registrado el ritmo se dispara: se califica sobre al menos 30 minutos
    res.score = score({ calls: res.n, contacts, appts, minutes: Math.max(minutes, 30) });
    res.level = res.score ? res.score.level : level(null);
    res.hours = byHour(calls, acts, presence);
    return res;
  }

  // Desglose por hora: ¿cuáles horas fueron productivas?
  function byHour(calls, acts, presence) {
    const rows = {};
    const row = (h) => rows[h] || (rows[h] = { hour: h, calls: 0, contacts: 0, appts: 0, minutes: 0 });
    calls.forEach((a) => { const r = row(new Date(a.createdAt).getHours()); r.calls++; const o = outcomeById(a.outcome); if (o && o.contact) r.contacts++; if (o && o.appointment) r.appts++; });
    if (presence && presence.minutes) presence.minutes.forEach((m) => { row(Math.floor(m / 60)).minutes++; });
    return Object.values(rows).sort((a, b) => a.hour - b.hour).map((r) => {
      const mins = r.minutes || (r.calls ? 60 : 0);
      const sc = score({ calls: r.calls, contacts: r.contacts, appts: r.appts, minutes: Math.max(mins, 15) });
      return Object.assign(r, { score: sc, level: sc ? sc.level : level(null) });
    });
  }

  const hm = (min) => { min = Math.round(min || 0); const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`; };
  const clock = (minOfDay) => { const d = new Date(); d.setHours(0, minOfDay, 0, 0); return U.time(d); };

  // Frase con el resultado del día
  function verdict(r, name) {
    if (!r.n) return `${name} no registró llamadas este día.`;
    const t = targets();
    const s = r.score;
    return `${name}: ${hm(r.minutes)} ${r.presMin ? 'conectado' : 'de trabajo (según sus llamadas)'} · ${r.n} llamadas (${s.cph.toFixed(1)} por hora; meta ${t.cph}) · habló con ${r.contacts} (${U.pct(s.contactRate)}; meta ${Math.round(t.contact * 100)}%) · ${r.appts} ${r.appts === 1 ? 'cita' : 'citas'} (${s.aph.toFixed(1)} por hora; meta ${t.aph})${r.sales ? ` · ${r.sales} ${r.sales === 1 ? 'venta' : 'ventas'}` : ''}. Productividad: ${r.level.name.toLowerCase()}.`;
  }

  // Embudo de conversión: clientes llamados → interesados → citas → ventas (clientes únicos)
  function funnel(userId, from, to) {
    const f = from.getTime(), t = to.getTime();
    const inR = (d) => { const x = new Date(d).getTime(); return x >= f && x <= t; };
    const acts = Store.all('activities').filter((a) => a.userId === userId && inR(a.createdAt));
    const calls = acts.filter((a) => CALL_TYPES.includes(a.type) && a.outcome);
    const uniq = (list) => new Set(list.map((a) => a.clientId)).size;
    const called = uniq(calls);
    const interested = uniq(calls.filter((a) => (outcomeById(a.outcome) || {}).interested));
    const appts = new Set(calls.filter((a) => (outcomeById(a.outcome) || {}).appointment).map((a) => a.clientId).concat(acts.filter((a) => a.type === 'cita' && a.kind === 'agendada').map((a) => a.clientId))).size;
    const orders = Store.all('orders').filter((o) => o.userId === userId && o.status !== 'cancelada' && inR(o.createdAt));
    const sales = new Set(orders.map((o) => o.clientId).concat(calls.filter((a) => (outcomeById(a.outcome) || {}).sale).map((a) => a.clientId))).size;
    return { calls: calls.length, called, interested, appts, sales, orders: orders.length, commission: U.sum(orders, Store.orderCommission), amount: U.sum(orders, (o) => o.total || 0) };
  }

  return { GROUPS, groupOf, forUser, funnel, score, level, targets, hm, clock, verdict };
})();

Views.productividad = (() => {
  const state = { day: U.toDateInput(new Date()), range: 'mes' };
  const presCache = {}; // fecha → { at, list } para no repetir lecturas

  function loadPresence(date, force) {
    const c = presCache[date];
    if (!force && c && (c.list || c.loading) && Date.now() - c.at < 5 * 60000) return;
    presCache[date] = { at: Date.now(), loading: true, list: c && c.list };
    Store.getPresence(date).then((list) => { presCache[date] = { at: Date.now(), list: list || [], failed: list === null }; App.refresh(); });
  }

  function render(el) {
    const day = new Date(state.day + 'T12:00');
    const isToday = state.day === U.toDateInput(new Date());
    loadPresence(state.day);
    const pc = presCache[state.day] || {};
    const pres = {};
    (pc.list || []).forEach((p) => { pres[p.userId] = p; });
    const people = Store.activeUsers().filter((u) => Store.permsOf(u).prospects || u.role === 'admin');
    const rows = U.sortBy(people.map((u) => ({ u, r: Productivity.forUser(u.id, day, pres[u.id]) }))
      .filter((x) => x.r.n || x.r.presMin || (x.u.role !== 'admin')), (x) => -((x.r.score && x.r.score.value) || 0) * 1000 - x.r.n);
    const team = rows.reduce((t, { r }) => ({ n: t.n + r.n, contacts: t.contacts + r.contacts, appts: t.appts + r.appts, minutes: t.minutes + r.minutes, overdue: t.overdue + r.overdueTasks }), { n: 0, contacts: 0, appts: 0, minutes: 0, overdue: 0 });
    const active = rows.filter((x) => x.r.n);
    const teamScore = Productivity.score({ calls: team.n, contacts: team.contacts, appts: team.appts, minutes: team.minutes });
    const best = active.length ? active.reduce((a, b) => ((b.r.score.value > a.r.score.value) ? b : a)) : null;
    const t = Productivity.targets();

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Productividad del equipo</h1><p>Llamadas, contactos y citas de cada agente por día · solo lo ve la administración</p></div>
        <div class="page-actions">
          <button class="btn icon" id="prevDay" title="Día anterior">${icon('arrowLeft', 'sm')}</button>
          <input type="date" id="dayPick" value="${state.day}" max="${U.toDateInput(new Date())}" style="width:auto">
          <button class="btn icon" id="nextDay" title="Día siguiente" ${isToday ? 'disabled' : ''}>${icon('arrowRight', 'sm')}</button>
          ${isToday ? '' : '<button class="btn" id="today">Hoy</button>'}
          <button class="btn" id="refresh" title="Actualizar el tiempo conectado">${icon('refresh', 'sm')}</button>
          ${Store.can('exportData') ? `<button class="btn" id="export">${icon('download', 'sm')} Exportar</button>` : ''}
        </div>
      </div>

      <div class="kpis">
        <div class="card kpi"><div class="kpi-icon">${icon('phone')}</div><div class="kpi-label">Llamadas</div><div class="kpi-value">${U.num(team.n)}</div><div class="kpi-sub">${active.length} ${active.length === 1 ? 'persona llamó' : 'personas llamaron'}</div></div>
        <div class="card kpi"><div class="kpi-icon">${icon('thumbUp')}</div><div class="kpi-label">Contestaron</div><div class="kpi-value">${U.num(team.contacts)}</div><div class="kpi-sub">${U.pct(team.n ? team.contacts / team.n : 0)} de las llamadas</div></div>
        <div class="card kpi"><div class="kpi-icon">${icon('calendar')}</div><div class="kpi-label">Citas</div><div class="kpi-value">${U.num(team.appts)}</div><div class="kpi-sub">${team.minutes ? (team.appts / (team.minutes / 60)).toFixed(1) : '0'} por hora de trabajo</div></div>
        <div class="card kpi"><div class="kpi-icon">${icon('clock')}</div><div class="kpi-label">Tiempo conectado</div><div class="kpi-value" style="font-size:24px">${Productivity.hm(team.minutes)}</div><div class="kpi-sub">Suma del equipo</div></div>
        <div class="card kpi"><div class="kpi-icon">${icon('target')}</div><div class="kpi-label">Resultado del día</div><div class="kpi-value" style="font-size:24px">${teamScore ? teamScore.level.name : '—'}</div><div class="kpi-sub">${teamScore ? `${teamScore.cph.toFixed(1)} llamadas por hora · equipo` : 'Sin llamadas registradas'}</div></div>
      </div>

      ${pc.failed || Store.presenceStatus().readDenied ? `<div class="archived-note" style="margin-bottom:14px">${icon('alert', 'sm')}<div><strong>No se pudo leer el tiempo conectado.</strong><div class="small">Publica las reglas nuevas de Firestore (colección <code>presence</code>). Mientras tanto, el tiempo se calcula con la hora de las llamadas.</div></div></div>` : ''}

      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h2>${icon('users', 'sm')} Por agente · ${U.date(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span class="muted small">Haz clic en el número de llamadas para ver el detalle</span></div>
        <div class="table-wrap"><table class="table compact">
          <thead><tr><th>Agente</th><th>Conectado</th><th class="right">Llamadas</th><th class="right">Contestó</th><th class="right">No contestó</th><th class="right">Citas</th><th class="right">Ventas</th><th class="right">Llamar después</th><th>Ritmo por hora</th><th class="right" title="Tareas vencidas sin completar">Tareas venc.</th><th style="min-width:110px">Productividad</th></tr></thead>
          <tbody>${rows.length ? rows.map(({ u, r }) => `<tr class="clickable" data-user="${u.id}">
            <td><div class="row nowrap">${UI.avatar(u)}<div class="cell-main">${U.esc(u.name)}</div></div></td>
            <td class="small nowrap">${r.minutes ? `<strong>${Productivity.hm(r.minutes)}</strong><div class="cell-sub">${r.presMin ? `${Productivity.clock(r.first)} – ${Productivity.clock(r.last + 1)}` : `${U.time(r.firstCall)} – ${U.time(r.lastCall)} · según llamadas`}</div>` : '<span class="muted">—</span>'}</td>
            <td class="right"><button class="btn sm" data-calls="${u.id}" ${r.n ? '' : 'disabled'}><strong>${r.n}</strong></button></td>
            <td class="right num">${r.contacts}</td>
            <td class="right num">${r.by.no_contesto}</td>
            <td class="right num"><strong>${r.appts}</strong></td>
            <td class="right num" style="color:${r.sales ? '#b8860b' : 'inherit'}"><strong>${r.sales}</strong>${r.commission ? `<div class="cell-sub">${U.money(r.commission)} com.</div>` : ''}</td>
            <td class="right num">${r.by.seguimiento}</td>
            <td class="small nowrap">${r.score ? `<strong>${r.score.cph.toFixed(1)}</strong> llamadas<div class="cell-sub">${U.pct(r.score.contactRate)} contacto · ${r.score.aph.toFixed(1)} citas</div>` : '<span class="muted">—</span>'}</td>
            <td class="right num" style="color:${r.overdueTasks ? 'var(--bad)' : 'inherit'}">${r.overdueTasks}${r.lateDone ? `<div class="cell-sub">${r.lateDone} hechas tarde</div>` : ''}</td>
            <td>${levelCell(r)}</td>
          </tr>`).join('') : `<tr><td colspan="11">${UI.empty('No hay agentes activos.', 'users')}</td></tr>`}</tbody>
        </table></div>
      </div>

      ${funnelCard(people)}

      <div class="grid span-2-1">
        <div class="card">
          <div class="card-head"><h2>${icon('flag', 'sm')} Resultado del día</h2>${best && best.r.n ? `<span class="badge good">Mejor: ${U.esc(best.u.name.split(' ')[0])}</span>` : ''}</div>
          <div class="card-body stack" style="gap:10px">
            ${active.length ? U.sortBy(active, (x) => -x.r.score.value).map(({ u, r }) => `<div class="row" style="align-items:flex-start;gap:10px">${UI.avatar(u)}<div class="small" style="line-height:1.5">${U.esc(Productivity.verdict(r, u.name))}</div></div>`).join('') : UI.empty(isToday ? 'Todavía no hay llamadas registradas hoy.' : 'No hubo llamadas este día.', 'phone')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('info', 'sm')} Cómo se mide</h2></div>
          <div class="card-body small stack" style="gap:8px">
            <div><strong>Conectado</strong>: minutos con el CRM abierto y en uso (o con el cronómetro de una llamada corriendo). Si no hay ese dato, se calcula desde la primera hasta la última llamada, sin contar pausas de más de 20 minutos.</div>
            <div><strong>Productividad</strong> compara con las metas por hora: <strong>${t.cph}</strong> llamadas, <strong>${Math.round(t.contact * 100)}%</strong> de contacto y <strong>${t.aph}</strong> ${t.aph === 1 ? 'cita' : 'citas'}. Pesan 40%, 30% y 30% (cada parte cuenta hasta 125% si supera la meta). Excelente: 100% o más · Buena: 80% · Regular: 60% · Baja: menos de 60%.</div>
            <div class="muted">Cambia las metas en Panel de administración → Configuración.</div>
          </div>
        </div>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const setDay = (d) => { state.day = d; render(el); };
    $('#dayPick').onchange = (e) => e.target.value && setDay(e.target.value);
    $('#prevDay').onclick = () => setDay(U.toDateInput(U.addDays(day, -1)));
    $('#nextDay').onclick = () => setDay(U.toDateInput(U.addDays(day, 1)));
    if ($('#today')) $('#today').onclick = () => setDay(U.toDateInput(new Date()));
    $('#refresh').onclick = () => { Store.flushPresence(); setTimeout(() => loadPresence(state.day, true), 400); UI.toast('Actualizando…'); };
    if ($('#export')) $('#export').onclick = () => exportDay(rows, day);
    el.querySelectorAll('[data-fr]').forEach((b) => b.onclick = () => { state.range = b.dataset.fr; render(el); });
    el.querySelectorAll('[data-calls]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); openDetail(b.dataset.calls, day, pres[b.dataset.calls]); });
    el.querySelectorAll('tr[data-user]').forEach((tr) => tr.onclick = () => openDetail(tr.dataset.user, day, pres[tr.dataset.user]));
  }

  /* ---------- Embudo de conversión por agente ---------- */
  function funnelCard(people) {
    const R = Metrics.RANGES[state.range] || Metrics.RANGES.mes;
    const [from, to] = R.get();
    const rows = U.sortBy(people.map((u) => ({ u, f: Productivity.funnel(u.id, from, to) })).filter((x) => x.f.calls || x.f.sales), (x) => -(x.f.sales * 1000 + x.f.appts * 10 + x.f.interested));
    const team = rows.reduce((t, { f }) => ({ calls: t.calls + f.calls, called: t.called + f.called, interested: t.interested + f.interested, appts: t.appts + f.appts, sales: t.sales + f.sales, commission: t.commission + f.commission }), { calls: 0, called: 0, interested: 0, appts: 0, sales: 0, commission: 0 });
    const pct = (a, b) => (b ? U.pct(a / b) : '—');
    const bars = (f) => { const max = Math.max(f.called, 1); return `<div class="funnel-mini">${[['called', '#2563eb'], ['interested', '#16a34a'], ['appts', '#9333ea'], ['sales', '#b8860b']].map(([k, c]) => `<span style="width:${Math.max(f[k] ? 4 : 0, (f[k] / max) * 100)}%;background:${c}" title="${f[k]}"></span>`).join('')}</div>`; };
    const row = (name, f, avatar) => `<tr>
      <td><div class="row nowrap">${avatar}<div class="cell-main">${name}</div></div></td>
      <td class="right num"><strong>${f.calls}</strong><div class="cell-sub">${f.called} clientes</div></td>
      <td class="right num"><strong>${f.interested}</strong><div class="cell-sub">${pct(f.interested, f.called)}</div></td>
      <td class="right num"><strong>${f.appts}</strong><div class="cell-sub">${pct(f.appts, f.interested)} de interesados</div></td>
      <td class="right num" style="color:#b8860b"><strong>${f.sales}</strong><div class="cell-sub">${pct(f.sales, f.interested)} de interesados</div></td>
      <td class="right num"><strong>${pct(f.sales, f.called)}</strong></td>
      <td class="right num" style="color:#b8860b">${f.commission ? U.money(f.commission) : '—'}</td>
      <td style="min-width:130px">${bars(f)}</td></tr>`;
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><h2>${icon('chart', 'sm')} Embudo de conversión: llamadas → interesados → citas → ventas</h2>
        <div class="seg" id="fRange">${Object.entries(Metrics.RANGES).map(([k, r]) => `<button data-fr="${k}" class="${k === state.range ? 'active' : ''}">${r.label}</button>`).join('')}</div></div>
      <div class="table-wrap"><table class="table compact">
        <thead><tr><th>Agente</th><th class="right">Llamadas</th><th class="right">Interesados</th><th class="right">Citas agendadas</th><th class="right">Ventas</th><th class="right">Conversión total</th><th class="right">Comisión</th><th>Embudo</th></tr></thead>
        <tbody>${rows.length ? rows.map(({ u, f }) => row(U.esc(u.name), f, UI.avatar(u))).join('') + (rows.length > 1 ? row('<strong>Todo el equipo</strong>', team, `<span class="avatar" style="background:var(--primary)">${icon('users', 'sm')}</span>`) : '') : `<tr><td colspan="8">${UI.empty('Sin llamadas en este periodo.', 'phone')}</td></tr>`}</tbody>
      </table></div>
      <div class="card-body small muted" style="padding-top:10px">Se cuentan clientes distintos: <strong>interesados</strong> = clientes con resultado Interesado, Cita agendada o Venta; <strong>conversión total</strong> = ventas ÷ clientes llamados. La comisión se calcula sola según el producto vendido.</div>
    </div>`;
  }

  function levelCell(r) {
    if (!r.score) return `<span class="badge">${r.level.name}</span>`;
    const pct = Math.round(Math.min(1.25, r.score.value) * 100);
    return `<span class="badge ${r.level.cls}" title="${pct}% de la meta">${r.level.name} · ${pct}%</span>
      <div class="progress ${r.level.id === 'excelente' ? 'good' : ''}" style="margin-top:5px"><span style="width:${Math.min(100, pct)}%"></span></div>`;
  }

  /* ---------- Detalle de un agente: cada llamada con hora, cliente y resultado ---------- */
  function openDetail(userId, day, presence) {
    const u = Store.get('users', userId);
    const r = Productivity.forUser(userId, day, presence);
    let filter = '';
    const listHtml = () => {
      const calls = r.calls.filter((a) => !filter || (Productivity.groupOf(a.outcome) || {}).id === filter).slice().reverse();
      return calls.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Hora</th><th>Cliente</th><th>Medio</th><th>Resultado</th><th class="right">Duración</th><th>Comentario</th></tr></thead>
        <tbody>${calls.map((a) => { const c = Store.get('clients', a.clientId); return `<tr>
          <td class="nowrap num"><strong>${U.time(a.createdAt)}</strong></td>
          <td>${c ? `<a href="#/cliente/${c.id}" data-close-link>${U.esc(c.name)}</a><div class="cell-sub">${U.esc(c.phone || '')}</div>` : '<span class="muted">(cliente no visible)</span>'}</td>
          <td class="small">${(ACTIVITY_TYPES[a.type] || {}).name || a.type}</td>
          <td>${UI.outcomeBadge(a.outcome)}</td>
          <td class="right num small">${a.duration ? U.duration(a.duration) : '—'}</td>
          <td class="small" style="max-width:260px">${a.text ? U.esc(a.text) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : UI.empty('Sin llamadas con este resultado.', 'phone');
    };
    const m = UI.modal({
      title: `${UI.avatar(u)} ${U.esc(u.name)} · ${U.date(day, { weekday: 'long', day: 'numeric', month: 'long' })}`,
      size: 'lg',
      hideFooter: true,
      body: `
        <div class="script-box">${U.esc(Productivity.verdict(r, u.name.split(' ')[0]))}</div>
        <div class="grid" style="gap:10px;text-align:center;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
          <div class="card" style="padding:10px"><div class="small muted">Conectado</div><strong>${Productivity.hm(r.minutes)}</strong></div>
          <div class="card" style="padding:10px"><div class="small muted">Llamadas</div><strong>${r.n}</strong></div>
          <div class="card" style="padding:10px"><div class="small muted">Habló con</div><strong>${r.contacts}</strong></div>
          <div class="card" style="padding:10px"><div class="small muted">Citas</div><strong>${r.appts}</strong></div>
          <div class="card" style="padding:10px"><div class="small muted">Ventas</div><strong style="color:#b8860b">${r.sales}</strong>${r.commission ? `<div class="small muted">${U.money(r.commission)} de comisión</div>` : ''}</div>
        </div>
        <div class="form-section">Hora por hora</div>
        ${r.hours.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Hora</th><th class="right">Conectado</th><th class="right">Llamadas</th><th class="right">Contestó</th><th class="right">Citas</th><th>Productividad</th></tr></thead>
          <tbody>${r.hours.map((h) => `<tr><td class="nowrap"><strong>${Productivity.clock(h.hour * 60)} – ${Productivity.clock(h.hour * 60 + 60)}</strong></td>
            <td class="right num small">${h.minutes ? h.minutes + ' min' : '—'}</td><td class="right num">${h.calls}</td><td class="right num">${h.contacts}</td><td class="right num">${h.appts}</td>
            <td><span class="badge ${h.level.cls}">${h.level.name}</span></td></tr>`).join('')}</tbody></table></div>` : UI.empty('Sin actividad.')}
        <div class="form-section">Llamadas del día</div>
        <div class="row wrap" id="pfChips" style="gap:6px;margin-bottom:8px">
          <button type="button" class="btn sm primary" data-g="">Todas <span>${r.n}</span></button>
          ${Productivity.GROUPS.map((g) => `<button type="button" class="btn sm" data-g="${g.id}"><span class="dot" style="background:${g.color};width:8px;height:8px;border-radius:50%;display:inline-block"></span> ${g.name} <span class="muted">${r.by[g.id]}</span></button>`).join('')}
        </div>
        <div id="pfList">${listHtml()}</div>`,
      onOpen: (form, close) => {
        const bindLinks = () => form.querySelectorAll('[data-close-link]').forEach((a) => a.addEventListener('click', close));
        form.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
          filter = b.dataset.g;
          form.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('primary', x === b));
          form.querySelector('#pfList').innerHTML = listHtml(); bindLinks();
        });
        bindLinks();
      }
    });
    return m;
  }

  function exportDay(rows, day) {
    const csv = U.toCSV(rows, [
      { label: 'Fecha', value: () => U.toDateInput(day) }, { label: 'Agente', value: (x) => x.u.name },
      { label: 'Minutos conectado', value: (x) => x.r.minutes }, { label: 'Llamadas', value: (x) => x.r.n }, { label: 'Contestó', value: (x) => x.r.contacts },
      { label: 'No contestó', value: (x) => x.r.by.no_contesto }, { label: 'Citas', value: (x) => x.r.appts }, { label: 'Ventas', value: (x) => x.r.sales }, { label: 'Comisión', value: (x) => x.r.commission }, { label: 'Llamar después', value: (x) => x.r.by.seguimiento },
      { label: 'Llamadas por hora', value: (x) => (x.r.score ? x.r.score.cph.toFixed(1) : '') }, { label: 'Tasa de contacto', value: (x) => (x.r.score ? U.pct(x.r.score.contactRate) : '') },
      { label: 'Citas por hora', value: (x) => (x.r.score ? x.r.score.aph.toFixed(2) : '') }, { label: 'Productividad', value: (x) => x.r.level.name }, { label: 'Tareas vencidas', value: (x) => x.r.overdueTasks }
    ]);
    U.download(`productividad-${U.toDateInput(day)}.csv`, csv, 'text/csv;charset=utf-8');
  }

  return { title: 'Productividad', perm: 'manageUsers', render, openDetail };
})();
