/* =========================================================
   Modo llamadas — cola de marcación para agentes
   ========================================================= */
Views.llamadas = (() => {
  const st = { queue: 'smart', currentId: null, timerStart: null, elapsed: 0, outcome: '', notes: '', follow: '', skipped: new Set(), session: { calls: 0, contacts: 0, talk: 0, sales: 0 }, showScript: true };
  let tick = null;

  const QUEUES = {
    smart: { label: 'Prioridad inteligente', desc: 'Vencidos → hoy → citas por confirmar → nuevos → reintentos → olvidados' },
    follow: { label: 'Seguimientos de hoy', desc: 'Seguimientos vencidos y programados para hoy' },
    nuevos: { label: 'Nuevos sin contactar', desc: 'Prospectos a los que nunca se ha llamado' },
    citas: { label: 'Citas por confirmar', desc: 'Clientes con cita agendada que falta confirmar' },
    retry: { label: 'Reintentar no contestados', desc: 'No contestaron en el último intento' },
    cobro: { label: 'Cobranza', desc: 'Clientes con saldo pendiente' }
  };

  function priority(c) {
    const now = Date.now();
    const f = c.nextFollowUp ? new Date(c.nextFollowUp).getTime() : null;
    if (f && f < U.startOfDay().getTime()) return 0;           // vencidos
    if (f && f <= now) return 1;                                // ya es la hora
    if (f && f <= U.endOfDay().getTime()) return 2;             // hoy
    const a = Store.activeAppointment(c);
    if (a && a.status === 'agendada' && new Date(a.at).getTime() - now < 2 * U.DAY) return 3;
    if (c.stage === 'nuevo' && !c.callCount) return 4;
    if (c.stage === 'intentando' && (!c.lastCallAt || now - new Date(c.lastCallAt).getTime() > 3 * 3600000)) return 5;
    if (Store.isStale(c)) return 6;
    return 9;
  }

  function buildQueue() {
    const me = Store.currentUser();
    // En modo llamadas cada quien trabaja su propia cartera (los managers ven la suya también)
    let list = Store.all('clients').filter((c) => c.ownerId === me.id && !c.dnc && !st.skipped.has(c.id));
    const eod = U.endOfDay().getTime();
    switch (st.queue) {
      case 'follow': list = list.filter((c) => OPEN_STAGES.includes(c.stage) && c.nextFollowUp && new Date(c.nextFollowUp).getTime() <= eod); return U.sortBy(list, (c) => c.nextFollowUp);
      case 'nuevos': list = list.filter((c) => c.stage === 'nuevo' && !c.callCount); return U.sortBy(list, (c) => c.createdAt);
      case 'citas': list = list.filter((c) => { const a = Store.activeAppointment(c); return a && a.status === 'agendada'; }); return U.sortBy(list, (c) => Store.activeAppointment(c).at);
      case 'retry': list = list.filter((c) => OPEN_STAGES.includes(c.stage) && c.noAnswerCount > 0 && (!c.lastCallAt || Date.now() - new Date(c.lastCallAt).getTime() > 3 * 3600000)); return U.sortBy(list, (c) => c.lastCallAt || '');
      case 'cobro': list = list.filter((c) => Store.clientBalance(c.id) > 0); return U.sortBy(list, (c) => Store.clientBalance(c.id), -1);
      default:
        list = list.filter((c) => OPEN_STAGES.includes(c.stage) && priority(c) < 9 && !(c.nextFollowUp && new Date(c.nextFollowUp).getTime() > eod && c.lastCallAt && U.isToday(c.lastCallAt)));
        return U.sortBy(list, (c) => priority(c) * 1000 - Store.leadScore(c));
    }
  }

  function fillScript(text, c) {
    const s = Store.settings();
    const me = Store.currentUser();
    return text.replace(/\{nombre\}/g, c.name.split(' ')[0]).replace(/\{agente\}/g, me.name.split(' ')[0]).replace(/\{empresa\}/g, s.companyName).replace(/\{ciudad\}/g, c.city || 'su ciudad');
  }

  function render(el) {
    if (st.queue === 'cobro' && !Store.can('finance')) st.queue = 'smart';
    const queue = buildQueue();
    if (!st.currentId || !queue.find((c) => c.id === st.currentId)) { st.currentId = queue[0] ? queue[0].id : null; resetCall(); }
    const c = st.currentId && Store.get('clients', st.currentId);
    const me = Store.currentUser();
    const today = Metrics.forUser(me.id, U.startOfDay(), U.endOfDay());

    el.innerHTML = `
      <div class="page-head">
        <div><h1>Modo llamadas</h1><p>${QUEUES[st.queue].desc}</p></div>
        <div class="page-actions">
          <select id="queueSel" style="width:auto">${Object.entries(QUEUES).filter(([k]) => k !== 'cobro' || Store.can('finance')).map(([k, q]) => `<option value="${k}" ${k === st.queue ? 'selected' : ''}>${q.label}</option>`).join('')}</select>
          ${st.skipped.size ? `<button class="btn" id="unskip">Restaurar ${st.skipped.size} saltados</button>` : ''}
          ${Store.isAdmin() ? `<a class="btn" href="#/productividad">${icon('target', 'sm')} Productividad del equipo</a>` : ''}
        </div>
      </div>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-label">Llamadas hoy</div><div class="kpi-value">${today.calls}<span class="muted" style="font-size:15px"> / ${me.callGoal || '—'}</span></div>
          ${me.callGoal ? `<div class="progress ${today.calls >= me.callGoal ? 'good' : ''}"><span style="width:${Math.min(100, (today.calls / me.callGoal) * 100)}%"></span></div>` : ''}</div>
        <div class="card kpi"><div class="kpi-label">Contactos efectivos</div><div class="kpi-value">${today.contacts}</div><div class="kpi-sub">${U.pct(today.contactRate)} de las llamadas</div></div>
        <div class="card kpi"><div class="kpi-label">En esta sesión</div><div class="kpi-value">${st.session.calls}</div><div class="kpi-sub">${st.session.contacts} contactos · ${U.duration(st.session.talk)} al teléfono</div></div>
        <div class="card kpi"><div class="kpi-label">En cola</div><div class="kpi-value">${queue.length}</div><div class="kpi-sub">${st.session.sales} citas agendadas en la sesión</div></div>
      </div>
      <div class="call-layout">
        <div class="stack">
          ${c ? callCard(c) : `<div class="card">${!Store.all('clients').some((x) => x.ownerId === me.id)
            ? UI.empty(`No tienes clientes asignados a tu nombre. El modo llamadas trabaja la cartera propia de cada usuario.${Store.can('reassign') ? ' Puedes asignarte prospectos desde <a href="#/clientes">Clientes</a> o usar “Ver como” en el panel de administración para ver la cola de un agente.' : ''}`, 'users')
            : UI.empty(`¡Excelente! No quedan llamadas en “${QUEUES[st.queue].label}”. Prueba otra cola o <a href="#/clientes">agrega prospectos</a>.`, 'check')}</div>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>Siguientes en la cola</h2><span class="muted small">${queue.length}</span></div>
          <div style="max-height:640px;overflow:auto">
            ${queue.slice(0, 60).map((x) => `
              <div class="queue-item ${x.id === st.currentId ? 'current' : ''}" data-pick="${x.id}">
                <div class="grow" style="min-width:0;flex:1">
                  <div class="title" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.esc(x.name)}</div>
                  <div class="small muted">${x.callCount || 0}/${Store.maxAttempts()} intentos · ${x.nextFollowUp ? UI.followLabel(x.nextFollowUp) : x.callCount ? stageById(x.stage).name : 'Nunca llamado'}</div>
                </div>
                ${Store.activeAppointment(x) ? UI.apptBadge(x) : UI.stageBadge(x.stage)}
              </div>`).join('') || UI.empty('Cola vacía')}
          </div>
        </div>
      </div>`;
    bind(el, c);
  }

  function callCard(c) {
    const lastActs = U.sortBy(Store.where('activities', (a) => a.clientId === c.id), (a) => a.createdAt, -1).slice(0, 4);
    const products = (c.interests || []).map((id) => Store.get('products', id)).filter(Boolean);
    const balance = Store.can('finance') ? Store.clientBalance(c.id) : 0;
    return `
      <div class="card">
        <div class="card-body stack" style="gap:16px">
          <div class="call-card-head">
            <span class="avatar lg" style="background:${stageById(c.stage).color}">${U.esc(U.initials(c.name))}</span>
            <div style="flex:1;min-width:200px">
              <div class="row wrap"><h2 style="font-size:20px">${U.esc(c.name)}</h2>${UI.stageBadge(c.stage)}${UI.attempts(c)}${UI.apptBadge(c)}${c.lastOutcome ? UI.outcomeBadge(c.lastOutcome) : ''}</div>
              <div class="call-phone">${U.esc(c.phone)}</div>
              <div class="small muted">${[c.city, c.source, `Este será el intento #${(c.callCount || 0) + 1} de ${Store.maxAttempts()}`, c.lastContact ? 'Último contacto: ' + U.dateTime(c.lastContact) : '', c.referredBy ? 'Referido por ' + c.referredBy : '', c.bestTime ? 'Prefiere: ' + c.bestTime : ''].filter(Boolean).map(U.esc).join(' · ')}</div>
            </div>
            <div class="stack" style="gap:8px;align-items:flex-end">
              <div class="timer ${st.timerStart ? 'running' : ''}" id="timer">${U.duration(currentElapsed())}</div>
              <div class="row">
                <a class="btn good" href="${U.telLink(c.phone)}" id="dial">${icon('phone', 'sm')} Llamar</a>
                <a class="btn icon" href="${U.waLink(c.phone)}" target="_blank" rel="noopener" title="WhatsApp">${icon('message', 'sm')}</a>
                <a class="btn icon" href="#/cliente/${c.id}" title="Abrir ficha">${icon('user', 'sm')}</a>
              </div>
            </div>
          </div>
          ${balance > 0 ? `<div class="badge bad" style="padding:8px 12px;font-size:13px">${icon('wallet', 'sm')} Tiene saldo pendiente de ${U.money(balance)}</div>` : ''}
          ${c.notes || products.length || c.allergies || c.pets || c.housing || c.preferredContact ? `<div class="row wrap small">${products.map((p) => `<span class="badge info">${U.esc(p.name)}</span>`).join('')}${c.allergies === true ? '<span class="badge warn">Alergias/asma</span>' : ''}${c.pets === true ? '<span class="badge">Mascotas</span>' : ''}${c.housing ? `<span class="badge">${labelOf(HOUSING, c.housing)}</span>` : ''}${c.preferredContact ? `<span class="badge">Prefiere ${U.esc(c.preferredContact)}</span>` : ''}</div>${c.notes ? `<div class="script-box">${U.esc(c.notes)}</div>` : ''}` : ''}

          <div>
            <div class="row between" style="margin-bottom:6px"><strong class="small">Guion de llamada</strong><button class="btn ghost xs" id="toggleScript">${st.showScript ? 'Ocultar' : 'Mostrar'}</button></div>
            ${st.showScript ? `<div class="script-box">${U.esc(fillScript(Store.settings().callScript, c))}</div>` : ''}
          </div>

          <div>
            <strong class="small">Resultado del intento #${(c.callCount || 0) + 1}</strong>
            <div class="outcomes" style="margin-top:8px">${OUTCOMES.map((o, i) => { const k = i < 9 ? String(i + 1) : i === 9 ? '0' : ''; return `<button type="button" class="outcome-btn ${st.outcome === o.id ? 'selected' : ''}" data-outcome="${o.id}" ${k ? `title="Atajo: tecla ${k}"` : ''}><span class="dot" style="background:${o.color}"></span>${o.name}<span class="muted small" style="margin-left:auto">${k}</span></button>`; }).join('')}</div>
          </div>
          <textarea id="cNotes" rows="3" placeholder="Comentario del intento…">${U.esc(st.notes)}</textarea>
          <div class="row wrap">
            <span class="small muted" id="cFollowLbl">Próximo seguimiento${(outcomeById(st.outcome) || {}).requireFollow ? ' <strong style="color:var(--bad)">(obligatorio)</strong>' : ''}:</span>
            ${UI.followPicker('cFollow', st.follow)}
            <span class="spacer"></span>
            <button class="btn" id="skip">${icon('skip', 'sm')} Saltar</button>
            <button class="btn primary" id="saveNext">${icon('check', 'sm')} Guardar y siguiente</button>
          </div>

          ${lastActs.length ? `<div><strong class="small">Últimas interacciones</strong><div class="timeline">${lastActs.map((a) => `
            <div class="tl-item" style="padding:8px 0"><div class="tl-icon">${icon((ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.sistema).icon, 'sm')}</div>
            <div><div class="tl-head">${a.outcome ? UI.outcomeBadge(a.outcome) : `<strong>${(ACTIVITY_TYPES[a.type] || {}).name || ''}</strong>`}<span class="muted small">${U.esc(UI.userName(a.userId))} · ${U.ago(a.createdAt)}</span></div>${a.text ? `<div class="tl-text">${U.esc(a.text)}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
        </div>
      </div>`;
  }

  const currentElapsed = () => st.elapsed + (st.timerStart ? (Date.now() - st.timerStart) / 1000 : 0);
  function resetCall() { st.timerStart = null; st.elapsed = 0; st.outcome = ''; st.notes = ''; st.follow = ''; if (typeof Store !== 'undefined' && Store.setCallActive) Store.setCallActive(false); }

  function bind(el, c) {
    clearInterval(tick);
    const $ = (s) => el.querySelector(s);
    $('#queueSel').onchange = (e) => { st.queue = e.target.value; st.currentId = null; render(el); };
    if ($('#unskip')) $('#unskip').onclick = () => { st.skipped.clear(); render(el); };
    el.querySelectorAll('[data-pick]').forEach((x) => x.onclick = () => { if (x.dataset.pick !== st.currentId) { st.currentId = x.dataset.pick; resetCall(); render(el); } });
    if (!c) return;

    tick = setInterval(() => { const t = document.getElementById('timer'); if (!t) return clearInterval(tick); t.textContent = U.duration(currentElapsed()); }, 1000);
    $('#dial').addEventListener('click', () => { if (!st.timerStart) { st.timerStart = Date.now(); $('#timer').classList.add('running'); Store.setCallActive(true); } });
    $('#timer').onclick = () => { if (st.timerStart) { st.elapsed = currentElapsed(); st.timerStart = null; $('#timer').classList.remove('running'); Store.setCallActive(false); } else { st.timerStart = Date.now(); $('#timer').classList.add('running'); Store.setCallActive(true); } };
    $('#timer').style.cursor = 'pointer';
    $('#timer').title = 'Clic para iniciar/pausar el cronómetro';
    $('#toggleScript').onclick = () => { st.showScript = !st.showScript; render(el); };
    const notes = $('#cNotes');
    notes.oninput = () => { st.notes = notes.value; };
    UI.bindFollowPicker(el, 'cFollow', (v) => { st.follow = v; });
    const pick = (id) => {
      st.outcome = st.outcome === id ? '' : id;
      el.querySelectorAll('[data-outcome]').forEach((b) => b.classList.toggle('selected', b.dataset.outcome === st.outcome));
      const req = (outcomeById(st.outcome) || {}).requireFollow;
      $('#cFollowLbl').innerHTML = 'Próximo seguimiento' + (req ? ' <strong style="color:var(--bad)">(obligatorio)</strong>' : '') + ':';
      if (req && !st.follow) $('#cFollow').focus();
    };
    el.querySelectorAll('[data-outcome]').forEach((b) => b.onclick = () => pick(b.dataset.outcome));
    $('#skip').onclick = () => { st.skipped.add(c.id); st.currentId = null; render(el); };
    $('#saveNext').onclick = () => save(el, c);

    // Atajos de teclado 1-8 para resultados
    el._keys && document.removeEventListener('keydown', el._keys);
    el._keys = (e) => {
      if (!document.getElementById('cNotes') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal-backdrop')) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const i = e.key === '0' ? 9 : Number(e.key) - 1;
      if (OUTCOMES[i]) pick(OUTCOMES[i].id);
    };
    document.addEventListener('keydown', el._keys);
  }

  function save(el, c) {
    if (!st.outcome) return UI.toast('Selecciona el resultado de la llamada', 'bad');
    const o = outcomeById(st.outcome);
    if (o.requireFollow && !st.follow) { const f = el.querySelector('#cFollow'); f.classList.add('invalid'); f.focus(); return UI.toast('Para "Llamar después" elige la fecha y hora del próximo seguimiento', 'bad'); }
    const dur = Math.round(currentElapsed());
    Store.logCall(c.id, { outcome: st.outcome, notes: st.notes.trim(), duration: dur, nextFollowUp: st.follow ? U.fromInput(st.follow) : undefined });
    st.session.calls++;
    if (o.contact) st.session.contacts++;
    st.session.talk += dur;
    if (o.appointment) st.session.sales++;
    st.skipped.add(c.id); // no volver a mostrarlo en esta sesión
    st.currentId = null;
    resetCall();
    UI.toast(`Guardado: ${o.name}`, 'good');
    render(el);
    Views.cliente.afterOutcome(c.id, o.id);
  }

  return { title: 'Modo llamadas', perm: 'prospects', render, noAutoRefresh: true };
})();
