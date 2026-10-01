/* =========================================================
   Clientes y prospectos — lista + formulario
   ========================================================= */
Views.clientes = (() => {
  const state = { q: '', stage: '', outcome: '', owner: '', source: '', quick: 'todos', sort: 'nextFollowUp', dir: 1, page: 0, selected: new Set() };
  const PAGE = 50;

  const QUICK = [
    { id: 'todos', label: 'Todos', fn: () => true },
    { id: 'activos', label: 'Prospectos activos', fn: (c) => OPEN_STAGES.includes(c.stage) },
    { id: 'sin_contactar', label: 'Sin contactar', fn: (c) => c.stage === 'nuevo' && !c.callCount },
    { id: 'vencidos', label: 'Seguimiento vencido', fn: (c) => OPEN_STAGES.includes(c.stage) && c.nextFollowUp && new Date(c.nextFollowUp) < new Date() },
    { id: 'citas', label: 'Con cita', fn: (c) => !!Store.activeAppointment(c) },
    { id: 'referidos', label: 'Referidos', fn: (c) => isReferralSource(c.source) || !!c.referredBy },
    { id: 'olvidados', label: 'Sin actividad', fn: (c) => Store.isStale(c) },
    { id: 'clientes', label: 'Ya compraron', fn: (c) => c.stage === 'ganado' },
    { id: 'saldo', label: 'Con saldo pendiente', fn: (c) => Store.clientBalance(c.id) > 0, finance: true },
    { id: 'perdidos', label: 'Perdidos', fn: (c) => c.stage === 'perdido' }
  ];

  const COLS = [
    { id: 'name', label: 'Cliente', get: (c) => U.normalize(c.name) },
    { id: 'stage', label: 'Etapa', get: (c) => STAGES.findIndex((s) => s.id === c.stage) },
    { id: 'lastOutcome', label: 'Último resultado', get: (c) => (outcomeById(c.lastOutcome) || {}).name || '' },
    { id: 'callCount', label: 'Intentos', get: (c) => c.callCount || 0 },
    { id: 'ownerId', label: 'Responsable', get: (c) => UI.userName(c.ownerId), manager: true },
    { id: 'lastContact', label: 'Último contacto', get: (c) => c.lastContact || '' },
    { id: 'nextFollowUp', label: 'Próximo seguimiento', get: (c) => c.nextFollowUp || '9999' },
    { id: 'source', label: 'Fuente', get: (c) => U.normalize(c.source || '') }
  ];

  function filtered() {
    const q = U.normalize(state.q.trim());
    const qd = q.replace(/\D/g, '');
    const quick = QUICK.find((x) => x.id === state.quick) || QUICK[0];
    let list = Store.myClients().filter((c) =>
      quick.fn(c) &&
      (!state.stage || c.stage === state.stage) &&
      (!state.outcome || c.lastOutcome === state.outcome) &&
      (!state.owner || c.ownerId === state.owner) &&
      (!state.source || c.source === state.source) &&
      (!q || U.normalize(`${c.name} ${c.company} ${c.email} ${c.city} ${c.address} ${c.referredBy || ''} ${c.eventName || ''}`).includes(q) || (qd.length >= 3 && U.cleanPhone(c.phone + c.phone2).includes(qd)))
    );
    const col = COLS.find((x) => x.id === state.sort) || COLS[0];
    return U.sortBy(list, col.get, state.dir);
  }

  function render(el, _params, query = {}) {
    if (query.quick) { state.quick = query.quick; history.replaceState(null, '', '#/clientes'); }
    const manager = Store.can('viewAll');
    const s = Store.settings();
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    const rows = list.slice(state.page * PAGE, (state.page + 1) * PAGE);
    // Limpiar selección de clientes que ya no existen
    [...state.selected].forEach((id) => { if (!Store.get('clients', id)) state.selected.delete(id); });
    const cols = COLS.filter((c) => !c.manager || manager);

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Clientes y prospectos</h1><p>${U.num(Store.myClients().length)} registros · ${manager ? 'todo el equipo' : 'tu cartera'}</p></div>
        <div class="page-actions">
          <button class="btn" id="importBtn">${icon('upload', 'sm')} Importar</button>
          ${Store.can('exportData') ? `<button class="btn" id="exportBtn">${icon('download', 'sm')} Exportar</button>` : ''}
          <button class="btn primary" id="newBtn">${icon('userPlus', 'sm')} Nuevo prospecto</button>
        </div>
      </div>
      <div class="row wrap" style="margin-bottom:12px;gap:6px">
        ${QUICK.filter((x) => !x.finance || Store.can('finance')).map((x) => { const n = Store.myClients().filter(x.fn).length; return `<button class="btn sm ${state.quick === x.id ? 'primary' : ''}" data-quick="${x.id}">${x.label} <span class="${state.quick === x.id ? '' : 'muted'}">${n}</span></button>`; }).join('')}
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="search" id="q" type="search" placeholder="Buscar nombre, teléfono, ciudad, etiqueta…" value="${U.esc(state.q)}">
          <select id="fStage"><option value="">Todas las etapas</option>${UI.options(STAGES, state.stage)}</select>
          <select id="fOutcome"><option value="">Todo resultado</option>${UI.options(OUTCOMES, state.outcome)}</select>
          ${manager ? `<select id="fOwner"><option value="">Todo el equipo</option>${UI.userOptions(state.owner)}</select>` : ''}
          <select id="fSource"><option value="">Todas las fuentes</option>${UI.options(s.sources, state.source)}</select>
          ${state.q || state.stage || state.outcome || state.owner || state.source ? `<button class="btn ghost sm" id="clearF">${icon('x', 'sm')} Limpiar</button>` : ''}
          <span class="spacer"></span><span class="muted small">${U.num(list.length)} resultados</span>
        </div>
        ${state.selected.size ? `
        <div class="bulk-bar">
          <strong>${state.selected.size} seleccionados</strong>
          ${Store.can('reassign') ? `<select id="bOwner"><option value="">Asignar a…</option>${UI.userOptions('')}</select>` : ''}
          <select id="bStage"><option value="">Mover a etapa…</option>${UI.options(STAGES, '')}</select>
          ${Store.can('exportData') ? `<button class="btn sm" id="bExport">${icon('download', 'sm')} Exportar</button>` : ''}
          ${Store.can('deleteRecords') ? `<button class="btn sm danger" id="bDelete">${icon('trash', 'sm')} Eliminar</button>` : ''}
          <button class="btn ghost sm" id="bClear">Quitar selección</button>
        </div>` : ''}
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th style="width:34px"><input type="checkbox" id="selAll" ${rows.length && rows.every((c) => state.selected.has(c.id)) ? 'checked' : ''}></th>
              ${cols.map((c) => `<th class="sortable" data-sort="${c.id}">${c.label}${state.sort === c.id ? (state.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}
              <th></th>
            </tr></thead>
            <tbody>
              ${rows.length ? rows.map((c) => row(c, manager)).join('') : `<tr><td colspan="${cols.length + 2}">${UI.empty('No hay clientes con estos filtros.', 'users')}</td></tr>`}
            </tbody>
          </table>
        </div>
        ${pages > 1 ? `<div class="toolbar" style="border-top:1px solid var(--border);border-bottom:0;justify-content:flex-end">
          <button class="btn sm" id="prev" ${state.page === 0 ? 'disabled' : ''}>${icon('arrowLeft', 'sm')}</button>
          <span class="small">Página ${state.page + 1} de ${pages}</span>
          <button class="btn sm" id="next" ${state.page >= pages - 1 ? 'disabled' : ''}>${icon('arrowRight', 'sm')}</button>
        </div>` : ''}
      </div>`;

    bind(el, list, rows);
  }

  function row(c, manager) {
    const owner = Store.get('users', c.ownerId);
    return `<tr class="clickable stage-row" data-id="${c.id}" style="--row-color:${stageById(c.stage).color}">
      <td data-stop><input type="checkbox" data-sel="${c.id}" ${state.selected.has(c.id) ? 'checked' : ''}></td>
      <td><div class="cell-main">${U.esc(c.name)} ${c.dnc ? `<span class="badge bad" title="No llamar">${icon('ban', 'sm')}</span>` : ''}</div>
        <div class="cell-sub">${U.esc(c.phone)}${c.company ? ' · ' + U.esc(c.company) : ''}${c.city ? ' · ' + U.esc(c.city) : ''}</div></td>
      <td>${UI.stageBadge(c.stage)}</td>
      <td>${c.lastOutcome ? UI.outcomeBadge(c.lastOutcome) : '<span class="muted small">—</span>'}</td>
      <td>${UI.attempts(c)}</td>
      ${manager ? `<td><div class="row">${UI.avatar(owner)}<span class="small">${U.esc(owner ? owner.name.split(' ')[0] : 'Sin asignar')}</span></div></td>` : ''}
      <td class="small nowrap">${c.lastContact ? `${U.dateTime(c.lastContact)}<div class="cell-sub">${U.ago(c.lastContact)}</div>` : '<span class="muted">Nunca</span>'}</td>
      <td class="small nowrap">${OPEN_STAGES.includes(c.stage) ? UI.followLabel(c.nextFollowUp) : '<span class="muted">—</span>'}${Store.activeAppointment(c) ? `<div class="cell-sub">${icon('calendar', 'sm')} Cita ${U.dateTime(Store.activeAppointment(c).at)}</div>` : ''}</td>
      <td class="small">${U.esc(c.source || '—')}${c.referredBy ? `<div class="cell-sub">Ref.: ${U.esc(c.referredBy)}</div>` : c.eventName ? `<div class="cell-sub">${U.esc(c.eventName)}</div>` : ''}</td>
      <td data-stop class="nowrap">
        <a class="btn ghost sm icon" href="${U.telLink(c.phone)}" title="Llamar" data-call="${c.id}">${icon('phone', 'sm')}</a>
        <a class="btn ghost sm icon" href="${U.waLink(c.phone)}" target="_blank" rel="noopener" title="WhatsApp">${icon('message', 'sm')}</a>
      </td>
    </tr>`;
  }

  function bind(el, list, rows) {
    const rerender = () => render(el);
    const q = el.querySelector('#q');
    q.addEventListener('input', U.debounce(() => { if (!/^#\/clientes/.test(location.hash)) return; state.q = q.value; state.page = 0; rerender(); el.querySelector('#q').focus(); const v = el.querySelector('#q'); v.setSelectionRange(v.value.length, v.value.length); }, 250));
    [['#fStage', 'stage'], ['#fOutcome', 'outcome'], ['#fOwner', 'owner'], ['#fSource', 'source']].forEach(([sel, k]) => {
      const x = el.querySelector(sel); if (x) x.onchange = () => { state[k] = x.value; state.page = 0; rerender(); };
    });
    const clear = el.querySelector('#clearF');
    if (clear) clear.onclick = () => { Object.assign(state, { q: '', stage: '', outcome: '', owner: '', source: '', page: 0 }); rerender(); };
    el.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => { state.quick = b.dataset.quick; state.page = 0; rerender(); });
    el.querySelectorAll('[data-sort]').forEach((th) => th.onclick = () => { if (state.sort === th.dataset.sort) state.dir *= -1; else { state.sort = th.dataset.sort; state.dir = ['callCount', 'lastContact'].includes(th.dataset.sort) ? -1 : 1; } rerender(); });
    el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; location.hash = '#/cliente/' + tr.dataset.id; }));
    el.querySelectorAll('[data-sel]').forEach((cb) => cb.onchange = () => { cb.checked ? state.selected.add(cb.dataset.sel) : state.selected.delete(cb.dataset.sel); rerender(); });
    el.querySelectorAll('[data-call]').forEach((a) => a.addEventListener('click', () => setTimeout(() => Views.cliente.quickLog(a.dataset.call), 400)));
    const selAll = el.querySelector('#selAll');
    if (selAll) selAll.onchange = () => { rows.forEach((c) => selAll.checked ? state.selected.add(c.id) : state.selected.delete(c.id)); rerender(); };
    const prev = el.querySelector('#prev'), next = el.querySelector('#next');
    if (prev) prev.onclick = () => { state.page--; rerender(); };
    if (next) next.onclick = () => { state.page++; rerender(); };
    el.querySelector('#newBtn').onclick = () => openForm();
    const exb = el.querySelector('#exportBtn');
    if (exb) exb.onclick = () => exportCSV(list);
    el.querySelector('#importBtn').onclick = openImport;

    // Acciones masivas
    const ids = () => [...state.selected];
    const bOwner = el.querySelector('#bOwner');
    if (bOwner) bOwner.onchange = () => { if (!bOwner.value) return; Store.reassign(ids(), bOwner.value); UI.toast(`${ids().length} clientes asignados a ${UI.userName(bOwner.value)}`, 'good'); state.selected.clear(); };
    const bStage = el.querySelector('#bStage');
    if (bStage) bStage.onchange = () => { if (!bStage.value) return; ids().forEach((id) => Store.changeStage(id, bStage.value)); UI.toast('Etapa actualizada', 'good'); state.selected.clear(); };
    const bExport = el.querySelector('#bExport');
    if (bExport) bExport.onclick = () => exportCSV(ids().map((id) => Store.get('clients', id)));
    const bDelete = el.querySelector('#bDelete');
    if (bDelete) bDelete.onclick = async () => {
      if (!(await UI.confirm(`¿Eliminar ${ids().length} clientes y todo su historial? Esta acción no se puede deshacer.`))) return;
      ids().forEach((id) => Store.deleteClient(id)); state.selected.clear(); UI.toast('Clientes eliminados');
    };
    const bClear = el.querySelector('#bClear');
    if (bClear) bClear.onclick = () => { state.selected.clear(); rerender(); };
  }

  // Sí / No / No indicado
  const triOptions = (v) => `<option value="">No indicado</option><option value="si" ${v === true ? 'selected' : ''}>Sí</option><option value="no" ${v === false ? 'selected' : ''}>No</option>`;

  /* ---------- Formulario ---------- */
  function openForm(id, preset = {}) {
    const c = id ? Store.get('clients', id) : Object.assign({ stage: 'nuevo', ownerId: Store.currentUser().id, interests: [] }, preset);
    const s = Store.settings();
    const products = Store.all('products').filter((p) => p.active);
    const sources = s.sources.includes(c.source) || !c.source ? s.sources : s.sources.concat(c.source);
    UI.modal({
      title: id ? 'Editar cliente' : 'Nuevo prospecto',
      size: 'lg',
      submitLabel: id ? 'Guardar cambios' : 'Crear prospecto',
      body: `
        <div class="form-grid">
          <label class="field">Nombre completo *<input name="name" required value="${U.esc(c.name)}"></label>
          <label class="field">Empresa / negocio <span class="hint">(si aplica)</span><input name="company" value="${U.esc(c.company)}"></label>
          <label class="field">Teléfono principal *<input name="phone" type="tel" required value="${U.esc(c.phone)}"></label>
          <label class="field">Teléfono alterno<input name="phone2" type="tel" value="${U.esc(c.phone2)}"></label>
          <label class="field full">Email<input name="email" type="email" value="${U.esc(c.email)}"></label>
          <div class="form-section full">Fuente / cómo llegó</div>
          <label class="field">Fuente / cómo llegó<select name="source" id="srcSel">${UI.options(sources, c.source, { blank: 'Seleccionar…' })}</select></label>
          <label class="field ${isReferralSource(c.source) ? '' : 'hidden'}" id="refWrap">Referido por *<input name="referredBy" value="${U.esc(c.referredBy)}" placeholder="Nombre de quien lo refirió"></label>
          <label class="field ${isEventSource(c.source) ? '' : 'hidden'}" id="eventWrap">Nombre del evento *<input name="eventName" value="${U.esc(c.eventName)}" placeholder="Ej.: Feria de Hogar Miami"></label>
          <div class="form-section full">Dirección</div>
          <label class="field full">Dirección<input name="address" value="${U.esc(c.address)}"></label>
          <div class="form-grid cols-3 full">
            <label class="field">Ciudad<input name="city" value="${U.esc(c.city)}"></label>
            <label class="field">Estado<input name="state" value="${U.esc(c.state)}" placeholder="FL"></label>
            <label class="field">Código postal<input name="zip" value="${U.esc(c.zip)}"></label>
          </div>
          <div class="form-section full">Seguimiento</div>
          <label class="field">Etapa<select name="stage">${UI.options(STAGES, stageById(c.stage).id)}</select></label>
          <label class="field">Responsable <span class="hint">(agente asignada)</span><select name="ownerId" ${Store.can('reassign') ? '' : 'disabled'}>${UI.userOptions(c.ownerId)}</select></label>
          <label class="field">Próximo seguimiento <span class="hint">(fecha y hora · queda como tarea pendiente)</span><input name="nextFollowUp" type="datetime-local" value="${U.toLocalInput(c.nextFollowUp)}"></label>
          <label class="field">Resultado de la última llamada <span class="hint">${id ? '(si lo cambias se registra como un intento)' : '(si ya lo llamaste)'}</span><select name="lastOutcome">${UI.options(OUTCOMES, c.lastOutcome, { blank: id ? '— Sin cambios —' : '— Aún no se ha llamado —' })}</select></label>
          ${id ? `<div class="field full"><span class="muted small">Último contacto: <strong>${c.lastContact ? U.dateTime(c.lastContact) : 'nunca'}</strong> · Intentos de contacto: <strong>${c.callCount || 0}</strong> <span class="hint">(se actualizan solos)</span></span></div>` : ''}
          <label class="field full">Productos de interés
            <div class="row wrap" style="gap:6px 14px;font-weight:400">${products.map((p) => `<label class="check"><input type="checkbox" name="interests" data-multi value="${p.id}" ${(c.interests || []).includes(p.id) ? 'checked' : ''}>${U.esc(p.name)}</label>`).join('') || '<span class="muted small">Aún no hay productos en el catálogo.</span>'}</div>
          </label>
          <div class="form-section full">Perfil del cliente / hogar</div>
          <div class="form-grid cols-3 full">
            <label class="field">Vivienda<select name="housing">${UI.options(HOUSING, c.housing, { blank: 'No indicado' })}</select></label>
            <label class="field">Crédito<select name="credit">${UI.options(CREDIT, c.credit, { blank: 'No sabe / No indicado' })}</select></label>
            <label class="field">Personas en el hogar<select name="householdSize">${UI.options(Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: i === 9 ? '10 o más' : String(i + 1) })), c.householdSize ? String(Math.min(10, c.householdSize)) : '', { blank: 'No sabe / No indicado' })}</select></label>
            <label class="field">Estado civil<select name="maritalStatus">${UI.options(MARITAL, c.maritalStatus, { blank: 'No indicado' })}</select></label>
            <label class="field">Mejor horario para contactar<select name="bestTime">${UI.options(BEST_TIMES, c.bestTime, { blank: 'No indicado' })}</select></label>
            <label class="field">Contacto preferido<select name="preferredContact">${UI.options(CONTACT_PREFS, c.preferredContact, { blank: 'No indicado' })}</select></label>
            <label class="field">Mascotas<select name="pets">${triOptions(c.pets)}</select></label>
            <label class="field">Alergias / asma<select name="allergies">${triOptions(c.allergies)}</select></label>
          </div>
          <label class="field full">Notas generales<textarea name="notes" rows="3">${U.esc(c.notes)}</textarea></label>
          <label class="check full"><input type="checkbox" name="dnc" ${c.dnc ? 'checked' : ''}> <span>No volver a llamar (lista negra)</span></label>
        </div>`,
      onOpen: (form) => {
        const src = form.querySelector('#srcSel');
        const sync = () => {
          form.querySelector('#refWrap').classList.toggle('hidden', !isReferralSource(src.value));
          form.querySelector('#eventWrap').classList.toggle('hidden', !isEventSource(src.value));
        };
        src.onchange = () => { sync(); const f = form.querySelector(isReferralSource(src.value) ? '[name=referredBy]' : isEventSource(src.value) ? '[name=eventName]' : null); if (f) f.focus(); };
        sync();
      },
      onSubmit: (d) => {
        if (isReferralSource(d.source) && !d.referredBy) { UI.toast('Escribe quién lo refirió', 'bad'); return false; }
        if (isEventSource(d.source) && !d.eventName) { UI.toast('Escribe el nombre del evento', 'bad'); return false; }
        const dup = Store.all('clients').find((x) => x.id !== id && U.cleanPhone(x.phone).slice(-10) === U.cleanPhone(d.phone).slice(-10) && U.cleanPhone(d.phone).length >= 7);
        if (dup && !id && !window.confirm(`Ya existe un cliente con ese teléfono: ${dup.name} (${UI.userName(dup.ownerId)}). ¿Crear de todas formas?`)) return false;
        const outcome = d.lastOutcome;
        const tri = (v) => (v === 'si' ? true : v === 'no' ? false : null);
        const data = Object.assign({}, d, {
          pets: tri(d.pets), allergies: tri(d.allergies), householdSize: d.householdSize ? Number(d.householdSize) : null,
          referredBy: isReferralSource(d.source) ? d.referredBy : '',
          eventName: isEventSource(d.source) ? d.eventName : '',
          nextFollowUp: U.fromInput(d.nextFollowUp)
        });
        delete data.lastOutcome;
        if (!Store.can('reassign')) data.ownerId = c.ownerId || Store.currentUser().id;
        let clientId = id;
        if (id) {
          const prevStage = stageById(c.stage).id;
          delete data.stage;
          Store.update('clients', id, data);
          if (d.stage !== prevStage) Views.cliente.setStage(id, d.stage);
          if (data.ownerId !== c.ownerId) Store.logActivity({ clientId: id, type: 'asignacion', text: `Asignado a ${UI.userName(data.ownerId)}` });
          UI.toast('Cliente actualizado', 'good');
        } else {
          const n = Store.insert('clients', Object.assign({ callCount: 0, noAnswerCount: 0, attachments: [], lastContact: null, lastOutcome: '' }, data));
          clientId = n.id;
          Store.logActivity({ clientId: n.id, type: 'sistema', text: `Prospecto creado${d.source ? ' · Fuente: ' + d.source : ''}${data.referredBy ? ' · Referido por: ' + data.referredBy : ''}${data.eventName ? ' · Evento: ' + data.eventName : ''}` });
          UI.toast('Prospecto creado', 'good');
        }
        // El resultado elegido se registra como un intento de contacto (fecha, hora e intentos automáticos)
        if (outcome) {
          Store.logCall(clientId, { outcome, notes: 'Registrado desde el formulario', nextFollowUp: data.nextFollowUp || undefined });
          const o = outcomeById(outcome);
          if (o && o.appointment) setTimeout(() => Views.cliente.openAppointment(clientId), 80);
        }
        if (!id) location.hash = '#/cliente/' + clientId;
      }
    });
  }

  /* ---------- Exportar / importar ---------- */
  function exportCSV(list) {
    if (!Store.can('exportData')) return UI.toast('Tu usuario no tiene permiso para exportar', 'bad');
    const csv = U.toCSV(list, [
      { label: 'Nombre', value: 'name' }, { label: 'Empresa', value: 'company' }, { label: 'Teléfono', value: 'phone' }, { label: 'Teléfono 2', value: 'phone2' },
      { label: 'Email', value: 'email' }, { label: 'Dirección', value: 'address' }, { label: 'Ciudad', value: 'city' }, { label: 'Estado', value: 'state' }, { label: 'CP', value: 'zip' },
      { label: 'Fuente', value: 'source' }, { label: 'Referido por', value: 'referredBy' }, { label: 'Evento', value: 'eventName' }, { label: 'Etapa', value: (c) => stageById(c.stage).name },
      { label: 'Responsable', value: (c) => UI.userName(c.ownerId) }, { label: 'Último resultado', value: (c) => (outcomeById(c.lastOutcome) || {}).name || '' },
      { label: 'Cita', value: (c) => { const a = Store.activeAppointment(c); return a ? `${U.dateTime(a.at)} · ${a.address} · ${Store.demoByName(a)}` : ''; } },
      { label: 'Último contacto', value: (c) => c.lastContact ? U.dateTime(c.lastContact) : '' }, { label: 'Próximo seguimiento', value: (c) => c.nextFollowUp ? U.dateTime(c.nextFollowUp) : '' },
      { label: 'Intentos de contacto', value: 'callCount' },
      { label: 'Vivienda', value: (c) => labelOf(HOUSING, c.housing) }, { label: 'Crédito', value: (c) => labelOf(CREDIT, c.credit, 'No sabe / No indicado') },
      { label: 'Personas en el hogar', value: (c) => c.householdSize || 'No indicado' }, { label: 'Estado civil', value: (c) => labelOf(MARITAL, c.maritalStatus) },
      { label: 'Mejor horario', value: (c) => c.bestTime || '' }, { label: 'Contacto preferido', value: (c) => c.preferredContact || '' },
      { label: 'Mascotas', value: (c) => yesNoLabel(c.pets) }, { label: 'Alergias / asma', value: (c) => yesNoLabel(c.allergies) },
      ...(Store.can('finance') ? [{ label: 'Total comprado', value: (c) => Store.clientRevenue(c.id) }, { label: 'Saldo', value: (c) => Store.clientBalance(c.id) }] : []),
      { label: 'Notas', value: 'notes' }
    ]);
    U.download(`clientes-${U.toDateInput(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
    UI.toast(`${list.length} clientes exportados`, 'good');
  }

  function openImport() {
    const s = Store.settings();
    UI.modal({
      title: 'Importar prospectos desde Excel / CSV',
      size: 'lg',
      submitLabel: 'Importar',
      body: `
        <p style="margin:0" class="muted">Guarda tu Excel como <strong>CSV</strong> y súbelo aquí. La primera fila debe tener los títulos de columna. Se reconocen: <code>nombre, telefono, telefono2, email, empresa, direccion, ciudad, estado, cp, fuente, referido por, evento, notas</code>.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv">
        <div class="form-grid">
          <label class="field">Asignar a<select name="ownerId">${Store.can('reassign') ? `<option value="__rr">Repartir entre todos los agentes (equitativo)</option>` : ''}${UI.userOptions(Store.currentUser().id)}</select></label>
          <label class="field">Fuente por defecto<select name="source">${UI.options(s.sources, 'Llamada en frío')}</select></label>
          <label class="check full"><input type="checkbox" name="skipDup" checked> Omitir teléfonos que ya existen</label>
        </div>
        <div id="csvPreview" class="small muted"></div>`,
      onOpen: (form) => {
        form.querySelector('#csvFile').onchange = async (e) => {
          const f = e.target.files[0]; if (!f) return;
          const rows = U.parseCSV(await f.text());
          form._rows = rows;
          form.querySelector('#csvPreview').innerHTML = rows.length ? `<strong>${rows.length} filas detectadas.</strong> Columnas: ${Object.keys(rows[0]).map(U.esc).join(', ')}` : 'No se detectaron filas.';
        };
      },
      onSubmit: (d, form) => {
        const rows = form._rows || [];
        if (!rows.length) { UI.toast('Selecciona un archivo CSV', 'bad'); return false; }
        const pick = (r, ...keys) => { for (const k of keys) if (r[k]) return r[k]; return ''; };
        const agents = Store.sellers();
        const existing = new Set(Store.all('clients').map((c) => U.cleanPhone(c.phone).slice(-10)));
        let n = 0, skipped = 0;
        rows.forEach((r, i) => {
          const name = pick(r, 'nombre', 'name', 'cliente', 'nombre completo');
          const phone = pick(r, 'telefono', 'phone', 'celular', 'tel', 'movil');
          if (!name && !phone) return;
          const key = U.cleanPhone(phone).slice(-10);
          if (d.skipDup && key && existing.has(key)) { skipped++; return; }
          existing.add(key);
          const ownerId = d.ownerId === '__rr' ? agents[i % agents.length].id : d.ownerId;
          Store.insert('clients', {
            name: name || phone, phone, phone2: pick(r, 'telefono2', 'telefono 2', 'phone2'), email: pick(r, 'email', 'correo', 'e-mail'),
            company: pick(r, 'empresa', 'company', 'negocio'), address: pick(r, 'direccion', 'address'), city: pick(r, 'ciudad', 'city'),
            state: pick(r, 'estado', 'state', 'departamento'), zip: pick(r, 'cp', 'zip', 'codigo postal'), source: pick(r, 'fuente', 'source') || d.source,
            notes: pick(r, 'notas', 'notes', 'observaciones'),
            referredBy: pick(r, 'referido por', 'referido', 'referred by'), eventName: pick(r, 'evento', 'nombre del evento', 'event'),
            stage: 'nuevo', ownerId, interests: [], callCount: 0, noAnswerCount: 0, attachments: [], lastOutcome: ''
          });
          n++;
        });
        UI.toast(`${n} prospectos importados${skipped ? ` · ${skipped} duplicados omitidos` : ''}`, 'good');
      }
    });
  }

  return { title: 'Clientes', perm: 'prospects', render, openForm, exportCSV };
})();
