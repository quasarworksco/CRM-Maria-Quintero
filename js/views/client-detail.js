/* =========================================================
   Ficha del cliente
   ========================================================= */
Views.cliente = (() => {
  const draft = {}; // borradores de notas por cliente (sobreviven re-render)
  let tlFilter = 'todo';

  function render(el, [id]) {
    const c = Store.get('clients', id);
    if (!c) { el.innerHTML = UI.empty('Cliente no encontrado. <a href="#/clientes">Volver</a>', 'users'); return; }
    if (!Store.canSeeClient(c)) { el.innerHTML = UI.empty('Este cliente está asignado a otro agente.', 'ban'); return; }
    const owner = Store.get('users', c.ownerId);
    const d = draft[id] || (draft[id] = { type: 'llamada', outcome: '', notes: '', follow: '' });
    const orders = U.sortBy(Store.clientOrders(id), (o) => o.createdAt, -1);
    const revenue = Store.clientRevenue(id);
    const balance = Store.clientBalance(id);
    const tasks = U.sortBy(Store.where('tasks', (t) => t.clientId === id), (t) => (t.done ? '1' : '0') + t.due);
    const acts = U.sortBy(Store.where('activities', (a) => a.clientId === id), (a) => a.createdAt, -1)
      .filter((a) => tlFilter === 'todo' || (tlFilter === 'llamadas' ? ['llamada', 'whatsapp', 'email', 'visita'].includes(a.type) : tlFilter === 'notas' ? a.type === 'nota' : ['venta', 'pago'].includes(a.type)));
    const products = Store.all('products');
    const s = Store.settings();
    const stageIdx = STAGES.findIndex((x) => x.id === c.stage);

    el.innerHTML = `
      <div class="page-head">
        <div class="row" style="gap:12px">
          <a class="btn ghost icon" href="#/clientes" title="Volver">${icon('arrowLeft')}</a>
          <div><h1>${U.esc(c.name)}</h1><p>${c.company ? U.esc(c.company) + ' · ' : ''}Cliente desde ${U.date(c.createdAt)} · ${c.callCount || 0} intento${c.callCount === 1 ? '' : 's'} de contacto</p></div>
        </div>
        <div class="page-actions">
          <a class="btn good" href="${U.telLink(c.phone)}" id="callBtn">${icon('phone', 'sm')} Llamar</a>
          <a class="btn" href="${U.waLink(c.phone, `Hola ${c.name.split(' ')[0]}, le saluda ${Store.currentUser().name.split(' ')[0]} de ${s.companyName}.`)}" target="_blank" rel="noopener">${icon('message', 'sm')} WhatsApp</a>
          ${c.email ? `<a class="btn" href="mailto:${U.esc(c.email)}">${icon('mail', 'sm')} Email</a>` : ''}
          <button class="btn primary" id="saleBtn">${icon('cart', 'sm')} Nueva venta</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:10px">
        <div class="stage-bar">
          ${STAGES.map((st, i) => {
            let cls = '';
            if (c.stage === 'perdido') cls = st.id === 'perdido' ? 'lost' : '';
            else if (st.id === c.stage) cls = c.stage === 'ganado' ? 'won' : 'current';
            else if (i < stageIdx && st.id !== 'perdido') cls = 'done';
            return `<button data-stage="${st.id}" class="${cls}" title="${st.desc}">${st.name}</button>`;
          }).join('')}
        </div>
      </div></div>

      <div class="detail-grid">
        <!-- Columna izquierda: perfil -->
        <div class="stack">
          <div class="card"><div class="card-body stack" style="gap:14px">
            <div class="profile-head">
              <span class="avatar lg" style="background:${stageById(c.stage).color}">${U.esc(U.initials(c.name))}</span>
              <div style="min-width:0">
                <div class="call-phone" style="font-size:18px">${U.esc(c.phone)}</div>
                <div class="row wrap" style="margin-top:4px">${UI.stageBadge(c.stage)} ${c.dnc ? `<span class="badge bad">${icon('ban', 'sm')} No llamar</span>` : ''}</div>
              </div>
            </div>
            <div class="mini-stats">
              <div><span>Último resultado</span><strong>${c.lastOutcome ? UI.outcomeBadge(c.lastOutcome) : '—'}</strong></div>
              <div><span>Intentos</span><strong class="num">${c.callCount || 0}</strong></div>
            </div>
            <dl class="info-list" style="margin:0">
              ${info('Responsable', `<span class="row">${UI.avatar(owner)} ${U.esc(owner ? owner.name : 'Sin asignar')}</span>`)}
              ${info('Seguimiento', OPEN_STAGES.includes(c.stage) ? UI.followLabel(c.nextFollowUp) : '—')}
              ${info('Último contacto', c.lastContact ? `${U.dateTime(c.lastContact)} <span class="muted">(${U.ago(c.lastContact)})</span>` : 'Nunca')}
              ${info('Fuente', U.esc(c.source || '—'))}
              ${c.referredBy || isReferralSource(c.source) ? info('Referido por', c.referredBy ? `<strong>${U.esc(c.referredBy)}</strong>` : '<span class="muted">Sin registrar</span>') : ''}
              ${c.eventName || isEventSource(c.source) ? info('Evento', c.eventName ? U.esc(c.eventName) : '<span class="muted">Sin registrar</span>') : ''}
              ${c.phone2 ? info('Tel. alterno', `<a href="${U.telLink(c.phone2)}">${U.esc(c.phone2)}</a>`) : ''}
              ${info('Email', c.email ? `<a href="mailto:${U.esc(c.email)}">${U.esc(c.email)}</a>` : '—')}
              ${info('Dirección', [c.address, c.city, c.state, c.zip].filter(Boolean).map(U.esc).join(', ') + (c.address ? ` <a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent([c.address, c.city, c.state, c.zip].join(' '))}">Mapa</a>` : '') || '—')}
              ${info('Hogar', [c.acUnits ? c.acUnits + ' A/C' : '', c.householdSize ? c.householdSize + ' personas' : '', c.pets ? 'Mascotas' : '', c.allergies ? 'Alergias/asma' : ''].filter(Boolean).join(' · ') || '—')}
              ${info('Preferencia', [c.preferredContact, c.bestTime].filter(Boolean).map(U.esc).join(' · ') || '—')}
              ${c.birthday ? info('Cumpleaños', U.date(c.birthday + 'T12:00', { day: 'numeric', month: 'long' })) : ''}
              ${c.stage === 'perdido' && c.lostReason ? info('Motivo pérdida', `<span style="color:var(--bad)">${U.esc(c.lostReason)}</span>`) : ''}
            </dl>
            ${c.notes ? `<div class="script-box">${U.esc(c.notes)}</div>` : ''}
            <div class="row wrap">
              <button class="btn sm" id="editBtn">${icon('edit', 'sm')} Editar</button>
              ${Store.can('reassign') ? `<select id="reassign" style="width:auto;height:30px;flex:1"><option value="">Reasignar a…</option>${UI.userOptions('')}</select>` : ''}
              ${Store.can('deleteRecords') ? `<button class="btn sm danger icon" id="delBtn" title="Eliminar">${icon('trash', 'sm')}</button>` : ''}
            </div>
          </div></div>

          <div class="card">
            <div class="card-head"><h2>Productos de interés</h2></div>
            <div class="card-body row wrap" style="gap:6px">
              ${(c.interests || []).length ? c.interests.map((pid) => { const p = products.find((x) => x.id === pid); return p ? `<span class="badge info">${U.esc(p.name)} · ${U.money(p.price)}</span>` : ''; }).join('') : '<span class="muted small">Ninguno registrado</span>'}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>${icon('paperclip', 'sm')} Archivos y fotos</h2><label class="btn sm">${icon('upload', 'sm')} Subir<input type="file" id="attach" hidden multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"></label></div>
            <div class="card-body flush">
              ${(c.attachments || []).length ? c.attachments.map((f, i) => `
                <div class="list-item">
                  ${/image/.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.url) ? `<img src="${U.esc(f.url)}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px">` : `<div class="tl-icon">${icon('file', 'sm')}</div>`}
                  <div class="grow"><a class="title" href="${U.esc(f.url)}" target="_blank" rel="noopener">${U.esc(f.name || 'Archivo')}</a><div class="small muted">${U.date(f.at)} · ${U.esc(UI.userName(f.by))}</div></div>
                  <button class="btn ghost sm icon" data-rm-file="${i}" title="Quitar">${icon('x', 'sm')}</button>
                </div>`).join('') : `<div class="empty small">${UI.cloudinaryReady() ? 'Sube fotos del equipo, facturas o contratos.' : 'Configura Cloudinary en <code>js/config.js</code> para subir archivos. Mientras tanto puedes pegar un enlace.'}<br><button class="btn xs" id="addLink" style="margin-top:8px">Agregar enlace</button></div>`}
            </div>
          </div>
        </div>

        <!-- Columna central: registrar + historial -->
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Registrar interacción</h2>
              <div class="seg" id="typeSeg">${['llamada', 'whatsapp', 'email', 'visita', 'nota'].map((t) => `<button type="button" data-type="${t}" class="${d.type === t ? 'active' : ''}">${ACTIVITY_TYPES[t].name}</button>`).join('')}</div>
            </div>
            <div class="card-body stack" style="gap:12px">
              ${d.type !== 'nota' ? `
                <div class="small muted">¿Cómo fue el contacto?</div>
                <div class="outcomes">${OUTCOMES.map((o) => `<button type="button" class="outcome-btn ${d.outcome === o.id ? 'selected' : ''}" data-outcome="${o.id}"><span class="dot" style="background:${o.color}"></span>${o.name}</button>`).join('')}</div>` : ''}
              <textarea id="actNotes" rows="3" placeholder="${d.type === 'nota' ? 'Escribe una nota…' : '¿Qué se habló? Objeciones, productos, acuerdos…'}">${U.esc(d.notes)}</textarea>
              <div class="row wrap">
                <span class="small muted">Próximo seguimiento:</span>
                <input type="datetime-local" id="actFollow" style="width:auto;height:32px" value="${U.esc(d.follow)}">
                ${[['Mañana', 1], ['3 días', 3], ['1 semana', 7], ['2 semanas', 14], ['1 mes', 30]].map(([l, n]) => `<button type="button" class="btn xs" data-follow="${n}">${l}</button>`).join('')}
                <span class="spacer"></span>
                <button class="btn primary" id="saveAct">${icon('check', 'sm')} Guardar</button>
              </div>
              <div class="small muted" id="outcomeHint"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Historial</h2>
              <div class="seg" id="tlSeg">${[['todo', 'Todo'], ['llamadas', 'Contactos'], ['notas', 'Notas'], ['dinero', 'Ventas y pagos']].map(([k, l]) => `<button data-tl="${k}" class="${tlFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
            </div>
            <div class="card-body" style="padding-top:4px;padding-bottom:4px">
              ${acts.length ? `<div class="timeline">${acts.map(tlItem).join('')}</div>` : UI.empty('Sin actividad registrada todavía.')}
            </div>
          </div>
        </div>

        <!-- Columna derecha: dinero y tareas -->
        <div class="stack detail-right">
          ${apptCard(c)}
          <div class="card">
            <div class="card-head"><h2>Resumen financiero</h2></div>
            <div class="card-body grid cols-3" style="gap:8px;text-align:center">
              <div><div class="small muted">Comprado</div><strong class="num">${U.money(revenue)}</strong></div>
              <div><div class="small muted">Pagado</div><strong class="num" style="color:var(--good)">${U.money(revenue - balance)}</strong></div>
              <div><div class="small muted">Saldo</div><strong class="num" style="color:${balance > 0 ? 'var(--bad)' : 'inherit'}">${U.money(balance)}</strong></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Ventas</h2><button class="btn sm" id="saleBtn2">${icon('plus', 'sm')} Venta</button></div>
            <div class="card-body flush">
              ${orders.length ? orders.map((o) => `
                <div class="list-item clickable" data-order="${o.id}">
                  <div class="grow"><div class="title">${U.esc(o.number)} · ${U.money(o.total)}</div>
                  <div class="small muted">${U.date(o.createdAt)} · ${o.items.length} producto(s)</div></div>
                  <div style="text-align:right">${UI.payBadge(o)}<div class="small" style="margin-top:3px">${UI.orderStatusBadge(o.status)}</div></div>
                </div>`).join('') : UI.empty('Aún no ha comprado.', 'cart')}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Tareas</h2><button class="btn sm" id="taskBtn">${icon('plus', 'sm')} Tarea</button></div>
            <div class="card-body flush">
              ${tasks.length ? tasks.map((t) => Views.agenda.taskItem(t, { hideClient: true })).join('') : UI.empty('Sin tareas.', 'check')}
            </div>
          </div>
        </div>
      </div>`;

    bind(el, c, d);
  }

  const info = (k, v) => `<div class="info-row"><dt>${k}</dt><dd>${v}</dd></div>`;

  function tlItem(a) {
    const t = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.sistema;
    const o = outcomeById(a.outcome);
    const colors = { venta: 'var(--good)', pago: 'var(--good)', etapa: 'var(--violet)', nota: 'var(--warm)' };
    return `<div class="tl-item">
      <div class="tl-icon" style="${colors[a.type] ? `color:${colors[a.type]}` : o ? `color:${o.color}` : ''}">${icon(t.icon, 'sm')}</div>
      <div>
        <div class="tl-head"><strong>${t.name}</strong>${o ? UI.outcomeBadge(a.outcome) : ''}${a.duration && o && o.contact ? `<span class="muted small">${U.duration(a.duration)}</span>` : ''}
          <span class="muted small">· ${U.esc(UI.userName(a.userId))} · ${U.dateTime(a.createdAt)}</span>
          ${(Store.isAdmin() || a.userId === Store.currentUser().id) && ['llamada', 'whatsapp', 'email', 'visita', 'nota'].includes(a.type) ? `<button class="btn ghost xs icon" data-del-act="${a.id}" title="Eliminar" style="margin-left:auto">${icon('trash', 'sm')}</button>` : ''}
        </div>
        ${a.text ? `<div class="tl-text">${U.esc(a.text)}</div>` : ''}
      </div></div>`;
  }

  function bind(el, c, d) {
    const id = c.id;
    const $ = (s) => el.querySelector(s);
    const notes = $('#actNotes');
    const follow = $('#actFollow');
    notes.oninput = () => { d.notes = notes.value; };
    follow.onchange = () => { d.follow = follow.value; };

    const showHint = () => {
      const o = outcomeById(d.outcome);
      const h = $('#outcomeHint');
      if (!o) { h.textContent = ''; return; }
      const bits = [];
      if (o.stage && o.stage !== c.stage) bits.push(`mover a <strong>${stageById(o.stage).name}</strong>`);
      if (o.followDays && !d.follow) bits.push(`programar seguimiento en <strong>${o.followDays} día(s)</strong>`);
      if (o.appointment) bits.push('abrir el formulario para agendar la <strong>cita</strong>');
      if (o.reschedule) bits.push(Store.activeAppointment(c) ? 'abrir la <strong>cita</strong> para cambiarle la fecha' : 'dejar el seguimiento en la fecha que elijas');
      bits.push('sumar un intento y guardar la fecha y hora del contacto');
      h.innerHTML = bits.length ? 'Al guardar se va a: ' + bits.join(', ') + '.' : '';
    };
    showHint();

    el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { d.type = b.dataset.type; if (d.type === 'nota') d.outcome = ''; render(el, [id]); });
    el.querySelectorAll('[data-outcome]').forEach((b) => b.onclick = () => {
      d.outcome = d.outcome === b.dataset.outcome ? '' : b.dataset.outcome;
      el.querySelectorAll('[data-outcome]').forEach((x) => x.classList.toggle('selected', x.dataset.outcome === d.outcome));
      showHint();
    });
    el.querySelectorAll('[data-follow]').forEach((b) => b.onclick = () => {
      const t = U.addDays(new Date(), Number(b.dataset.follow)); t.setHours(10, 0, 0, 0);
      d.follow = U.toLocalInput(t); follow.value = d.follow; showHint();
    });
    $('#saveAct').onclick = () => {
      if (d.type === 'nota') {
        if (!d.notes.trim()) return UI.toast('Escribe la nota', 'bad');
        Store.logActivity({ clientId: id, type: 'nota', text: d.notes.trim() });
        if (d.follow) Store.update('clients', id, { nextFollowUp: U.fromInput(d.follow) });
      } else {
        if (!d.outcome) return UI.toast('Selecciona el resultado del contacto', 'bad');
        const o = outcomeById(d.outcome);
        Store.logCall(id, { outcome: d.outcome, type: d.type, notes: d.notes.trim(), nextFollowUp: d.follow ? U.fromInput(d.follow) : undefined, duration: 0 });
        afterOutcome(id, o.id);
      }
      draft[id] = { type: d.type, outcome: '', notes: '', follow: '' };
      UI.toast('Interacción registrada', 'good');
    };

    el.querySelectorAll('[data-tl]').forEach((b) => b.onclick = () => { tlFilter = b.dataset.tl; render(el, [id]); });
    el.querySelectorAll('[data-stage]').forEach((b) => b.onclick = () => setStage(id, b.dataset.stage));
    el.querySelectorAll('[data-appt]').forEach((b) => b.onclick = async () => {
      const act = b.dataset.appt;
      if (act === 'new' || act === 'edit') return openAppointment(id);
      if (act === 'cancelada' && !(await UI.confirm('¿Cancelar esta cita?', { okLabel: 'Sí, cancelar cita' }))) return;
      Store.setAppointmentStatus(id, act);
      UI.toast({ confirmada: 'Cita confirmada', realizada: 'Demostración registrada', cancelada: 'Cita cancelada' }[act], 'good');
    });
    el.querySelectorAll('[data-del-act]').forEach((b) => b.onclick = async () => { if (await UI.confirm('¿Eliminar esta actividad del historial?')) Store.remove('activities', b.dataset.delAct); });
    el.querySelectorAll('[data-order]').forEach((x) => x.onclick = () => Views.ventas.openOrderDetail(x.dataset.order));
    Views.agenda.bindTaskItems(el);

    $('#editBtn').onclick = () => Views.clientes.openForm(id);
    $('#saleBtn').onclick = $('#saleBtn2').onclick = () => Views.ventas.openOrderForm({ clientId: id });
    $('#taskBtn').onclick = () => Views.agenda.openTaskForm({ clientId: id });
    $('#callBtn').addEventListener('click', () => { d.type = 'llamada'; setTimeout(() => notes.focus(), 300); });
    const re = $('#reassign');
    if (re) re.onchange = () => { if (re.value) { Store.reassign([id], re.value); UI.toast('Cliente reasignado a ' + UI.userName(re.value), 'good'); } };
    const del = $('#delBtn');
    if (del) del.onclick = async () => {
      if (!(await UI.confirm(`¿Eliminar a <strong>${U.esc(c.name)}</strong> y todo su historial? Las ventas y pagos se conservan.`))) return;
      Store.deleteClient(id); location.hash = '#/clientes'; UI.toast('Cliente eliminado');
    };

    // Archivos (Cloudinary)
    const attach = $('#attach');
    attach.onchange = async () => {
      const files = [...attach.files];
      if (!files.length) return;
      if (!UI.cloudinaryReady()) { UI.toast('Configura Cloudinary en js/config.js', 'bad'); return; }
      UI.toast('Subiendo ' + files.length + ' archivo(s)…');
      try {
        const up = [];
        for (const f of files) up.push(Object.assign(await UI.uploadToCloudinary(f, 'clientes/' + id), { at: new Date().toISOString(), by: Store.currentUser().id }));
        Store.update('clients', id, { attachments: [...(Store.get('clients', id).attachments || []), ...up] });
        UI.toast('Archivos subidos', 'good');
      } catch (e) { UI.toast(e.message, 'bad'); }
    };
    const addLink = $('#addLink');
    if (addLink) addLink.onclick = () => UI.modal({
      title: 'Agregar enlace', size: 'sm',
      body: `<label class="field">Nombre<input name="name" required placeholder="Factura, foto del equipo…"></label><label class="field">URL<input name="url" type="url" required placeholder="https://…"></label>`,
      onSubmit: (f) => { Store.update('clients', id, { attachments: [...(c.attachments || []), { name: f.name, url: f.url, type: 'link', at: new Date().toISOString(), by: Store.currentUser().id }] }); }
    });
    el.querySelectorAll('[data-rm-file]').forEach((b) => b.onclick = async () => {
      if (!(await UI.confirm('¿Quitar este archivo de la ficha?'))) return;
      const list = [...(c.attachments || [])]; list.splice(Number(b.dataset.rmFile), 1);
      Store.update('clients', id, { attachments: list });
    });
  }

  function setStage(id, stage) {
    const c = Store.get('clients', id);
    if (c.stage === stage) return;
    if (stage === 'perdido') {
      UI.modal({
        title: 'Marcar como perdido / sin respuesta', size: 'sm', submitLabel: 'Marcar perdido', danger: true,
        body: `<label class="field">¿Por qué se perdió?<select name="reason" required>${UI.options(Store.settings().lostReasons, '', { blank: 'Seleccionar motivo…' })}</select></label>
               <label class="field">Comentario<textarea name="note" rows="2"></textarea></label>`,
        onSubmit: (f) => { Store.changeStage(id, 'perdido', { lostReason: f.reason, nextFollowUp: null }); if (f.note) Store.logActivity({ clientId: id, type: 'nota', text: f.note }); }
      });
      return;
    }
    const appt = Store.activeAppointment(c);
    // Las etapas de cita necesitan una cita con fecha, hora y dirección
    if (APPT_STAGES.includes(stage) && !appt) return openAppointment(id, { confirmAfter: stage === 'cita_confirmada' });
    if (stage === 'cita_confirmada' && appt) return Store.setAppointmentStatus(id, 'confirmada');
    if (stage === 'demo_realizada' && appt) return Store.setAppointmentStatus(id, 'realizada');
    Store.changeStage(id, stage);
    if (stage === 'ganado' && !Store.clientOrders(id).length) {
      UI.toast('¡Felicitaciones! Registra la venta 🎉', 'good');
      setTimeout(() => Views.ventas.openOrderForm({ clientId: id }), 100);
    }
  }

  // Acciones que siguen a un resultado de llamada
  function afterOutcome(id, outcome) {
    const o = outcomeById(outcome);
    if (!o) return;
    const c = Store.get('clients', id);
    if (o.appointment || (o.reschedule && Store.activeAppointment(c))) setTimeout(() => openAppointment(id), 60);
  }

  /* ---------- Cita: fecha, hora, dirección y quién hace la demostración ---------- */
  function apptCard(c) {
    const a = Store.activeAppointment(c);
    const last = !a && c.appointment ? c.appointment : null;
    if (!a) {
      return `<div class="card">
        <div class="card-head"><h2>${icon('calendar', 'sm')} Cita</h2><button class="btn sm" data-appt="new">${icon('plus', 'sm')} Agendar cita</button></div>
        <div class="card-body small muted">${last ? `Última cita: ${U.dateTime(last.at)} · <strong>${Store.APPT_STATUS[last.status] || ''}</strong>` : 'Sin cita agendada.'}</div>
      </div>`;
    }
    const past = new Date(a.at) < new Date();
    const map = a.address ? ` <a target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(a.address)}">Mapa</a>` : '';
    return `<div class="card appt-card">
      <div class="card-head"><h2>${icon('calendar', 'sm')} Cita</h2><span class="badge ${a.status === 'confirmada' ? 'good' : 'warn'}">${Store.APPT_STATUS[a.status]}</span></div>
      <div class="card-body stack" style="gap:10px">
        <div class="appt-when ${past ? 'overdue' : ''}">${U.date(a.at, { weekday: 'long', day: 'numeric', month: 'long' })}<strong>${U.time(a.at)}</strong></div>
        <dl class="info-list" style="margin:0">
          ${info('Dirección', a.address ? U.esc(a.address) + map : '<span class="muted">Sin dirección</span>')}
          ${info('Demostración', `<strong>${U.esc(Store.demoByName(a))}</strong>`)}
          ${a.notes ? info('Notas', U.esc(a.notes)) : ''}
        </dl>
        <div class="row wrap">
          ${a.status === 'agendada' ? `<button class="btn sm primary" data-appt="confirmada">${icon('check', 'sm')} Confirmar</button>` : ''}
          <button class="btn sm ${a.status === 'confirmada' ? 'primary' : ''}" data-appt="realizada">${icon('flag', 'sm')} Demo realizada</button>
          <button class="btn sm" data-appt="edit">${icon('clock', 'sm')} Reagendar</button>
          <button class="btn sm ghost danger" data-appt="cancelada">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function openAppointment(id, { confirmAfter = false } = {}) {
    const c = Store.get('clients', id);
    if (!c) return;
    const a = Store.activeAppointment(c);
    const def = a ? new Date(a.at) : (() => { const d = U.addDays(new Date(), 1); d.setHours(10, 0, 0, 0); return d; })();
    const addr = a ? a.address : [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ');
    const demoBy = a ? (a.demoBy || (a.demoByName ? '__otro' : '')) : c.ownerId;
    UI.modal({
      title: `${a ? 'Reagendar' : 'Agendar'} cita · ${U.esc(c.name)}`,
      submitLabel: a ? 'Guardar nueva fecha' : 'Agendar cita',
      body: `
        <div class="form-grid">
          <label class="field">Fecha *<input name="date" type="date" required value="${U.toDateInput(def)}"></label>
          <label class="field">Hora *<input name="time" type="time" required value="${U.toLocalInput(def).slice(11, 16)}"></label>
          <label class="field full">Dirección de la cita *<input name="address" required value="${U.esc(addr)}" placeholder="Dirección donde se hará la demostración"></label>
          <label class="field">¿Quién realizará la demostración? *<select name="demoBy" id="demoBySel" required>${UI.userOptions(demoBy, { blank: 'Seleccionar…' })}<option value="__otro" ${demoBy === '__otro' ? 'selected' : ''}>Otra persona…</option></select></label>
          <label class="field ${demoBy === '__otro' ? '' : 'hidden'}" id="demoOtherWrap">Nombre de quien hará la demostración<input name="demoByName" value="${U.esc(a ? a.demoByName : '')}"></label>
          <label class="field full">Notas para la cita <span class="hint">(opcional)</span><textarea name="notes" rows="2" placeholder="Referencias de la dirección, productos a mostrar…">${U.esc(a ? a.notes : '')}</textarea></label>
        </div>
        <p class="small muted" style="margin:0">Se programa un seguimiento para confirmar la cita el día anterior.</p>`,
      onOpen: (form) => {
        const sel = form.querySelector('#demoBySel');
        sel.onchange = () => form.querySelector('#demoOtherWrap').classList.toggle('hidden', sel.value !== '__otro');
      },
      onSubmit: (f) => {
        const at = new Date(`${f.date}T${f.time}`);
        if (isNaN(at)) { UI.toast('Fecha u hora no válida', 'bad'); return false; }
        if (f.demoBy === '__otro' && !f.demoByName) { UI.toast('Escribe quién hará la demostración', 'bad'); return false; }
        Store.saveAppointment(id, { at: at.toISOString(), address: f.address, demoBy: f.demoBy === '__otro' ? '' : f.demoBy, demoByName: f.demoBy === '__otro' ? f.demoByName : '', notes: f.notes });
        if (confirmAfter) Store.setAppointmentStatus(id, 'confirmada');
        UI.toast(a ? 'Cita reagendada' : 'Cita agendada', 'good');
      }
    });
  }

  // Registro rápido tras marcar desde la lista
  function quickLog(id) {
    const c = Store.get('clients', id);
    if (!c) return;
    UI.modal({
      title: `Resultado de la llamada · ${U.esc(c.name)}`,
      body: `<div class="outcomes">${OUTCOMES.map((o) => `<label class="outcome-btn"><input type="radio" name="outcome" value="${o.id}" hidden><span class="dot" style="background:${o.color}"></span>${o.name}</label>`).join('')}</div>
             <label class="field">Notas<textarea name="notes" rows="3"></textarea></label>
             <label class="field">Próximo seguimiento <span class="hint">(fecha y hora · si lo dejas vacío se programa solo según el resultado)</span><input type="datetime-local" name="follow"></label>`,
      onOpen: (form) => form.querySelectorAll('.outcome-btn').forEach((l) => l.addEventListener('click', () => { form.querySelectorAll('.outcome-btn').forEach((x) => x.classList.remove('selected')); l.classList.add('selected'); })),
      onSubmit: (f) => {
        if (!f.outcome) { UI.toast('Selecciona un resultado', 'bad'); return false; }
        Store.logCall(id, { outcome: f.outcome, notes: f.notes, nextFollowUp: f.follow ? U.fromInput(f.follow) : undefined });
        UI.toast('Llamada registrada', 'good');
        afterOutcome(id, f.outcome);
      }
    });
  }

  return { title: 'Cliente', render, setStage, quickLog, openAppointment, afterOutcome };
})();
