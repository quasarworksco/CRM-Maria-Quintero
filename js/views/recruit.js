/* =========================================================
   Reclutamiento — candidatos (módulo aparte de ventas)
   ---------------------------------------------------------
   Lista / tablero / pendientes, ficha del candidato con
   intentos de contacto, entrevista, seguimiento e historial.
   ========================================================= */
Views.reclutamiento = (() => {
  const state = { tab: 'lista', q: '', stage: '', source: '', position: '', owner: '', quick: 'proceso', sort: 'nextFollowUp', dir: 1, showClosed: false };

  const isOverdue = (c) => CAND_OPEN.includes(c.stage) && c.nextFollowUp && new Date(c.nextFollowUp) < new Date();
  const QUICK = [
    { id: 'todos', label: 'Todos', fn: () => true },
    { id: 'proceso', label: 'En proceso', fn: (c) => CAND_OPEN.includes(c.stage) },
    { id: 'sin_contactar', label: 'Sin contactar', fn: (c) => c.stage === 'nuevo' && !c.callCount },
    { id: 'vencidos', label: 'Seguimiento vencido', fn: isOverdue },
    { id: 'entrevistas', label: 'Con entrevista', fn: (c) => !!Recruit.activeInterview(c) },
    { id: 'referidos', label: 'Referidos', fn: (c) => isReferralSource(c.source) || !!c.referredBy },
    { id: 'contratados', label: 'Contratados', fn: (c) => c.stage === 'contratado' },
    { id: 'cerrados', label: 'No seleccionados / Sin respuesta', fn: (c) => ['no_seleccionado', 'sin_respuesta'].includes(c.stage) }
  ];

  const COLS = [
    { id: 'name', label: 'Candidato', get: (c) => U.normalize(c.name) },
    { id: 'position', label: 'Puesto solicitado', get: (c) => U.normalize(c.position || '') },
    { id: 'stage', label: 'Etapa', get: (c) => CAND_STAGES.findIndex((s) => s.id === c.stage) },
    { id: 'callCount', label: 'Intentos', get: (c) => c.callCount || 0 },
    { id: 'ownerId', label: 'Responsable', get: (c) => UI.userName(c.ownerId), manager: true },
    { id: 'nextFollowUp', label: 'Entrevista / seguimiento', get: (c) => { const iv = Recruit.activeInterview(c); return iv ? iv.at : (CAND_OPEN.includes(c.stage) && c.nextFollowUp) || '9999'; } },
    { id: 'source', label: 'Fuente', get: (c) => U.normalize(c.source || '') }
  ];

  function filtered() {
    const q = U.normalize(state.q.trim());
    const qd = q.replace(/\D/g, '');
    const quick = QUICK.find((x) => x.id === state.quick) || QUICK[0];
    const list = Recruit.mine().filter((c) =>
      quick.fn(c) &&
      (!state.stage || c.stage === state.stage) &&
      (!state.source || c.source === state.source) &&
      (!state.position || c.position === state.position) &&
      (!state.owner || c.ownerId === state.owner) &&
      (!q || U.normalize(`${c.name} ${c.email} ${c.city} ${c.state} ${c.position} ${c.referredBy || ''} ${c.notes || ''}`).includes(q) || (qd.length >= 3 && U.cleanPhone((c.phone || '') + (c.phone2 || '')).includes(qd))));
    const col = COLS.find((x) => x.id === state.sort) || COLS[0];
    return U.sortBy(list, col.get, state.dir);
  }

  // Seguimientos vencidos de mis candidatos (para el número del menú)
  const myOverdue = () => Recruit.all().filter((c) => c.ownerId === Store.currentUser().id && isOverdue(c)).length;

  function render(el, _params, query = {}) {
    if (query.tab) { state.tab = query.tab; history.replaceState(null, '', '#/reclutamiento'); }
    const manager = Store.can('viewAll');
    const s = Store.settings();
    const mine = Recruit.mine();
    const now = Date.now();
    const open = mine.filter((c) => CAND_OPEN.includes(c.stage));
    const ivSoon = mine.filter((c) => { const iv = Recruit.activeInterview(c); return iv && new Date(iv.at).getTime() < now + 7 * U.DAY; });
    const hiredMonth = mine.filter((c) => c.stage === 'contratado' && c.hiredAt && new Date(c.hiredAt) >= U.startOfMonth(new Date()));
    const overdue = mine.filter(isOverdue);
    const denied = Store.deniedCollections().length > 0;

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Reclutamiento</h1><p>${U.num(mine.length)} candidatos · ${manager ? 'todo el equipo' : 'asignados a ti'} · <span class="muted">separado de clientes y ventas</span></p></div>
        <div class="page-actions">
          <button class="btn" id="importBtn">${icon('upload', 'sm')} Importar</button>
          <button class="btn" id="exportBtn">${icon('download', 'sm')} Exportar</button>
          <button class="btn primary" id="newBtn">${icon('userPlus', 'sm')} Nuevo candidato</button>
        </div>
      </div>
      ${denied ? `<div class="archived-note" style="margin-bottom:14px">${icon('alert', 'sm')}<div><strong>Falta activar Reclutamiento en la base de datos.</strong><div class="small">La administración debe publicar las reglas nuevas de Firestore (Firebase → Firestore Database → Reglas → pegar el archivo <code>firestore.rules</code> → Publicar). Mientras tanto no se pueden guardar candidatos en línea.</div></div></div>` : ''}
      <div class="kpis">
        ${kpi('En proceso', U.num(open.length), `${mine.filter((c) => c.stage === 'nuevo' && !c.callCount).length} sin contactar`, 'users')}
        ${kpi('Entrevistas próximas', U.num(ivSoon.length), 'en los próximos 7 días', 'calendar')}
        ${kpi('Contratados', U.num(hiredMonth.length), `este mes · ${mine.filter((c) => c.stage === 'contratado').length} en total`, 'trophy')}
        ${kpi('Seguimientos vencidos', U.num(overdue.length), overdue.length ? 'llámalos hoy' : 'todo al día', 'clock')}
      </div>
      <div class="tabs">${[['lista', 'Candidatos', 'users'], ['tablero', 'Tablero por etapas', 'kanban'], ['pendientes', 'Pendientes y entrevistas', 'calendar']].map(([k, l, i]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}"><span class="row" style="gap:6px">${icon(i, 'sm')}${l}</span></button>`).join('')}</div>
      <div id="tabBody"></div>`;

    const body = el.querySelector('#tabBody');
    if (state.tab === 'tablero') renderBoard(body, el, manager, s);
    else if (state.tab === 'pendientes') renderPending(body, el, manager);
    else renderList(body, el, manager, s);

    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(el); });
    el.querySelector('#newBtn').onclick = () => Views.candidato.openForm();
    el.querySelector('#exportBtn').onclick = () => exportCSV(filtered());
    el.querySelector('#importBtn').onclick = openImport;
  }

  const kpi = (label, value, sub, ic) => `<div class="card kpi"><div class="kpi-icon">${icon(ic)}</div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;

  function toolbar(manager, s) {
    return `<div class="toolbar">
      <input class="search" id="q" type="search" placeholder="Buscar nombre, teléfono, ciudad, puesto…" value="${U.esc(state.q)}">
      <select id="fStage"><option value="">Todas las etapas</option>${UI.options(CAND_STAGES, state.stage)}</select>
      <select id="fSource"><option value="">Todas las fuentes</option>${UI.options(s.candidateSources || [], state.source)}</select>
      <select id="fPosition"><option value="">Todos los puestos</option>${UI.options(s.positions || [], state.position)}</select>
      ${manager ? `<select id="fOwner"><option value="">Todo el equipo</option>${UI.userOptions(state.owner)}</select>` : ''}
      ${state.q || state.stage || state.source || state.position || state.owner ? `<button class="btn ghost sm" id="clearF">${icon('x', 'sm')} Limpiar</button>` : ''}
      <span class="spacer"></span><span class="muted small" id="nRes"></span>
    </div>`;
  }
  function bindToolbar(el) {
    const q = el.querySelector('#q');
    if (q) q.addEventListener('input', U.debounce(() => { if (!/^#\/reclutamiento/.test(location.hash)) return; state.q = q.value; render(el); const v = el.querySelector('#q'); v.focus(); v.setSelectionRange(v.value.length, v.value.length); }, 250));
    [['#fStage', 'stage'], ['#fSource', 'source'], ['#fPosition', 'position'], ['#fOwner', 'owner']].forEach(([sel, k]) => { const x = el.querySelector(sel); if (x) x.onchange = () => { state[k] = x.value; render(el); }; });
    const clear = el.querySelector('#clearF');
    if (clear) clear.onclick = () => { Object.assign(state, { q: '', stage: '', source: '', position: '', owner: '' }); render(el); };
  }

  /* ---------- Lista ---------- */
  function renderList(body, el, manager, s) {
    const list = filtered();
    const cols = COLS.filter((c) => !c.manager || manager);
    body.innerHTML = `
      <div class="row wrap" style="margin-bottom:12px;gap:6px">
        ${QUICK.map((x) => { const n = Recruit.mine().filter(x.fn).length; return `<button class="btn sm ${state.quick === x.id ? 'primary' : ''}" data-quick="${x.id}">${x.label} <span class="${state.quick === x.id ? '' : 'muted'}">${n}</span></button>`; }).join('')}
      </div>
      <div class="card">
        ${toolbar(manager, s)}
        <div class="table-wrap"><table class="table">
          <thead><tr>${cols.map((c) => `<th class="sortable" data-sort="${c.id}">${c.label}${state.sort === c.id ? (state.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}<th></th></tr></thead>
          <tbody>${list.length ? list.slice(0, 300).map((c) => row(c, manager)).join('') : `<tr><td colspan="${cols.length + 1}">${UI.empty(Recruit.mine().length ? 'No hay candidatos con estos filtros.' : 'Todavía no hay candidatos. Usa <strong>Nuevo candidato</strong> o <strong>Importar</strong> (por ejemplo, la lista de Indeed).', 'users')}</td></tr>`}</tbody>
        </table></div>
        ${list.length > 300 ? `<div class="small muted" style="padding:10px 16px">Se muestran los primeros 300 de ${U.num(list.length)}. Usa los filtros para encontrar el resto.</div>` : ''}
      </div>`;
    body.querySelector('#nRes').textContent = `${U.num(list.length)} resultados`;
    bindToolbar(el);
    body.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => { state.quick = b.dataset.quick; render(el); });
    body.querySelectorAll('[data-sort]').forEach((th) => th.onclick = () => { if (state.sort === th.dataset.sort) state.dir *= -1; else { state.sort = th.dataset.sort; state.dir = th.dataset.sort === 'callCount' ? -1 : 1; } render(el); });
    body.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('[data-stop]')) return; location.hash = '#/candidato/' + tr.dataset.id; }));
  }

  function attemptsBadge(c) {
    const n = c.callCount || 0, max = Store.maxAttempts();
    return `<span class="badge attempts ${n >= max ? 'bad' : n >= max * 0.75 ? 'warn' : ''}" title="Intentos de contacto">${icon('phone', 'sm')}${n}/${max}</span>`;
  }

  function nextLabel(c) {
    const iv = Recruit.activeInterview(c);
    if (iv) return `<span class="badge ${iv.status === 'confirmada' ? 'good' : 'warn'}">${icon('calendar', 'sm')}Entrevista ${U.date(iv.at, { day: 'numeric', month: 'short' })} ${U.time(iv.at)}</span>`;
    if (!CAND_OPEN.includes(c.stage)) return '<span class="muted">—</span>';
    return UI.followLabel(c.nextFollowUp) + (c.followUpNote ? `<div class="cell-sub">${U.esc(c.followUpNote)}</div>` : '');
  }

  function row(c, manager) {
    const owner = Store.get('users', c.ownerId);
    return `<tr class="clickable stage-row" data-id="${c.id}" style="--row-color:${candStageById(c.stage).color}">
      <td><div class="cell-main">${U.esc(c.name)}</div><div class="cell-sub">${U.esc(c.phone || '')}${c.city ? ' · ' + U.esc(c.city) : ''}${c.state ? ', ' + U.esc(c.state) : ''}</div></td>
      <td class="small">${U.esc(c.position || '—')}${c.language ? `<div class="cell-sub">${U.esc(c.language)}</div>` : ''}</td>
      <td>${Recruit.stageBadge(c.stage)}${c.lastOutcome ? `<div style="margin-top:3px">${Recruit.outcomeBadge(c.lastOutcome)}</div>` : ''}</td>
      <td>${attemptsBadge(c)}</td>
      ${manager ? `<td><div class="row">${UI.avatar(owner)}<span class="small">${U.esc(owner ? owner.name.split(' ')[0] : 'Sin asignar')}</span></div></td>` : ''}
      <td class="small nowrap">${nextLabel(c)}</td>
      <td class="small">${U.esc(c.source || '—')}${c.referredBy ? `<div class="cell-sub">Ref.: ${U.esc(c.referredBy)}</div>` : ''}</td>
      <td data-stop class="nowrap">
        ${c.phone ? `<a class="btn ghost sm icon" href="${U.telLink(c.phone)}" title="Llamar">${icon('phone', 'sm')}</a>
        <a class="btn ghost sm icon" href="${U.waLink(c.phone)}" target="_blank" rel="noopener" title="WhatsApp">${icon('message', 'sm')}</a>` : ''}
      </td>
    </tr>`;
  }

  /* ---------- Tablero ---------- */
  function renderBoard(body, el, manager, s) {
    const list = filtered().filter((c) => state.showClosed || CAND_OPEN.includes(c.stage) || (c.stage === 'contratado' && c.hiredAt && Date.now() - new Date(c.hiredAt).getTime() < 30 * U.DAY));
    const stages = state.showClosed ? CAND_STAGES : CAND_STAGES.filter((x) => !['no_seleccionado', 'sin_respuesta'].includes(x.id));
    body.innerHTML = `
      <div class="card" style="margin-bottom:12px">${toolbar(manager, s)}
        <div class="toolbar" style="border:0"><label class="check small"><input type="checkbox" id="closed" ${state.showClosed ? 'checked' : ''}> Mostrar no seleccionados, sin respuesta y contratados antiguos</label><span class="spacer"></span><span class="small muted">Arrastra las tarjetas para cambiar de etapa</span></div>
      </div>
      <div class="kanban">
        ${stages.map((st) => {
          const cards = U.sortBy(list.filter((c) => c.stage === st.id), (c) => { const iv = Recruit.activeInterview(c); return iv ? iv.at : c.nextFollowUp || '9999'; });
          return `<div class="kcol" data-stage="${st.id}">
            <div class="kcol-head" style="--stage-color:${st.color}"><div class="kcol-title"><span>${st.name}</span><span class="badge">${cards.length}</span></div><div class="kcol-sum">${st.desc}</div></div>
            <div class="kcol-body">${cards.slice(0, 150).map(card).join('') || '<div class="muted small" style="text-align:center;padding:16px">Suelta aquí</div>'}</div>
          </div>`;
        }).join('')}
      </div>`;
    body.querySelector('#nRes').textContent = `${U.num(list.length)} en el tablero`;
    bindToolbar(el);
    body.querySelector('#closed').onchange = (e) => { state.showClosed = e.target.checked; render(el); };
    body.querySelectorAll('.kcard').forEach((k) => {
      k.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('dragging'); });
      k.addEventListener('dragend', () => k.classList.remove('dragging'));
      k.addEventListener('click', () => { location.hash = '#/candidato/' + k.dataset.id; });
    });
    body.querySelectorAll('.kcol').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('drag-over'); const id = e.dataTransfer.getData('text/plain'); if (id) Views.candidato.setStage(id, col.dataset.stage); });
    });
  }

  function card(c) {
    const owner = Store.get('users', c.ownerId);
    return `<div class="kcard" draggable="true" data-id="${c.id}" style="--temp-color:${candStageById(c.stage).color}">
      <div class="row between"><span class="kcard-title">${U.esc(c.name)}</span>${UI.avatar(owner)}</div>
      <div class="kcard-meta">${U.esc(c.position || 'Sin puesto')}${c.source ? ' · ' + U.esc(c.source) : ''}</div>
      <div class="kcard-meta">${attemptsBadge(c)} ${c.lastOutcome ? Recruit.outcomeBadge(c.lastOutcome) : ''}</div>
      <div class="kcard-meta">${nextLabel(c)}</div>
    </div>`;
  }

  /* ---------- Pendientes y entrevistas ---------- */
  function renderPending(body, el, manager) {
    const me = Store.currentUser();
    const scope = manager && state.owner !== '__mine' ? Recruit.mine().filter((c) => !state.owner || c.ownerId === state.owner) : Recruit.all().filter((c) => c.ownerId === me.id);
    const follow = U.sortBy(scope.filter((c) => CAND_OPEN.includes(c.stage) && c.nextFollowUp), (c) => c.nextFollowUp);
    const ivs = U.sortBy(scope.filter((c) => Recruit.activeInterview(c)), (c) => c.interview.at);
    const eod = U.endOfDay(new Date()).getTime();
    const groups = [
      ['Vencidos', follow.filter((c) => new Date(c.nextFollowUp) < new Date())],
      ['Hoy', follow.filter((c) => { const t = new Date(c.nextFollowUp).getTime(); return t >= Date.now() && t <= eod; })],
      ['Próximos', follow.filter((c) => new Date(c.nextFollowUp).getTime() > eod)]
    ];
    body.innerHTML = `
      ${manager ? `<div class="row wrap" style="margin-bottom:12px;gap:8px"><span class="small muted">Ver pendientes de:</span><select id="pOwner" style="width:auto"><option value="">Todo el equipo</option><option value="__mine" ${state.owner === '__mine' ? 'selected' : ''}>Solo los míos</option>${UI.userOptions(state.owner)}</select></div>` : ''}
      <div class="grid cols-2" style="align-items:start">
        <div class="card">
          <div class="card-head"><h2>${icon('clock', 'sm')} Próximos seguimientos</h2><span class="badge">${follow.length}</span></div>
          <div class="card-body flush">
            ${follow.length ? groups.filter(([, l]) => l.length).map(([g, l]) => `<div class="nav-section" style="padding:10px 16px 4px">${g} · ${l.length}</div>${l.slice(0, 60).map(pendItem).join('')}`).join('') : UI.empty('No hay seguimientos programados.', 'check')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('calendar', 'sm')} Entrevistas agendadas</h2><span class="badge">${ivs.length}</span></div>
          <div class="card-body flush">
            ${ivs.length ? ivs.map((c) => { const iv = c.interview; const past = new Date(iv.at) < new Date(); return `<div class="list-item clickable" data-go="${c.id}">
              <div class="appt-when ${past ? 'overdue' : ''}" style="min-width:92px;font-size:12px">${U.date(iv.at, { weekday: 'short', day: 'numeric', month: 'short' })}<strong>${U.time(iv.at)}</strong></div>
              <div class="grow"><div class="title">${U.esc(c.name)}</div><div class="small muted">${U.esc(iv.place || 'Sin lugar')} · Entrevistador: ${U.esc(Recruit.interviewerName(iv))}${manager ? ' · Resp.: ' + U.esc(UI.userName(c.ownerId)) : ''}</div></div>
              <span class="badge ${iv.status === 'confirmada' ? 'good' : 'warn'}">${Recruit.INTERVIEW_STATUS[iv.status]}</span>
            </div>`; }).join('') : UI.empty('No hay entrevistas agendadas.', 'calendar')}
          </div>
        </div>
      </div>`;
    const po = body.querySelector('#pOwner');
    if (po) po.onchange = () => { state.owner = po.value; render(el); };
    body.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => { location.hash = '#/candidato/' + x.dataset.go; });
  }

  function pendItem(c) {
    return `<div class="list-item clickable" data-go="${c.id}">
      <span class="dot" style="width:10px;height:10px;border-radius:50%;background:${candStageById(c.stage).color};flex:none"></span>
      <div class="grow"><div class="title">Llamar a ${U.esc(c.name)}</div><div class="small muted">${U.esc(c.followUpNote || candStageById(c.stage).name)}${Store.can('viewAll') ? ' · ' + U.esc(UI.userName(c.ownerId)) : ''}</div></div>
      <div class="small nowrap" style="text-align:right">${UI.followLabel(c.nextFollowUp)}<div class="cell-sub">${U.dateTime(c.nextFollowUp)}</div></div>
    </div>`;
  }

  /* ---------- Exportar / importar ---------- */
  function exportCSV(list) {
    if (!list.length) return UI.toast('No hay candidatos para exportar', 'bad');
    const yn = Recruit.yesNo;
    const csv = U.toCSV(list, [
      { label: 'Nombre', value: 'name' }, { label: 'Teléfono', value: 'phone' }, { label: 'Teléfono alternativo', value: 'phone2' }, { label: 'Email', value: 'email' },
      { label: 'Ciudad', value: 'city' }, { label: 'Estado', value: 'state' }, { label: 'Idioma', value: 'language' }, { label: 'Puesto solicitado', value: 'position' },
      { label: 'Vehículo propio', value: (c) => yn(c.hasVehicle) }, { label: 'Experiencia en ventas', value: (c) => yn(c.salesExperience) }, { label: 'Fines de semana', value: (c) => yn(c.weekends) },
      { label: 'Fecha disponible', value: 'startDate' }, { label: 'Fuente', value: 'source' }, { label: 'Referido por', value: 'referredBy' },
      { label: 'Etapa', value: (c) => candStageById(c.stage).name }, { label: 'Responsable', value: (c) => UI.userName(c.ownerId) },
      { label: 'Intentos de contacto', value: (c) => c.callCount || 0 }, { label: 'Último resultado', value: (c) => (candOutcomeById(c.lastOutcome) || {}).name || '' },
      { label: 'Entrevista', value: (c) => c.interview && c.interview.at ? `${U.dateTime(c.interview.at)} · ${c.interview.place || ''} · ${Recruit.interviewerName(c.interview)} · ${Recruit.INTERVIEW_STATUS[c.interview.status] || ''}` : '' },
      { label: 'Próximo seguimiento', value: (c) => c.nextFollowUp ? U.dateTime(c.nextFollowUp) : '' }, { label: 'Comentario seguimiento', value: 'followUpNote' },
      { label: 'Notas', value: 'notes' }
    ]);
    U.download(`candidatos-${U.toDateInput(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
    UI.toast(`${list.length} candidatos exportados`, 'good');
  }

  function openImport() {
    const s = Store.settings();
    UI.modal({
      title: 'Importar candidatos (Indeed, Excel o CSV)',
      size: 'lg',
      submitLabel: 'Importar',
      body: `
        <p style="margin:0" class="muted">Descarga los candidatos desde Indeed (o guarda tu Excel) como <strong>CSV</strong> y súbelo aquí. La primera fila debe tener los títulos. Se reconocen: <code>nombre / name, telefono / phone, telefono alternativo, email, ciudad / location, estado, idioma, puesto / job title, fuente, notas</code>.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv">
        <div class="form-grid">
          <label class="field">Asignar a<select name="ownerId">${Store.can('reassign') ? '<option value="__rr">Repartir entre todo el equipo (equitativo)</option>' : ''}${UI.userOptions(Store.currentUser().id)}</select></label>
          <label class="field">Fuente por defecto<select name="source">${UI.options(s.candidateSources || [], 'Indeed')}</select></label>
          <label class="field">Puesto por defecto<select name="position">${UI.options(s.positions || [], '', { blank: '—' })}</select></label>
          <label class="check"><input type="checkbox" name="skipDup" checked> Omitir teléfonos o emails que ya existen</label>
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
        const team = Store.activeUsers();
        const phones = new Set(Recruit.all().map((c) => U.cleanPhone(c.phone).slice(-10)).filter(Boolean));
        const emails = new Set(Recruit.all().map((c) => String(c.email || '').toLowerCase()).filter(Boolean));
        let n = 0, skipped = 0;
        rows.forEach((r, i) => {
          const name = pick(r, 'nombre', 'nombre y apellido', 'nombre completo', 'name', 'candidate name', 'candidato');
          const phone = pick(r, 'telefono', 'phone', 'celular', 'tel', 'movil', 'phone number');
          const email = pick(r, 'email', 'correo', 'e-mail', 'email address').toLowerCase();
          if (!name && !phone && !email) return;
          const key = U.cleanPhone(phone).slice(-10);
          if (d.skipDup && ((key && phones.has(key)) || (email && emails.has(email)))) { skipped++; return; }
          if (key) phones.add(key);
          if (email) emails.add(email);
          let city = pick(r, 'ciudad', 'city', 'candidate location', 'location', 'ubicacion');
          let st = pick(r, 'estado', 'state');
          if (!st && /,/.test(city)) { const parts = city.split(','); city = parts[0].trim(); st = parts[1].trim(); }
          const ownerId = d.ownerId === '__rr' ? team[i % team.length].id : d.ownerId;
          const c = Store.insert('candidates', {
            name: name || phone || email, phone, phone2: pick(r, 'telefono alternativo', 'telefono2', 'telefono 2', 'phone2'), email, city, state: st,
            language: pick(r, 'idioma', 'language'), position: pick(r, 'puesto', 'puesto solicitado', 'job title', 'job', 'position') || d.position,
            source: pick(r, 'fuente', 'source') || d.source, notes: pick(r, 'notas', 'notes', 'observaciones'), referredBy: pick(r, 'referido por', 'referido'), referredByRef: null,
            hasVehicle: null, salesExperience: null, weekends: null, startDate: '',
            stage: 'nuevo', ownerId, callCount: 0, lastOutcome: '', lastContact: null, nextFollowUp: null, followUpNote: '', interview: null
          });
          Recruit.log(c.id, { type: 'sistema', text: `Candidato importado · Fuente: ${c.source}` });
          n++;
        });
        UI.toast(`${n} candidatos importados${skipped ? ` · ${skipped} duplicados omitidos` : ''}`, 'good');
      }
    });
  }

  return { title: 'Reclutamiento', render, myOverdue };
})();

/* =========================================================
   Ficha del candidato
   ========================================================= */
Views.candidato = (() => {
  const draft = {};
  let tlFilter = 'todo';
  const info = (k, v) => `<div class="info-row"><dt>${k}</dt><dd>${v}</dd></div>`;
  const TL = [['todo', 'Todo'], ['contacto', 'Llamadas y mensajes'], ['entrevista', 'Entrevistas'], ['etapa', 'Etapas'], ['comentario', 'Comentarios']];

  function render(el, [id]) {
    const c = Recruit.get(id);
    if (!c) { el.innerHTML = UI.empty('Candidato no encontrado. <a href="#/reclutamiento">Volver a Reclutamiento</a>', 'users'); return; }
    if (!Recruit.canSee(c)) { el.innerHTML = UI.empty('Este candidato está asignado a otra persona.', 'ban'); return; }
    const owner = Store.get('users', c.ownerId);
    const d = draft[id] || (draft[id] = { type: 'llamada', outcome: '', notes: '', followDate: '', followTime: '', followNote: '', comment: '' });
    const me = Store.currentUser();
    const max = Store.maxAttempts();
    const nAtt = c.callCount || 0;
    const st = candStageById(c.stage);
    const stageIdx = CAND_STAGES.findIndex((x) => x.id === c.stage);
    const closed = ['no_seleccionado', 'sin_respuesta'];
    const acts = Recruit.activitiesOf(id).filter((a) => tlFilter === 'todo' || (tlFilter === 'contacto' ? isCandAttempt(a) || ['llamada', 'mensaje', 'email'].includes(a.type) : tlFilter === 'etapa' ? ['etapa', 'asignacion', 'sistema'].includes(a.type) : tlFilter === 'comentario' ? ['comentario', 'seguimiento'].includes(a.type) : a.type === tlFilter));
    const refs = Recruit.referralsOf('candidate', id);
    const s = Store.settings();

    el.innerHTML = `
      <div class="page-head">
        <div class="row" style="gap:12px">
          <a class="btn ghost icon" href="#/reclutamiento" title="Volver">${icon('arrowLeft')}</a>
          <div><h1>${U.esc(c.name)}</h1><p>Candidato · ${U.esc(c.position || 'Sin puesto')} · ${Recruit.stageBadge(c.stage)} · Intentos de contacto: <strong>${nAtt}/${max}</strong></p></div>
        </div>
        <div class="page-actions">
          ${c.phone ? `<a class="btn good" href="${U.telLink(c.phone)}" id="callBtn">${icon('phone', 'sm')} Llamar</a>
          <a class="btn" href="${U.waLink(c.phone, `Hola ${c.name.split(' ')[0]}, le saluda ${me.name.split(' ')[0]} de ${s.companyName}. Le escribo por su solicitud de empleo.`)}" target="_blank" rel="noopener">${icon('message', 'sm')} WhatsApp</a>` : ''}
          ${c.email ? `<a class="btn" href="mailto:${U.esc(c.email)}">${icon('mail', 'sm')} Email</a>` : ''}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:10px">
        <div class="stage-bar cand">
          ${CAND_STAGES.map((x, i) => {
            const cur = x.id === c.stage;
            const done = !closed.includes(c.stage) && i < stageIdx && !closed.includes(x.id);
            const style = cur ? `background:${x.color};color:${x.id === 'entrevistado' ? '#422006' : '#fff'}` : done ? `background:${x.soft};color:${x.ink}` : '';
            return `<button data-stage="${x.id}" class="${cur ? 'current' : done ? 'done' : ''}" style="${style}" title="${x.desc}">${x.name}</button>`;
          }).join('')}
        </div>
      </div></div>

      <div class="detail-grid">
        <div class="stack">
          <div class="card"><div class="card-body stack" style="gap:14px">
            <div class="profile-head">
              <span class="avatar lg" style="background:${st.color}">${U.esc(U.initials(c.name))}</span>
              <div style="min-width:0">
                <div class="call-phone" style="font-size:18px">${U.esc(c.phone || 'Sin teléfono')}</div>
                <div class="row wrap" style="margin-top:4px">${Recruit.stageBadge(c.stage)}</div>
              </div>
            </div>
            <div class="mini-stats">
              <div><span>Último resultado</span><strong>${c.lastOutcome ? Recruit.outcomeBadge(c.lastOutcome) : '—'}</strong></div>
              <div><span>Intentos</span><strong class="num">${nAtt}/${max}</strong></div>
            </div>
            <dl class="info-list" style="margin:0">
              ${info('Responsable', `<span class="row">${UI.avatar(owner)} ${U.esc(owner ? owner.name : 'Sin asignar')}</span>`)}
              ${info('Puesto solicitado', U.esc(c.position || '—'))}
              ${c.phone2 ? info('Tel. alternativo', `<a href="${U.telLink(c.phone2)}">${U.esc(c.phone2)}</a>`) : ''}
              ${info('Email', c.email ? `<a href="mailto:${U.esc(c.email)}">${U.esc(c.email)}</a>` : '—')}
              ${info('Ciudad / Estado', [c.city, c.state].filter(Boolean).map(U.esc).join(', ') || '—')}
              ${info('Idioma', U.esc(c.language || '—'))}
              ${info('Vehículo propio', Recruit.yesNo(c.hasVehicle))}
              ${info('Experiencia en ventas', Recruit.yesNo(c.salesExperience))}
              ${info('Fines de semana', Recruit.yesNo(c.weekends))}
              ${info('Puede comenzar', c.startDate ? U.date(c.startDate + 'T12:00') : '—')}
              ${info('Fuente', U.esc(c.source || '—'))}
              ${c.referredBy || isReferralSource(c.source) ? info('Referido por', c.referredBy ? `<strong>${Recruit.referrerLink(c)}</strong>` : '<span class="muted">Sin registrar</span>') : ''}
              ${info('Último contacto', c.lastContact ? `${U.dateTime(c.lastContact)} <span class="muted">(${U.ago(c.lastContact)})</span>` : 'Nunca')}
              ${info('Registrado', U.dateTime(c.createdAt))}
              ${c.stage === 'contratado' && c.hiredAt ? info('Contratado', U.date(c.hiredAt)) : ''}
              ${closed.includes(c.stage) && c.closeReason ? info('Motivo', `<span style="color:var(--bad)">${U.esc(c.closeReason)}</span>`) : ''}
            </dl>
            ${c.notes ? `<div class="script-box">${U.esc(c.notes)}</div>` : ''}
            <div class="row wrap">
              <button class="btn sm" id="editBtn">${icon('edit', 'sm')} Editar</button>
              ${Store.can('reassign') ? `<select id="reassign" style="width:auto;height:30px;flex:1"><option value="">Reasignar a…</option>${UI.userOptions('')}</select>` : ''}
              ${Store.can('deleteRecords') ? `<button class="btn sm danger icon" id="delBtn" title="Eliminar">${icon('trash', 'sm')}</button>` : ''}
            </div>
          </div></div>
          <div class="card">
            <div class="card-head"><h2>${icon('users', 'sm')} Candidatos que refirió</h2><span class="badge">${refs.length}</span></div>
            <div class="card-body flush">
              ${refs.length ? refs.map((r) => `<div class="list-item clickable" data-go="${r.id}"><div class="grow"><div class="title">${U.esc(r.name)}</div><div class="small muted">${U.esc(r.position || '')} · ${U.date(r.createdAt)}</div></div>${Recruit.stageBadge(r.stage)}</div>`).join('') : '<div class="empty small" style="padding:16px">Nadie todavía. Al crear un candidato con fuente <strong>Referido</strong>, elige a esta persona en "Referido por".</div>'}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card contact-history">
            <div class="card-head">
              <h2>${icon('phone', 'sm')} Intento de contacto</h2>
              <div class="attempt-counter ${nAtt >= max ? 'full' : ''}"><span>Intentos de contacto:</span> <strong>${nAtt}/${max}</strong></div>
            </div>
            <div class="card-body stack" style="gap:14px">
              <div class="attempt-meter"><span style="width:${Math.min(100, (nAtt / max) * 100)}%;background:${st.color}"></span></div>
              ${closed.includes(c.stage) ? `<div class="archived-note">${icon('ban', 'sm')} <div><strong>${st.name}${c.closeReason ? ' · ' + U.esc(c.closeReason) : ''}</strong><div class="small">Se conserva todo el historial. Para reactivarlo, cámbialo de etapa arriba.</div></div></div>` : ''}
              <div class="attempt-form">
                <div class="row between wrap" style="gap:8px">
                  <strong>Registrar intento #${nAtt + 1}${nAtt + 1 <= max ? ` de ${max}` : ''}</strong>
                  <div class="seg" id="typeSeg">${CAND_ATTEMPT_TYPES.map((t) => `<button type="button" data-type="${t}" class="${d.type === t ? 'active' : ''}">${t === 'mensaje' ? 'Mensaje' : CAND_ACTIVITY[t].name}</button>`).join('')}</div>
                </div>
                <div class="small muted">Se guarda solo: <strong>fecha y hora</strong> del momento en que guardes · <strong>Agente:</strong> ${U.esc(me.name)}</div>
                <div class="small muted" style="margin-top:4px">Resultado del intento</div>
                <div class="outcomes">${CAND_OUTCOMES.map((o) => `<button type="button" class="outcome-btn ${d.outcome === o.id ? 'selected' : ''}" data-outcome="${o.id}"><span class="dot" style="background:${o.color}"></span>${o.name}</button>`).join('')}</div>
                <label class="field" style="margin-top:4px">Comentario<textarea id="actNotes" rows="2" placeholder="Ej.: Contestó, puede venir a entrevista el martes en la mañana.">${U.esc(d.notes)}</textarea></label>
                <div class="small muted">Próximo seguimiento <span class="hint">(opcional · si lo dejas vacío se programa solo según el resultado)</span></div>
                <div class="row wrap" style="gap:8px">
                  <input type="date" id="fDate" style="width:auto;height:32px" value="${U.esc(d.followDate)}" aria-label="Fecha del seguimiento">
                  <input type="time" id="fTime" style="width:auto;height:32px" value="${U.esc(d.followTime)}" aria-label="Hora del seguimiento">
                  <input id="fNote" style="flex:1;min-width:160px;height:32px" placeholder="Comentario del seguimiento" value="${U.esc(d.followNote)}">
                </div>
                <div class="row wrap">
                  ${[['Mañana', 1], ['3 días', 3], ['1 semana', 7]].map(([l, n]) => `<button type="button" class="btn xs" data-follow="${n}">${l}</button>`).join('')}
                  <span class="spacer"></span>
                  <button class="btn primary" id="saveAct">${icon('check', 'sm')} Guardar intento</button>
                </div>
                <div class="small muted" id="outcomeHint"></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>${icon('clock', 'sm')} Historial</h2>
              <div class="seg" id="tlSeg" style="flex-wrap:wrap;max-width:100%">${TL.map(([k, l]) => `<button data-tl="${k}" class="${tlFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
            </div>
            <div class="card-body" style="padding-top:12px;padding-bottom:4px">
              <div class="row" style="gap:8px;align-items:flex-start">
                <textarea id="commentText" rows="1" placeholder="Escribe un comentario sobre este candidato…" style="min-height:38px">${U.esc(d.comment)}</textarea>
                <button class="btn" id="saveComment">${icon('note', 'sm')} Agregar comentario</button>
              </div>
              ${acts.length ? `<div class="timeline">${acts.map(tlItem).join('')}</div>` : UI.empty('Sin movimientos en este filtro.')}
            </div>
          </div>
        </div>

        <div class="stack detail-right">
          ${interviewCard(c)}
          ${followCard(c)}
        </div>
      </div>`;

    bind(el, c, d);
  }

  function tlItem(a) {
    const t = CAND_ACTIVITY[a.type] || CAND_ACTIVITY.sistema;
    const o = candOutcomeById(a.outcome);
    const colors = { etapa: 'var(--violet)', comentario: 'var(--warm)', entrevista: '#9333ea', seguimiento: 'var(--info, #2563eb)' };
    const canDel = (Store.isAdmin() || a.userId === Store.currentUser().id) && a.type === 'comentario';
    return `<div class="tl-item">
      <div class="tl-icon" style="${o ? `color:${o.color}` : colors[a.type] ? `color:${colors[a.type]}` : ''}">${icon(t.icon, 'sm')}</div>
      <div>
        <div class="tl-head"><strong>${a.attempt ? `Intento #${a.attempt} · ` : ''}${a.type === 'entrevista' && a.kind ? 'Entrevista ' + a.kind : t.name}</strong>${o ? Recruit.outcomeBadge(a.outcome) : ''}
          <span class="muted small">· ${U.esc(UI.userName(a.userId))} · ${U.date(a.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${U.time(a.createdAt)}</span>
          ${canDel ? `<button class="btn ghost xs icon" data-del-act="${a.id}" title="Eliminar" style="margin-left:auto">${icon('trash', 'sm')}</button>` : ''}
          ${Store.isAdmin() && isCandAttempt(a) ? `<button class="btn ghost xs icon" data-del-att="${a.id}" title="Eliminar intento (solo administración)" style="margin-left:auto">${icon('trash', 'sm')}</button>` : ''}
        </div>
        ${a.text ? `<div class="tl-text">${U.esc(a.text)}</div>` : ''}
      </div></div>`;
  }

  function interviewCard(c) {
    const iv = Recruit.activeInterview(c);
    const last = !iv && c.interview ? c.interview : null;
    if (!iv) {
      return `<div class="card">
        <div class="card-head"><h2>${icon('calendar', 'sm')} Entrevista</h2><button class="btn sm" data-iv="new">${icon('plus', 'sm')} Agendar entrevista</button></div>
        <div class="card-body small ${last ? '' : 'muted'}">${last ? `<div>Última entrevista: <strong>${U.dateTime(last.at)}</strong> · ${Recruit.INTERVIEW_STATUS[last.status] || ''}</div>
          <div class="muted">${U.esc(last.place || '')} · Entrevistador: ${U.esc(Recruit.interviewerName(last))}</div>
          ${last.resultNotes ? `<div class="script-box" style="margin-top:8px"><strong>Notas de la entrevista:</strong><br>${U.esc(last.resultNotes)}</div>` : ''}` : 'Sin entrevista agendada.'}</div>
      </div>`;
    }
    const past = new Date(iv.at) < new Date();
    return `<div class="card appt-card">
      <div class="card-head"><h2>${icon('calendar', 'sm')} Entrevista</h2><span class="badge ${iv.status === 'confirmada' ? 'good' : 'warn'}">${Recruit.INTERVIEW_STATUS[iv.status]}</span></div>
      <div class="card-body stack" style="gap:10px">
        <div class="appt-when ${past ? 'overdue' : ''}">${U.date(iv.at, { weekday: 'long', day: 'numeric', month: 'long' })}<strong>${U.time(iv.at)}</strong></div>
        <dl class="info-list" style="margin:0">
          ${info('Lugar', iv.place ? U.esc(iv.place) : '<span class="muted">Sin lugar</span>')}
          ${info('Entrevistador', `<strong>${U.esc(Recruit.interviewerName(iv))}</strong>`)}
          ${iv.notes ? info('Notas', U.esc(iv.notes)) : ''}
        </dl>
        <div class="row wrap">
          ${iv.status === 'agendada' ? `<button class="btn sm primary" data-iv="confirmada">${icon('check', 'sm')} Confirmar</button>` : ''}
          <button class="btn sm ${iv.status === 'confirmada' ? 'primary' : ''}" data-iv="realizada">${icon('flag', 'sm')} Entrevista realizada</button>
          <button class="btn sm" data-iv="edit">${icon('clock', 'sm')} Reagendar</button>
          <button class="btn sm ghost danger" data-iv="cancelada">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function followCard(c) {
    const open = CAND_OPEN.includes(c.stage);
    const v = c.nextFollowUp ? U.toLocalInput(c.nextFollowUp) : '';
    return `<div class="card">
      <div class="card-head"><h2>${icon('clock', 'sm')} Seguimiento</h2>${c.nextFollowUp && open ? UI.followLabel(c.nextFollowUp) : ''}</div>
      <div class="card-body stack" style="gap:10px">
        ${c.nextFollowUp && open ? `<div><strong>${U.dateTime(c.nextFollowUp)}</strong>${c.followUpNote ? `<div class="small muted">${U.esc(c.followUpNote)}</div>` : ''}</div>` : `<div class="small muted">${open ? 'Sin próximo seguimiento.' : 'El candidato no está en proceso.'}</div>`}
        <div class="form-grid" style="gap:8px">
          <label class="field">Fecha<input type="date" id="sfDate" value="${v.slice(0, 10)}"></label>
          <label class="field">Hora<input type="time" id="sfTime" value="${v.slice(11, 16)}"></label>
          <label class="field full">Comentario<input id="sfNote" value="${U.esc(c.followUpNote || '')}" placeholder="Ej.: Llamar para confirmar documentos"></label>
        </div>
        <div class="row"><button class="btn sm primary" id="sfSave">${icon('check', 'sm')} Guardar seguimiento</button>${c.nextFollowUp ? '<button class="btn sm ghost" id="sfClear">Quitar</button>' : ''}</div>
      </div>
    </div>`;
  }

  function bind(el, c, d) {
    const id = c.id;
    const $ = (s) => el.querySelector(s);
    $('#actNotes').oninput = (e) => { d.notes = e.target.value; };
    $('#fDate').onchange = (e) => { d.followDate = e.target.value; showHint(); };
    $('#fTime').onchange = (e) => { d.followTime = e.target.value; };
    $('#fNote').oninput = (e) => { d.followNote = e.target.value; };

    function showHint() {
      const o = candOutcomeById(d.outcome);
      const h = $('#outcomeHint');
      if (!o) { h.textContent = ''; return; }
      const bits = [];
      const order = CAND_STAGES.map((x) => x.id);
      if (o.stage && CAND_OPEN.includes(c.stage) && order.indexOf(o.stage) > order.indexOf(c.stage)) bits.push(`mover a <strong>${candStageById(o.stage).name}</strong>`);
      if (o.followDays && !d.followDate) bits.push(`programar seguimiento en <strong>${o.followDays} día(s)</strong>`);
      if (o.interview) bits.push('abrir el formulario para agendar la <strong>entrevista</strong>');
      if (o.lose) bits.push(`pasarlo a <strong>${candStageById(o.lose).name}</strong>`);
      bits.push('guardar el intento con fecha, hora y agente, y sumar 1 al contador');
      h.innerHTML = 'Al guardar se va a: ' + bits.join(', ') + '.';
    }
    showHint();

    el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { d.type = b.dataset.type; el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === b)); });
    el.querySelectorAll('[data-outcome]').forEach((b) => b.onclick = () => {
      d.outcome = d.outcome === b.dataset.outcome ? '' : b.dataset.outcome;
      el.querySelectorAll('[data-outcome]').forEach((x) => x.classList.toggle('selected', x.dataset.outcome === d.outcome));
      showHint();
    });
    el.querySelectorAll('[data-follow]').forEach((b) => b.onclick = () => {
      const t = U.addDays(new Date(), Number(b.dataset.follow));
      d.followDate = U.toDateInput(t); d.followTime = d.followTime || '10:00';
      $('#fDate').value = d.followDate; $('#fTime').value = d.followTime; showHint();
    });
    $('#saveAct').onclick = () => {
      if (!d.outcome) return UI.toast('Selecciona el resultado del intento', 'bad');
      const n = (Recruit.get(id).callCount || 0) + 1;
      const at = d.followDate ? new Date(`${d.followDate}T${d.followTime || '10:00'}`).toISOString() : undefined;
      const outcome = d.outcome;
      Recruit.logAttempt(id, { outcome, type: d.type, notes: d.notes.trim(), nextFollowUp: at, followNote: d.followNote.trim() });
      draft[id] = { type: d.type, outcome: '', notes: '', followDate: '', followTime: '', followNote: '', comment: d.comment };
      const after = Recruit.get(id);
      UI.toast(after.stage === 'sin_respuesta' && n >= Store.maxAttempts() ? `Intento #${n} guardado · se completaron ${Store.maxAttempts()} intentos: pasó a Sin respuesta` : `Intento #${n} guardado`, 'good');
      if ((candOutcomeById(outcome) || {}).interview) setTimeout(() => openInterview(id), 60);
    };
    $('#commentText').oninput = (e) => { d.comment = e.target.value; };
    $('#saveComment').onclick = () => {
      if (!d.comment.trim()) return UI.toast('Escribe el comentario', 'bad');
      Recruit.log(id, { type: 'comentario', text: d.comment.trim() });
      d.comment = '';
      UI.toast('Comentario agregado', 'good');
    };
    el.querySelectorAll('[data-tl]').forEach((b) => b.onclick = () => { tlFilter = b.dataset.tl; render(el, [id]); });
    el.querySelectorAll('[data-stage]').forEach((b) => b.onclick = () => setStage(id, b.dataset.stage));
    el.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => { location.hash = '#/candidato/' + x.dataset.go; });
    el.querySelectorAll('[data-del-act]').forEach((b) => b.onclick = async () => { if (await UI.confirm('¿Eliminar este comentario del historial?')) Store.remove('candidateActivities', b.dataset.delAct); });
    el.querySelectorAll('[data-del-att]').forEach((b) => b.onclick = async () => {
      if (!(await UI.confirm('¿Eliminar este intento del historial? El contador de intentos se recalcula.'))) return;
      Store.remove('candidateActivities', b.dataset.delAtt);
      const rest = Recruit.attemptsOf(id);
      const last = rest[rest.length - 1];
      Store.update('candidates', id, { callCount: rest.length, lastOutcome: last ? last.outcome : '', lastContact: last ? last.createdAt : null });
    });
    el.querySelectorAll('[data-iv]').forEach((b) => b.onclick = async () => {
      const act = b.dataset.iv;
      if (act === 'new' || act === 'edit') return openInterview(id);
      if (act === 'realizada') return interviewDone(id);
      if (act === 'cancelada' && !(await UI.confirm('¿Cancelar esta entrevista?', { okLabel: 'Sí, cancelar entrevista' }))) return;
      Recruit.setInterviewStatus(id, act);
      UI.toast({ confirmada: 'Entrevista confirmada', cancelada: 'Entrevista cancelada' }[act], 'good');
    });
    $('#sfSave').onclick = () => {
      const dt = $('#sfDate').value;
      if (!dt) return UI.toast('Elige la fecha del seguimiento', 'bad');
      const at = new Date(`${dt}T${$('#sfTime').value || '10:00'}`);
      if (isNaN(at)) return UI.toast('Fecha u hora no válida', 'bad');
      Recruit.setFollowUp(id, at.toISOString(), $('#sfNote').value.trim());
      UI.toast('Seguimiento guardado', 'good');
    };
    const sfClear = $('#sfClear');
    if (sfClear) sfClear.onclick = () => { Recruit.setFollowUp(id, null, ''); UI.toast('Seguimiento quitado'); };
    $('#editBtn').onclick = () => openForm(id);
    const re = $('#reassign');
    if (re) re.onchange = () => { if (re.value) { Recruit.reassign([id], re.value); UI.toast('Candidato asignado a ' + UI.userName(re.value), 'good'); } };
    const del = $('#delBtn');
    if (del) del.onclick = async () => {
      if (!(await UI.confirm(`¿Eliminar a <strong>${U.esc(c.name)}</strong> y todo su historial? Esta acción no se puede deshacer.`))) return;
      Recruit.remove(id); location.hash = '#/reclutamiento'; UI.toast('Candidato eliminado');
    };
  }

  /* ---------- Cambios de etapa ---------- */
  function setStage(id, stage) {
    const c = Recruit.get(id);
    if (!c || c.stage === stage) return;
    if (!Recruit.canSee(c)) return;
    const iv = Recruit.activeInterview(c);
    if (stage === 'no_seleccionado' || stage === 'sin_respuesta') {
      UI.modal({
        title: `Pasar a ${candStageById(stage).name}`, size: 'sm', submitLabel: 'Guardar', danger: true,
        body: `<label class="field">Motivo<select name="reason">${UI.options(stage === 'sin_respuesta' ? ['Nunca contestó', 'Número incorrecto', 'Dejó de responder', 'Otro'] : ['No asistió a la entrevista', 'No cumple el perfil', 'No le interesa el puesto', 'Horario no compatible', 'Aceptó otro empleo', 'Otro'], '')}</select></label>
               <label class="field">Comentario<textarea name="note" rows="2"></textarea></label>`,
        onSubmit: (f) => { Recruit.changeStage(id, stage, { closeReason: f.reason }); if (f.note) Recruit.log(id, { type: 'comentario', text: f.note }); }
      });
      return;
    }
    if (['entrevista_agendada', 'entrevista_confirmada'].includes(stage) && !iv) return openInterview(id, { confirmAfter: stage === 'entrevista_confirmada' });
    if (stage === 'entrevista_confirmada' && iv) return Recruit.setInterviewStatus(id, 'confirmada');
    if (stage === 'entrevistado' && iv) return interviewDone(id);
    Recruit.changeStage(id, stage);
    if (stage === 'contratado') UI.toast('¡Bienvenido(a) al equipo! 🎉', 'good');
  }

  function openInterview(id, { confirmAfter = false } = {}) {
    const c = Recruit.get(id);
    if (!c) return;
    const iv = Recruit.activeInterview(c);
    const def = iv ? new Date(iv.at) : (() => { const x = U.addDays(new Date(), 1); x.setHours(10, 0, 0, 0); return x; })();
    const who = iv ? (iv.interviewerId || (iv.interviewerName ? '__otro' : '')) : Store.currentUser().id;
    UI.modal({
      title: `${iv ? 'Reagendar' : 'Agendar'} entrevista · ${U.esc(c.name)}`,
      submitLabel: iv ? 'Guardar nueva fecha' : 'Agendar entrevista',
      body: `
        <div class="form-grid">
          <label class="field">Fecha *<input name="date" type="date" required value="${U.toDateInput(def)}"></label>
          <label class="field">Hora *<input name="time" type="time" required value="${U.toLocalInput(def).slice(11, 16)}"></label>
          <label class="field full">Lugar *<input name="place" required value="${U.esc(iv ? iv.place : '')}" placeholder="Dirección de la oficina, tienda o enlace de videollamada"></label>
          <label class="field">Entrevistador *<select name="who" id="ivWho" required>${UI.userOptions(who, { blank: 'Seleccionar…' })}<option value="__otro" ${who === '__otro' ? 'selected' : ''}>Otra persona…</option></select></label>
          <label class="field ${who === '__otro' ? '' : 'hidden'}" id="ivOtherWrap">Nombre del entrevistador<input name="whoName" value="${U.esc(iv ? iv.interviewerName : '')}"></label>
          <label class="field full">Notas de la entrevista <span class="hint">(opcional)</span><textarea name="notes" rows="2" placeholder="Qué documentos traer, a quién preguntar al llegar…">${U.esc(iv ? iv.notes : '')}</textarea></label>
        </div>
        <p class="small muted" style="margin:0">Se programa un seguimiento para confirmar la entrevista el día anterior.</p>`,
      onOpen: (form) => { const sel = form.querySelector('#ivWho'); sel.onchange = () => form.querySelector('#ivOtherWrap').classList.toggle('hidden', sel.value !== '__otro'); },
      onSubmit: (f) => {
        const at = new Date(`${f.date}T${f.time}`);
        if (isNaN(at)) { UI.toast('Fecha u hora no válida', 'bad'); return false; }
        if (f.who === '__otro' && !f.whoName) { UI.toast('Escribe el nombre del entrevistador', 'bad'); return false; }
        Recruit.saveInterview(id, { at: at.toISOString(), place: f.place, interviewerId: f.who === '__otro' ? '' : f.who, interviewerName: f.who === '__otro' ? f.whoName : '', notes: f.notes });
        if (confirmAfter) Recruit.setInterviewStatus(id, 'confirmada');
        UI.toast(iv ? 'Entrevista reagendada' : 'Entrevista agendada', 'good');
      }
    });
  }

  function interviewDone(id) {
    const c = Recruit.get(id);
    UI.modal({
      title: `Entrevista realizada · ${U.esc(c.name)}`, size: 'sm', submitLabel: 'Guardar',
      body: `<label class="field">Notas de la entrevista<textarea name="notes" rows="4" placeholder="Cómo le fue, actitud, experiencia, disponibilidad…"></textarea></label>
             <label class="field">Resultado<select name="result"><option value="">Pendiente de decidir</option><option value="califica">Califica</option><option value="no_seleccionado">No seleccionado</option></select></label>`,
      onSubmit: (f) => {
        Recruit.setInterviewStatus(id, 'realizada', f.notes);
        if (f.result === 'califica') Recruit.changeStage(id, 'califica', { nextFollowUp: new Date(Date.now() + U.DAY).toISOString(), followUpNote: 'Agendar entrenamiento' });
        if (f.result === 'no_seleccionado') Recruit.changeStage(id, 'no_seleccionado', { closeReason: 'No pasó la entrevista' });
        UI.toast('Entrevista registrada', 'good');
      }
    });
  }

  /* ---------- Formulario del candidato ---------- */
  function openForm(id) {
    const c = id ? Recruit.get(id) : { stage: 'nuevo', ownerId: Store.currentUser().id, state: 'FL', source: 'Indeed' };
    const s = Store.settings();
    const withCur = (list, v) => (!v || list.includes(v) ? list : list.concat(v));
    const sources = withCur(s.candidateSources || [], c.source);
    const positions = withCur(s.positions || [], c.position);
    const languages = withCur(s.languages || [], c.language);
    const refOpts = Recruit.referrerOptions(id);
    const curRef = c.referredByRef && refOpts.find((o) => o.type === c.referredByRef.type && o.id === c.referredByRef.id);
    const yn = (name, v, label) => `<label class="field">${label}<select name="${name}"><option value="">—</option><option value="si" ${v === true ? 'selected' : ''}>Sí</option><option value="no" ${v === false ? 'selected' : ''}>No</option></select></label>`;
    const fv = c.nextFollowUp ? U.toLocalInput(c.nextFollowUp) : '';
    UI.modal({
      title: id ? 'Editar candidato' : 'Nuevo candidato',
      size: 'lg',
      submitLabel: id ? 'Guardar cambios' : 'Crear candidato',
      body: `
        <div class="form-grid">
          <label class="field">Nombre y apellido *<input name="name" required value="${U.esc(c.name)}"></label>
          <label class="field">Teléfono *<input name="phone" type="tel" required value="${U.esc(c.phone)}"></label>
          <label class="field">Teléfono alternativo<input name="phone2" type="tel" value="${U.esc(c.phone2)}"></label>
          <label class="field">Email<input name="email" type="email" value="${U.esc(c.email)}"></label>
          <div class="form-grid cols-3 full">
            <label class="field">Ciudad<input name="city" value="${U.esc(c.city)}"></label>
            <label class="field">Estado<input name="state" value="${U.esc(c.state)}" placeholder="FL"></label>
            <label class="field">Idioma<select name="language">${UI.options(languages, c.language, { blank: '—' })}</select></label>
          </div>
          <label class="field">Puesto solicitado<select name="position">${UI.options(positions, c.position, { blank: 'Seleccionar…' })}</select></label>
          <label class="field">Fecha disponible para comenzar<input name="startDate" type="date" value="${U.esc(c.startDate)}"></label>
          <div class="form-grid cols-3 full">
            ${yn('hasVehicle', c.hasVehicle, 'Vehículo propio')}
            ${yn('salesExperience', c.salesExperience, 'Experiencia en ventas')}
            ${yn('weekends', c.weekends, 'Disponibilidad fines de semana')}
          </div>
          <div class="form-section full">Fuente</div>
          <label class="field">¿Cómo llegó?<select name="source" id="cSrc">${UI.options(sources, c.source, { blank: 'Seleccionar…' })}</select></label>
          <label class="field ${isReferralSource(c.source) ? '' : 'hidden'}" id="cRefWrap">Referido por *<input name="referredBy" list="refList" autocomplete="off" value="${U.esc(curRef ? curRef.label : c.referredBy)}" placeholder="Escribe y elige de la lista">
            <span class="hint">Elige a la persona de la lista (equipo, candidato o cliente) para dejarla conectada.</span></label>
          <datalist id="refList">${refOpts.map((o) => `<option value="${U.esc(o.label)}"></option>`).join('')}</datalist>
          <div class="form-section full">Proceso</div>
          <label class="field">Etapa<select name="stage">${UI.options(CAND_STAGES, candStageById(c.stage).id)}</select></label>
          <label class="field">Responsable <span class="hint">(reclutador/agente asignado)</span><select name="ownerId" ${Store.can('reassign') ? '' : 'disabled'}>${UI.userOptions(c.ownerId)}</select></label>
          ${id ? '' : `<label class="field">Próximo seguimiento · fecha<input name="fDate" type="date" value="${fv.slice(0, 10)}"></label>
          <label class="field">Hora<input name="fTime" type="time" value="${fv.slice(11, 16)}"></label>
          <label class="field full">Comentario del seguimiento<input name="fNote" value="${U.esc(c.followUpNote || '')}" placeholder="Ej.: Llamar en la tarde"></label>`}
          <label class="field full">Notas<textarea name="notes" rows="3">${U.esc(c.notes)}</textarea></label>
        </div>`,
      onOpen: (form) => {
        const src = form.querySelector('#cSrc');
        src.onchange = () => { form.querySelector('#cRefWrap').classList.toggle('hidden', !isReferralSource(src.value)); if (isReferralSource(src.value)) form.querySelector('[name=referredBy]').focus(); };
      },
      onSubmit: (f) => {
        const isRef = isReferralSource(f.source);
        if (isRef && !f.referredBy) { UI.toast('Escribe quién lo refirió', 'bad'); return false; }
        const phoneKey = U.cleanPhone(f.phone).slice(-10);
        const dup = phoneKey.length >= 7 && Recruit.all().find((x) => x.id !== id && U.cleanPhone(x.phone).slice(-10) === phoneKey);
        if (dup && !id && !window.confirm(`Ya existe un candidato con ese teléfono: ${dup.name} (${UI.userName(dup.ownerId)}). ¿Crear de todas formas?`)) return false;
        // "Referido por" conectado: se guarda el nombre y a quién corresponde (equipo, candidato o cliente)
        let referredBy = '', referredByRef = null;
        if (isRef) {
          const v = f.referredBy.trim();
          const byLabel = refOpts.find((o) => o.label === v);
          const byName = refOpts.filter((o) => U.normalize(o.name) === U.normalize(v));
          const hit = byLabel || (byName.length === 1 ? byName[0] : null);
          referredBy = hit ? hit.name : v;
          referredByRef = hit ? { type: hit.type, id: hit.id } : null;
        }
        const toBool = (v) => (v === 'si' ? true : v === 'no' ? false : null);
        const data = {
          name: f.name, phone: f.phone, phone2: f.phone2, email: f.email, city: f.city, state: f.state, language: f.language, position: f.position,
          startDate: f.startDate, hasVehicle: toBool(f.hasVehicle), salesExperience: toBool(f.salesExperience), weekends: toBool(f.weekends),
          source: f.source, referredBy, referredByRef, notes: f.notes,
          ownerId: Store.can('reassign') ? f.ownerId : (c.ownerId || Store.currentUser().id)
        };
        if (id) {
          Store.update('candidates', id, data);
          if (data.ownerId !== c.ownerId) Recruit.log(id, { type: 'asignacion', text: `Asignado a ${UI.userName(data.ownerId)}` });
          if (f.stage !== candStageById(c.stage).id) setTimeout(() => setStage(id, f.stage), 80);
          UI.toast('Candidato actualizado', 'good');
        } else {
          const at = f.fDate ? new Date(`${f.fDate}T${f.fTime || '10:00'}`).toISOString() : null;
          const n = Store.insert('candidates', Object.assign(data, { stage: 'nuevo', callCount: 0, lastOutcome: '', lastContact: null, nextFollowUp: at, followUpNote: at ? f.fNote : '', interview: null }));
          Recruit.log(n.id, { type: 'sistema', text: `Candidato registrado${f.source ? ' · Fuente: ' + f.source : ''}${referredBy ? ' · Referido por: ' + referredBy : ''}` });
          if (at) Recruit.log(n.id, { type: 'seguimiento', text: `Próximo seguimiento: ${U.dateTime(at)}${f.fNote ? ' · ' + f.fNote : ''}` });
          if (f.stage !== 'nuevo') setTimeout(() => setStage(n.id, f.stage), 80);
          UI.toast('Candidato creado', 'good');
          location.hash = '#/candidato/' + n.id;
        }
      }
    });
  }

  return { title: 'Candidato', render, setStage, openForm, openInterview };
})();
