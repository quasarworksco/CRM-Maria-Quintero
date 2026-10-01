/* =========================================================
   Agenda — seguimientos programados y tareas
   ========================================================= */
Views.agenda = (() => {
  const state = { owner: 'me', showDone: false };

  function buckets(items, getDate) {
    const sod = U.startOfDay().getTime(), eod = U.endOfDay().getTime();
    const tom = U.endOfDay(U.addDays(new Date(), 1)).getTime();
    const week = U.endOfDay(U.addDays(new Date(), 7)).getTime();
    const b = { vencido: [], hoy: [], manana: [], semana: [], despues: [] };
    items.forEach((x) => {
      const t = new Date(getDate(x)).getTime();
      if (t < sod) b.vencido.push(x); else if (t <= eod) b.hoy.push(x); else if (t <= tom) b.manana.push(x); else if (t <= week) b.semana.push(x); else b.despues.push(x);
    });
    Object.values(b).forEach((arr) => arr.sort((a, c) => new Date(getDate(a)) - new Date(getDate(c))));
    return b;
  }
  const LABELS = { vencido: 'Vencidos', hoy: 'Hoy', manana: 'Mañana', semana: 'Próximos 7 días', despues: 'Más adelante' };

  function render(el) {
    const me = Store.currentUser();
    const manager = Store.can('viewAll');
    const ownerFilter = (id) => state.owner === 'all' ? true : state.owner === 'me' ? id === me.id : id === state.owner;
    // El próximo seguimiento de cada cliente es una tarea pendiente más ("Llamar a…")
    const follows = Store.myClients().filter((c) => OPEN_STAGES.includes(c.stage) && c.nextFollowUp && ownerFilter(c.ownerId));
    const tasks = Store.myTasks().filter((t) => ownerFilter(t.userId) && (state.showDone || !t.done));
    const items = follows.map((c) => ({ kind: 'follow', at: c.nextFollowUp, c })).concat(tasks.filter((t) => !t.done).map((t) => ({ kind: 'task', at: t.due, t })));
    const ib = buckets(items, (x) => x.at);
    const done = tasks.filter((t) => t.done);
    const appts = U.sortBy(Store.myClients().filter((c) => {
      const a = Store.activeAppointment(c);
      return a && new Date(a.at) >= U.startOfDay() && (ownerFilter(c.ownerId) || a.demoBy === me.id);
    }), (c) => Store.activeAppointment(c).at);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Agenda y tareas</h1><p>${ib.vencido.length} vencidos · ${ib.hoy.length} para hoy · ${appts.length} citas próximas</p></div>
        <div class="page-actions">
          ${manager ? `<select id="owner" style="width:auto"><option value="me" ${state.owner === 'me' ? 'selected' : ''}>Mi agenda</option><option value="all" ${state.owner === 'all' ? 'selected' : ''}>Todo el equipo</option>${Store.activeUsers().filter((u) => u.id !== me.id).map((u) => `<option value="${u.id}" ${state.owner === u.id ? 'selected' : ''}>${U.esc(u.name)}</option>`).join('')}</select>` : ''}
          <a class="btn" href="#/llamadas">${icon('play', 'sm')} Llamar seguimientos</a>
          <button class="btn primary" id="newTask">${icon('plus', 'sm')} Nueva tarea</button>
        </div>
      </div>
      <div class="grid span-2-1">
        <div class="card">
          <div class="card-head"><h2>${icon('check', 'sm')} ${state.owner === 'me' ? 'Mis pendientes' : 'Pendientes'}</h2><label class="check small"><input type="checkbox" id="showDone" ${state.showDone ? 'checked' : ''}> Ver tareas completadas</label></div>
          <div class="card-body flush">
            ${Object.keys(LABELS).map((k) => ib[k].length ? `
              <div class="list-item" style="background:var(--surface-2);padding:6px 16px"><strong class="small ${k === 'vencido' ? 'overdue' : ''}">${LABELS[k]} · ${ib[k].length}</strong></div>
              ${ib[k].slice(0, k === 'despues' ? 30 : 200).map((x) => x.kind === 'task' ? taskItem(x.t, { showOwner: state.owner !== 'me' }) : followItem(x.c, k)).join('')}` : '').join('')}
            ${state.showDone && done.length ? `<div class="list-item" style="background:var(--surface-2);padding:6px 16px"><strong class="small">Tareas completadas · ${done.length}</strong></div>${U.sortBy(done, (t) => t.updatedAt, -1).slice(0, 50).map((t) => taskItem(t, { showOwner: state.owner !== 'me' })).join('')}` : ''}
            ${!items.length && !(state.showDone && done.length) ? UI.empty('No hay pendientes. 🎉', 'check') : ''}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('calendar', 'sm')} Próximas citas</h2><span class="muted small">${appts.length}</span></div>
          <div class="card-body flush">
            ${appts.length ? appts.map((c) => { const a = Store.activeAppointment(c); return `
              <div class="list-item clickable" data-go="#/cliente/${c.id}">
                <div class="appt-date"><strong>${U.date(a.at, { day: 'numeric' })}</strong><span>${U.date(a.at, { month: 'short' })}</span></div>
                <div class="grow"><div class="title">${U.esc(c.name)}</div><div class="small muted">${U.time(a.at)} · Demo: ${U.esc(Store.demoByName(a))}</div>${a.address ? `<div class="small muted">${U.esc(a.address)}</div>` : ''}</div>
                <span class="badge ${a.status === 'confirmada' ? 'good' : 'warn'}">${Store.APPT_STATUS[a.status]}</span>
              </div>`; }).join('') : UI.empty('No hay citas próximas.', 'calendar')}
          </div>
        </div>
      </div>`;

    const own = el.querySelector('#owner');
    if (own) own.onchange = () => { state.owner = own.value; render(el); };
    el.querySelector('#showDone').onchange = (e) => { state.showDone = e.target.checked; render(el); };
    el.querySelector('#newTask').onclick = () => openTaskForm({});
    el.querySelectorAll('[data-go]').forEach((x) => x.onclick = (e) => { if (e.target.closest('[data-log]')) return; location.hash = x.dataset.go; });
    el.querySelectorAll('[data-log]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); Views.cliente.quickLog(b.dataset.log); });
    bindTaskItems(el);
  }

  function followItem(c, bucket) {
    const showOwner = state.owner !== 'me';
    return `<div class="list-item clickable" data-go="#/cliente/${c.id}">
      <span class="tl-icon" style="width:28px;height:28px;color:${stageById(c.stage).color}">${icon('phone', 'sm')}</span>
      <div class="grow">
        <div class="title">Llamar a ${U.esc(c.name)}</div>
        <div class="row wrap" style="gap:6px;margin-top:3px">${UI.stageBadge(c.stage)} ${UI.attempts(c)} ${c.lastOutcome ? UI.outcomeBadge(c.lastOutcome) : ''}${showOwner ? `<span class="small muted">${U.esc(UI.userName(c.ownerId))}</span>` : ''}</div>
      </div>
      <div style="text-align:right">
        <div class="small ${bucket === 'vencido' ? 'overdue' : ''}">${bucket === 'hoy' ? U.time(c.nextFollowUp) : U.dateTime(c.nextFollowUp)}</div>
        <button class="btn xs" data-log="${c.id}" title="Anotar el resultado de la llamada">Registrar</button>
      </div>
    </div>`;
  }

  function taskItem(t, { hideClient = false, showOwner = false } = {}) {
    const c = t.clientId && Store.get('clients', t.clientId);
    const overdue = !t.done && new Date(t.due) < new Date();
    return `<div class="list-item ${t.done ? 'task-done' : ''}">
      <input type="checkbox" data-task-toggle="${t.id}" ${t.done ? 'checked' : ''} title="Marcar como hecha">
      <div class="grow" data-task-edit="${t.id}" style="cursor:pointer">
        <div class="title">${t.priority === 'alta' ? `<span style="color:var(--bad)">●</span> ` : ''}${U.esc(t.title)}</div>
        <div class="small muted">${!hideClient && c ? `<a href="#/cliente/${c.id}">${U.esc(c.name)}</a> · ` : ''}<span class="${overdue ? 'overdue' : ''}">${U.dateTime(t.due)}</span>${showOwner ? ' · ' + U.esc(UI.userName(t.userId)) : ''}</div>
      </div>
    </div>`;
  }

  function bindTaskItems(el) {
    el.querySelectorAll('[data-task-toggle]').forEach((cb) => cb.onchange = () => {
      const t = Store.get('tasks', cb.dataset.taskToggle);
      Store.update('tasks', t.id, { done: cb.checked, doneAt: cb.checked ? new Date().toISOString() : null });
      if (cb.checked && t.clientId) Store.logActivity({ clientId: t.clientId, type: 'sistema', text: 'Tarea completada: ' + t.title });
    });
    el.querySelectorAll('[data-task-edit]').forEach((x) => x.onclick = (e) => { if (e.target.closest('a')) return; openTaskForm({ id: x.dataset.taskEdit }); });
  }

  function openTaskForm({ id, clientId }) {
    const t = id ? Store.get('tasks', id) : { clientId, userId: clientId ? (Store.get('clients', clientId) || {}).ownerId || Store.currentUser().id : Store.currentUser().id, due: (() => { const d = U.addDays(new Date(), 1); d.setHours(10, 0, 0, 0); return d.toISOString(); })(), priority: 'normal' };
    const clients = U.sortBy(Store.myClients(), (c) => U.normalize(c.name));
    UI.modal({
      title: id ? 'Editar tarea' : 'Nueva tarea',
      submitLabel: id ? 'Guardar' : 'Crear tarea',
      body: `
        <label class="field">¿Qué hay que hacer? *<input name="title" required value="${U.esc(t.title)}" placeholder="Enviar cotización, confirmar entrega…"></label>
        <div class="form-grid">
          <label class="field">Fecha y hora<input name="due" type="datetime-local" required value="${U.toLocalInput(t.due)}"></label>
          <label class="field">Prioridad<select name="priority">${UI.options([{ id: 'normal', name: 'Normal' }, { id: 'alta', name: 'Alta' }], t.priority)}</select></label>
          <label class="field">Cliente<select name="clientId">${UI.options(clients, t.clientId, { blank: '— Sin cliente —' })}</select></label>
          <label class="field">Responsable<select name="userId" ${Store.can('reassign') ? '' : 'disabled'}>${UI.userOptions(t.userId)}</select></label>
        </div>
        <label class="field">Detalles<textarea name="notes" rows="2">${U.esc(t.notes)}</textarea></label>`,
      footer: `${id ? `<button type="button" class="btn danger" id="delTask" style="margin-right:auto">${icon('trash', 'sm')} Eliminar</button>` : ''}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">${id ? 'Guardar' : 'Crear tarea'}</button>`,
      onOpen: (form, close) => { const d = form.querySelector('#delTask'); if (d) d.onclick = () => { Store.remove('tasks', id); close(); UI.toast('Tarea eliminada'); }; },
      onSubmit: (d) => {
        const data = { title: d.title, due: U.fromInput(d.due), priority: d.priority, clientId: d.clientId || null, notes: d.notes, userId: Store.can('reassign') ? d.userId : t.userId };
        if (id) Store.update('tasks', id, data); else Store.insert('tasks', Object.assign({ done: false }, data));
        UI.toast(id ? 'Tarea actualizada' : 'Tarea creada', 'good');
      }
    });
  }

  return { title: 'Agenda', perm: 'prospects', render, taskItem, bindTaskItems, openTaskForm };
})();
