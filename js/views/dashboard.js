/* =========================================================
   Inicio — tablero
   ========================================================= */
Views.dashboard = (() => {
  let range = 'mes';

  function kpi(label, value, sub, ic, color, progress) {
    return `<div class="card kpi">
      <div class="kpi-icon" style="background:${color}1f;color:${color}">${icon(ic)}</div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${progress !== undefined ? `<div class="progress ${progress >= 1 ? 'good' : ''}"><span style="width:${Math.min(100, progress * 100)}%"></span></div>` : ''}
      <div class="kpi-sub">${sub}</div>
    </div>`;
  }

  function render(el) {
    const me = Store.currentUser();
    const manager = Store.can('viewAll');
    const [from, to] = Metrics.RANGES[range].get();
    const uid = manager ? null : me.id;
    const m = Metrics.forUser(uid, from, to);
    const today = Metrics.forUser(me.id, U.startOfDay(), U.endOfDay());
    const monthMine = Metrics.forUser(uid, U.startOfMonth(), U.endOfDay());
    const rec = Metrics.receivables(uid);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    const salesGoal = manager ? U.sum(Store.sellers(), (u) => u.salesGoal || 0) : (me.salesGoal || 0);
    const clients = Store.myClients();
    const now = Date.now();
    const myFollow = clients.filter((c) => OPEN_STAGES.includes(c.stage) && c.nextFollowUp && new Date(c.nextFollowUp).getTime() <= U.endOfDay().getTime() && (manager ? true : c.ownerId === me.id));
    const overdue = myFollow.filter((c) => new Date(c.nextFollowUp).getTime() < now);
    const hot = U.sortBy(clients.filter((c) => OPEN_STAGES.includes(c.stage) && c.temperature === 'caliente'), (c) => Store.leadScore(c), -1).slice(0, 6);
    const recent = U.sortBy(Store.myActivities(), (a) => a.createdAt, -1).slice(0, 8);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>${greet}, ${U.esc(me.name.split(' ')[0])} 👋</h1>
        <p>${manager ? 'Así va el negocio' : 'Así va tu día'} · ${U.date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="page-actions">
          <div class="seg" id="rangeSeg">${Object.entries(Metrics.RANGES).map(([k, r]) => `<button data-r="${k}" class="${k === range ? 'active' : ''}">${r.label}</button>`).join('')}</div>
          <a class="btn primary" href="#/llamadas">${icon('play', 'sm')} Empezar a llamar</a>
        </div>
      </div>

      ${!manager || me.callGoal ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-body row wrap" style="gap:24px">
          <div style="flex:1;min-width:220px">
            <div class="row between"><strong>Meta de llamadas de hoy</strong><span class="num">${today.calls} / ${me.callGoal || 0}</span></div>
            <div class="progress ${today.calls >= (me.callGoal || 1) ? 'good' : ''}" style="margin-top:8px;height:10px"><span style="width:${me.callGoal ? Math.min(100, (today.calls / me.callGoal) * 100) : 0}%"></span></div>
          </div>
          <div><div class="muted small">Contactos efectivos</div><strong class="num" style="font-size:18px">${today.contacts}</strong></div>
          <div><div class="muted small">Tiempo al teléfono</div><strong class="num" style="font-size:18px">${U.duration(today.talkTime)}</strong></div>
          <div><div class="muted small">Ventas hoy</div><strong class="num" style="font-size:18px">${U.money(today.salesAmount)}</strong></div>
          <div><div class="muted small">Seguimientos vencidos</div><strong class="num" style="font-size:18px;color:${overdue.length ? 'var(--bad)' : 'inherit'}">${overdue.length}</strong></div>
        </div>
      </div>` : ''}

      <div class="kpis">
        ${kpi('Ventas', U.money(m.salesAmount), `${m.salesCount} pedidos · ticket prom. ${U.money(m.avgTicket)}`, 'cart', '#0a8a0a')}
        ${kpi('Recaudado', U.money(m.collected), `Pagos recibidos · ${Metrics.RANGES[range].label.toLowerCase()}`, 'wallet', '#2a78d6')}
        ${kpi('Por cobrar', U.money(rec.total), `${rec.count} pedidos · ${U.money(rec.overdue)} vencido`, 'alert', '#d03b3b')}
        ${kpi('Llamadas', U.num(m.calls), `${U.pct(m.contactRate)} contestaron · ${m.quotes} cotizaciones`, 'phone', '#4a3aa7')}
        ${kpi('Meta del mes', salesGoal ? U.pct(monthMine.salesAmount / salesGoal) : '—', salesGoal ? `${U.money(monthMine.salesAmount)} de ${U.money(salesGoal)}` : 'Define metas en el panel admin', 'target', '#c98500', salesGoal ? monthMine.salesAmount / salesGoal : undefined)}
        ${kpi('Prospectos activos', U.num(m.openLeads), `${m.hotLeads} calientes · ${m.newLeads} nuevos en el periodo`, 'flame', '#e34948')}
      </div>

      <div class="grid span-2-1" style="margin-bottom:16px">
        <div class="card">
          <div class="card-head"><h2>Ventas por día · últimos 30 días</h2><span class="muted small">${U.money(Metrics.forUser(uid, U.startOfDay(U.addDays(new Date(), -29)), U.endOfDay()).salesAmount)} total</span></div>
          <div class="card-body">${UI.barChart(Metrics.dailySeries(30, (f, t) => U.sum(Store.all('orders').filter((o) => (!uid || o.userId === uid) && o.status !== 'cancelada' && Metrics.inRange(o.createdAt, f, t)), (o) => o.total)), { labelEvery: 3 })}</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Embudo de ventas</h2><a href="#/pipeline" class="small">Ver tablero →</a></div>
          <div class="card-body">
            ${UI.hbars(OPEN_STAGES.concat('ganado').map((s) => ({ label: stageById(s).name, value: clients.filter((c) => c.stage === s).length })), { ramp: true })}
            <div style="margin-top:18px">
              <div class="row between small" style="margin-bottom:6px"><strong>Temperatura de prospectos activos</strong></div>
              ${tempBar(clients.filter((c) => OPEN_STAGES.includes(c.stage)))}
            </div>
          </div>
        </div>
      </div>

      <div class="grid cols-3">
        <div class="card">
          <div class="card-head"><h2>${icon('clock', 'sm')} Seguimientos para hoy</h2><a href="#/agenda" class="small">Agenda →</a></div>
          <div class="card-body flush" style="max-height:380px;overflow:auto">
            ${myFollow.length ? U.sortBy(myFollow, (c) => c.nextFollowUp).slice(0, 12).map((c) => `
              <div class="list-item clickable" data-go="#/cliente/${c.id}">
                ${UI.avatar(Store.get('users', c.ownerId))}
                <div class="grow"><div class="title">${U.esc(c.name)}</div><div class="small">${UI.followLabel(c.nextFollowUp)}</div></div>
                ${UI.tempBadge(c.temperature)}
              </div>`).join('') : UI.empty('¡Todo al día! No hay seguimientos pendientes para hoy.', 'check')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('flame', 'sm')} Prospectos calientes</h2><a href="#/clientes?temp=caliente" class="small">Ver todos →</a></div>
          <div class="card-body flush">
            ${hot.length ? hot.map((c) => `
              <div class="list-item clickable" data-go="#/cliente/${c.id}">
                <div class="grow"><div class="title">${U.esc(c.name)}</div><div class="small muted">${stageById(c.stage).name} · ${U.money(c.estValue)} · ${U.ago(c.lastContact)}</div></div>
                ${UI.scoreBadge(Store.leadScore(c))}
              </div>`).join('') : UI.empty('Aún no hay prospectos calientes.', 'flame')}
          </div>
        </div>
        ${manager ? leaderboard() : `
        <div class="card">
          <div class="card-head"><h2>Actividad reciente</h2></div>
          <div class="card-body flush">${recentList(recent)}</div>
        </div>`}
      </div>
      ${manager ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>Actividad reciente del equipo</h2></div><div class="card-body flush">${recentList(recent)}</div></div>` : ''}
    `;

    el.querySelectorAll('#rangeSeg button').forEach((b) => b.onclick = () => { range = b.dataset.r; render(el); });
    el.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => { location.hash = x.dataset.go; });
  }

  function tempBar(list) {
    const counts = TEMPS.map((t) => ({ t, n: list.filter((c) => c.temperature === t.id).length }));
    const total = Math.max(1, list.length);
    const colors = { frio: 'var(--cold)', tibio: 'var(--warm)', caliente: 'var(--hot)' };
    return `<div class="stackbar">${counts.filter((x) => x.n).map((x) => `<span data-tip="${x.t.name}: ${x.n}" style="width:${(x.n / total) * 100}%;background:${colors[x.t.id]}"></span>`).join('')}</div>
      <div class="legend">${counts.map((x) => `<span><i style="background:${colors[x.t.id]}"></i>${x.t.name} <strong>${x.n}</strong></span>`).join('')}</div>`;
  }

  function leaderboard() {
    const [from, to] = Metrics.RANGES[range].get();
    const rows = U.sortBy(Store.sellers().map((u) => ({ u, m: Metrics.forUser(u.id, from, to) })), (r) => r.m.salesAmount, -1);
    return `<div class="card">
      <div class="card-head"><h2>${icon('trophy', 'sm')} Ranking del equipo</h2><a href="#/reportes" class="small">Reportes →</a></div>
      <div class="card-body flush">
        ${rows.map((r, i) => `
          <div class="list-item">
            <span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span>
            ${UI.avatar(r.u)}
            <div class="grow"><div class="title">${U.esc(r.u.name)}</div><div class="small muted">${r.m.calls} llamadas · ${r.m.salesCount} ventas · ${U.pct(r.m.contactRate)} contacto</div></div>
            <strong class="num">${U.money(r.m.salesAmount)}</strong>
          </div>`).join('')}
      </div></div>`;
  }

  function recentList(list) {
    if (!list.length) return UI.empty('Sin actividad todavía.');
    return list.map((a) => {
      const c = Store.get('clients', a.clientId);
      const t = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.sistema;
      return `<div class="list-item ${c ? 'clickable' : ''}" ${c ? `data-go="#/cliente/${c.id}"` : ''}>
        <div class="tl-icon">${icon(t.icon, 'sm')}</div>
        <div class="grow"><div class="title">${U.esc(c ? c.name : '—')} ${a.outcome ? UI.outcomeBadge(a.outcome) : ''}</div>
        <div class="small muted">${t.name} · ${U.esc(UI.userName(a.userId))} · ${U.ago(a.createdAt)}</div></div>
      </div>`;
    }).join('');
  }

  return { title: 'Inicio', render };
})();
