/* =========================================================
   Métricas compartidas (inicio, reportes, admin)
   ========================================================= */
const Metrics = (() => {
  const inRange = (d, from, to) => { const t = new Date(d).getTime(); return t >= from.getTime() && t <= to.getTime(); };

  // userId = null → todo el equipo
  function forUser(userId, from, to) {
    const byUser = (x) => !userId || x.userId === userId;
    const acts = Store.all('activities').filter((a) => byUser(a) && inRange(a.createdAt, from, to));
    const calls = acts.filter((a) => a.type === 'llamada' || a.type === 'whatsapp');
    const contacts = calls.filter((a) => { const o = outcomeById(a.outcome); return !o || o.contact; });
    const orders = Store.all('orders').filter((o) => byUser(o) && o.status !== 'cancelada' && inRange(o.createdAt, from, to));
    const payments = Store.all('payments').filter((p) => byUser(p) && inRange(p.date, from, to));
    const clients = Store.all('clients').filter((c) => !userId || c.ownerId === userId);
    const newLeads = clients.filter((c) => inRange(c.createdAt, from, to)).length;
    const won = clients.filter((c) => c.wonAt ? inRange(c.wonAt, from, to) : false).length;
    const quotes = calls.filter((a) => a.outcome === 'cotizacion').length;
    const salesAmount = U.sum(orders, (o) => o.total);
    return {
      calls: calls.length,
      contacts: contacts.length,
      contactRate: calls.length ? contacts.length / calls.length : 0,
      talkTime: U.sum(calls, (a) => a.duration),
      quotes,
      newLeads,
      won,
      salesCount: orders.length,
      salesAmount,
      avgTicket: orders.length ? salesAmount / orders.length : 0,
      collected: U.sum(payments, (p) => p.amount),
      closeRate: contacts.length ? orders.length / contacts.length : 0,
      openLeads: clients.filter((c) => OPEN_STAGES.includes(c.stage)).length,
      hotLeads: clients.filter((c) => OPEN_STAGES.includes(c.stage) && c.temperature === 'caliente').length,
      pipelineValue: U.sum(clients.filter((c) => OPEN_STAGES.includes(c.stage)), (c) => (c.estValue || 0) * stageById(c.stage).prob)
    };
  }

  function receivables(userId) {
    const orders = Store.all('orders').filter((o) => (!userId || o.userId === userId) && o.status !== 'cancelada');
    const total = U.sum(orders, Store.orderBalance);
    const overdue = U.sum(orders.filter((o) => o.dueDate && new Date(o.dueDate) < U.startOfDay()), Store.orderBalance);
    return { total, overdue, count: orders.filter((o) => Store.orderBalance(o) > 0).length };
  }

  function dailySeries(days, fn) {
    const out = [];
    const start = U.startOfDay(U.addDays(new Date(), -(days - 1)));
    for (let i = 0; i < days; i++) {
      const d = U.addDays(start, i);
      out.push({ date: d, label: U.date(d, { weekday: 'short', day: 'numeric', month: 'short' }), short: U.date(d, { day: 'numeric' }), value: fn(d, U.endOfDay(d)) });
    }
    return out;
  }

  const RANGES = {
    hoy: { label: 'Hoy', get: () => [U.startOfDay(), U.endOfDay()] },
    semana: { label: 'Esta semana', get: () => [U.startOfWeek(), U.endOfDay()] },
    mes: { label: 'Este mes', get: () => [U.startOfMonth(), U.endOfDay()] },
    '30d': { label: 'Últimos 30 días', get: () => [U.startOfDay(U.addDays(new Date(), -29)), U.endOfDay()] },
    '90d': { label: 'Últimos 90 días', get: () => [U.startOfDay(U.addDays(new Date(), -89)), U.endOfDay()] }
  };

  return { forUser, receivables, dailySeries, inRange, RANGES };
})();
