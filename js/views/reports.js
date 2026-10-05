/* =========================================================
   Reportes y rendimiento del equipo
   ========================================================= */
Views.reportes = (() => {
  const state = { range: 'mes' };

  function render(el) {
    const fin = Store.can('finance');
    const [from, to] = Metrics.RANGES[state.range].get();
    const team = Metrics.forUser(null, from, to);
    const rows = U.sortBy(Store.sellers().map((u) => ({ u, m: Metrics.forUser(u.id, from, to) })), (r) => (fin ? r.m.salesAmount : r.m.salesCount * 1000 + r.m.appts), -1);
    const monthFactor = state.range === 'mes' ? 1 : null;
    const acts = Store.all('activities').filter((a) => ['llamada', 'whatsapp'].includes(a.type) && Metrics.inRange(a.createdAt, from, to));
    const clients = Store.all('clients');
    const periodClients = clients.filter((c) => Metrics.inRange(c.createdAt, from, to));
    const orders = Store.all('orders').filter((o) => o.status !== 'cancelada' && Metrics.inRange(o.createdAt, from, to));

    // Fuentes: prospectos que entraron (todo el historial) y cuántos compraron
    const sources = Object.entries(U.groupBy(clients, (c) => c.source || 'Sin fuente')).map(([k, list]) => ({
      k, n: list.length, won: list.filter((c) => c.stage === 'ganado').length, revenue: U.sum(list, (c) => Store.clientRevenue(c.id))
    }));
    const products = {};
    orders.forEach((o) => o.items.forEach((i) => { const k = i.name; products[k] = products[k] || { qty: 0, amount: 0 }; products[k].qty += i.qty; products[k].amount += i.qty * i.price; }));
    const lost = U.groupBy(clients.filter((c) => c.stage === 'perdido'), (c) => c.lostReason || 'Sin motivo');
    // Quién entrega referidos: cuántos refirió cada persona y cuántos terminaron en venta
    const referrers = Object.entries(U.groupBy(clients.filter((c) => c.referredBy), (c) => c.referredBy.trim())).map(([k, list]) => ({
      k, n: list.length, appts: list.filter((c) => c.appointment).length, won: list.filter((c) => c.stage === 'ganado').length, revenue: U.sum(list, (c) => Store.clientRevenue(c.id))
    }));
    // Ventas por canal (Instagram, Facebook, WhatsApp, página web, tienda, referidos…)
    const byChannel = Object.entries(U.groupBy(orders, (o) => o.channel || 'Sin indicar')).map(([k, list]) => ({ k, n: list.length, amount: U.sum(list, (o) => o.total) }));
    const days = state.range === 'hoy' ? 1 : state.range === 'semana' ? 7 : state.range === '90d' ? 90 : 30;

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Reportes y equipo</h1><p>Rendimiento de ventas${fin ? ', llamadas y recaudo' : ' y llamadas'} · ${Metrics.RANGES[state.range].label.toLowerCase()}</p></div>
        <div class="page-actions">
          <div class="seg" id="rangeSeg">${Object.entries(Metrics.RANGES).map(([k, r]) => `<button data-r="${k}" class="${k === state.range ? 'active' : ''}">${r.label}</button>`).join('')}</div>
          ${Store.can('exportData') ? `<button class="btn" id="exportBtn">${icon('download', 'sm')} Exportar</button>` : ''}
          <button class="btn" onclick="window.print()">${icon('printer', 'sm')}</button>
        </div>
      </div>
      <div class="kpis">
        ${fin ? `<div class="card kpi"><div class="kpi-label">Ventas</div><div class="kpi-value">${U.money(team.salesAmount)}</div><div class="kpi-sub">${team.salesCount} pedidos · ticket ${U.money(team.avgTicket)}</div></div>
        <div class="card kpi"><div class="kpi-label">Recaudado</div><div class="kpi-value">${U.money(team.collected)}</div><div class="kpi-sub">Pagos recibidos en el periodo</div></div>` : `<div class="card kpi"><div class="kpi-label">Ventas</div><div class="kpi-value">${team.salesCount}</div><div class="kpi-sub">Pedidos en el periodo</div></div>
        <div class="card kpi"><div class="kpi-label">Citas</div><div class="kpi-value">${team.appts}</div><div class="kpi-sub">${team.demos} demostraciones realizadas</div></div>`}
        <div class="card kpi"><div class="kpi-label">Llamadas</div><div class="kpi-value">${U.num(team.calls)}</div><div class="kpi-sub">${U.duration(team.talkTime)} al teléfono</div></div>
        <div class="card kpi"><div class="kpi-label">Tasa de contacto</div><div class="kpi-value">${U.pct(team.contactRate)}</div><div class="kpi-sub">${team.contacts} conversaciones reales</div></div>
        <div class="card kpi"><div class="kpi-label">Cierre</div><div class="kpi-value">${U.pct(team.closeRate)}</div><div class="kpi-sub">Ventas / contactos efectivos</div></div>
        <div class="card kpi"><div class="kpi-label">Nuevos prospectos</div><div class="kpi-value">${periodClients.length}</div><div class="kpi-sub">${team.upcomingAppts} citas próximas</div></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h2>${icon('trophy', 'sm')} Rendimiento por vendedor</h2></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>#</th><th>Vendedor</th><th class="right">Llamadas</th><th class="right">Contacto</th><th class="right">Tiempo</th><th class="right">Citas</th><th class="right">Demos</th><th class="right">Ventas</th>${fin ? '<th class="right">Monto</th><th class="right">Recaudado</th><th class="right">Comisión</th>' : ''}<th class="right">Cierre</th>${fin && monthFactor ? '<th style="min-width:140px">Meta del mes</th>' : ''}${fin ? '<th class="right">Cartera</th>' : ''}</tr></thead>
          <tbody>${rows.map((r, i) => {
            const goalPct = r.u.salesGoal ? r.m.salesAmount / r.u.salesGoal : 0;
            const rec = fin ? Metrics.receivables(r.u.id) : { total: 0 };
            return `<tr>
              <td><span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span></td>
              <td><div class="row">${UI.avatar(r.u)}<div><div class="cell-main">${U.esc(r.u.name)}</div><div class="cell-sub">${ROLES[r.u.role].name}</div></div></div></td>
              <td class="right num">${r.m.calls}</td>
              <td class="right num">${U.pct(r.m.contactRate)}</td>
              <td class="right num">${U.duration(r.m.talkTime)}</td>
              <td class="right num">${r.m.appts}</td><td class="right num">${r.m.demos}</td>
              <td class="right num">${r.m.salesCount}</td>
              ${fin ? `<td class="right num"><strong>${U.money(r.m.salesAmount)}</strong></td>
              <td class="right num">${U.money(r.m.collected)}</td>
              <td class="right num" style="color:#b8860b">${U.money(U.sum(orders.filter((o) => o.userId === r.u.id), Store.orderCommission))}</td>` : ''}
              <td class="right num">${U.pct(r.m.closeRate)}</td>
              ${fin && monthFactor ? `<td>${r.u.salesGoal ? `<div class="progress ${goalPct >= 1 ? 'good' : ''}"><span style="width:${Math.min(100, goalPct * 100)}%"></span></div><div class="cell-sub">${U.pct(goalPct)} de ${U.money(r.u.salesGoal)}</div>` : '<span class="muted small">Sin meta</span>'}</td>` : ''}
              ${fin ? `<td class="right num" style="color:${rec.total > 0 ? 'var(--bad)' : 'inherit'}">${U.money(rec.total)}</td>` : ''}
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>

      <div class="grid cols-2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><h2>Llamadas por día</h2></div><div class="card-body">
          ${UI.barChart(Metrics.dailySeries(Math.max(7, days), (f, t) => Store.all('activities').filter((a) => ['llamada', 'whatsapp'].includes(a.type) && Metrics.inRange(a.createdAt, f, t)).length), { format: U.num, labelEvery: days > 14 ? 3 : 1 })}
        </div></div>
        <div class="card"><div class="card-head"><h2>Resultados de las llamadas</h2></div><div class="card-body">
          ${acts.length ? UI.hbars(U.sortBy(OUTCOMES.map((o) => ({ label: o.name, value: acts.filter((a) => a.outcome === o.id).length, color: o.color })), (x) => x.value, -1).filter((x) => x.value)) : UI.empty('Sin llamadas en el periodo')}
        </div></div>
      </div>

      <div class="grid cols-3">
        <div class="card"><div class="card-head"><h2>¿De dónde vienen los clientes?</h2></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Fuente</th><th class="right">Prosp.</th><th class="right">Conv.</th>${fin ? '<th class="right">Ingresos</th>' : ''}</tr></thead>
          <tbody>${U.sortBy(sources, (s) => (fin ? s.revenue : s.won), -1).map((s) => `<tr><td>${U.esc(s.k)}</td><td class="right num">${s.n}</td><td class="right num">${U.pct(s.won / s.n)}</td>${fin ? `<td class="right num">${U.money(s.revenue)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
          <div class="card-body small muted">Todo el historial. Conv. = % que terminó comprando.</div>
        </div>
        <div class="card"><div class="card-head"><h2>Productos más vendidos</h2></div><div class="card-body">
          ${Object.keys(products).length ? (fin
            ? UI.hbars(U.sortBy(Object.entries(products).map(([k, v]) => ({ label: k, value: v.amount, extra: v.qty + ' unidades' })), (x) => x.value, -1).slice(0, 8), { format: U.money })
            : UI.hbars(U.sortBy(Object.entries(products).map(([k, v]) => ({ label: k, value: v.qty })), (x) => x.value, -1).slice(0, 8), { format: (v) => U.num(v) + ' u.' })) : UI.empty('Sin ventas en el periodo')}
        </div></div>
        <div class="card"><div class="card-head"><h2>¿Por qué se pierden ventas?</h2></div><div class="card-body">
          ${Object.keys(lost).length ? UI.hbars(U.sortBy(Object.entries(lost).map(([k, v]) => ({ label: k, value: v.length })), (x) => x.value, -1)) : UI.empty('Sin ventas perdidas')}
        </div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>${icon('cart', 'sm')} Ventas por canal</h2><span class="muted small">${Metrics.RANGES[state.range].label}</span></div>
        ${byChannel.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Canal</th><th class="right">Ventas</th><th class="right">% de las ventas</th>${fin ? '<th class="right">Monto</th><th class="right">Ticket promedio</th>' : ''}</tr></thead>
          <tbody>${U.sortBy(byChannel, (r) => (fin ? r.amount : r.n), -1).map((r) => `<tr><td><strong>${U.esc(r.k)}</strong></td><td class="right num">${r.n}</td><td class="right num">${U.pct(r.n / orders.length)}</td>${fin ? `<td class="right num">${U.money(r.amount)}</td><td class="right num">${U.money(r.amount / r.n)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
          : UI.empty('Sin ventas en el periodo.', 'cart')}
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>${icon('users', 'sm')} ¿Quién trae referidos?</h2><span class="muted small">Todo el historial</span></div>
        ${referrers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Referido por</th><th class="right">Referidos</th><th class="right">Con cita</th><th class="right">Compraron</th><th class="right">Conversión</th>${fin ? '<th class="right">Ventas</th>' : ''}</tr></thead>
          <tbody>${U.sortBy(referrers, (r) => r.n, -1).map((r) => `<tr><td><strong>${U.esc(r.k)}</strong></td><td class="right num">${r.n}</td><td class="right num">${r.appts}</td><td class="right num">${r.won}</td><td class="right num">${U.pct(r.won / r.n)}</td>${fin ? `<td class="right num">${U.money(r.revenue)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
          : UI.empty('Aún no hay prospectos con "Referido por".', 'users')}
      </div>`;

    el.querySelectorAll('#rangeSeg button').forEach((b) => b.onclick = () => { state.range = b.dataset.r; render(el); });
    const exb = el.querySelector('#exportBtn');
    if (exb) exb.onclick = () => {
      const csv = U.toCSV(rows, [
        { label: 'Vendedor', value: (r) => r.u.name }, { label: 'Llamadas', value: (r) => r.m.calls }, { label: 'Contactos', value: (r) => r.m.contacts },
        { label: 'Tasa contacto', value: (r) => U.pct(r.m.contactRate) }, { label: 'Minutos', value: (r) => Math.round(r.m.talkTime / 60) }, { label: 'Citas agendadas', value: (r) => r.m.appts }, { label: 'Demos realizadas', value: (r) => r.m.demos },
        { label: 'Ventas', value: (r) => r.m.salesCount },
        ...(fin ? [{ label: 'Monto', value: (r) => r.m.salesAmount }, { label: 'Recaudado', value: (r) => r.m.collected }, { label: 'Comisión', value: (r) => U.sum(orders.filter((o) => o.userId === r.u.id), Store.orderCommission) },
          { label: 'Meta', value: (r) => r.u.salesGoal || '' }, { label: 'Cartera', value: (r) => Metrics.receivables(r.u.id).total }] : [])
      ]);
      U.download(`reporte-equipo-${state.range}-${U.toDateInput(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
    };
  }

  return { title: 'Reportes', perm: 'reports', render };
})();
