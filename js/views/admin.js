/* =========================================================
   Panel de administración
   ========================================================= */
Views.admin = (() => {
  const state = { tab: 'usuarios' };
  const TABS = [
    ['usuarios', 'Usuarios y roles', 'users'],
    ['asignacion', 'Asignación de prospectos', 'refresh'],
    ['config', 'Configuración', 'settings'],
    ['datos', 'Datos y respaldo', 'download'],
    ['conexiones', 'Conexiones', 'info']
  ];

  function render(el) {
    el.innerHTML = `
      <div class="page-head"><div><h1>Panel de administración</h1><p>Controla quién usa el CRM, cómo se reparten los clientes y la configuración del negocio</p></div></div>
      <div class="tabs">${TABS.map(([k, l, i]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}"><span class="row" style="gap:6px">${icon(i, 'sm')}${l}</span></button>`).join('')}</div>
      <div id="adminBody"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(el); });
    const body = el.querySelector('#adminBody');
    ({ usuarios, asignacion, config, datos, conexiones })[state.tab](body);
  }

  /* ---------- Usuarios ---------- */
  function usuarios(el) {
    const users = U.sortBy(Store.all('users'), (u) => (u.active ? '0' : '1') + u.role + u.name);
    const today = [U.startOfDay(), U.endOfDay()];
    el.innerHTML = `
      <div class="row between" style="margin-bottom:12px">
        <div class="muted small">${users.filter((u) => u.active).length} usuarios activos · ${users.filter((u) => !u.active).length} inactivos</div>
        <button class="btn primary" id="newUser">${icon('userPlus', 'sm')} Nuevo usuario</button>
      </div>
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Contacto</th><th class="right">Clientes</th><th class="right">Llamadas hoy</th><th class="right">Meta llamadas/día</th><th class="right">Meta ventas/mes</th><th>Estado</th><th></th></tr></thead>
        <tbody>${users.map((u) => {
          const nClients = Store.all('clients').filter((c) => c.ownerId === u.id).length;
          const calls = Metrics.forUser(u.id, ...today).calls;
          return `<tr style="${u.active ? '' : 'opacity:.55'}">
            <td><div class="row">${UI.avatar(u, 'md')}<div><div class="cell-main">${U.esc(u.name)}${Store.isOwner(u) ? ' <span class="badge">Cuenta principal</span>' : ''}${u.id === Store.currentUser().id ? ' <span class="badge info">Tú</span>' : ''}</div><div class="cell-sub">Desde ${U.date(u.createdAt)}</div></div></div></td>
            <td><span class="badge ${u.role === 'admin' ? 'violet' : u.role === 'supervisor' ? 'info' : u.role === 'reclutador' ? 'warn' : ''}">${(ROLES[u.role] || ROLES.agente).name}</span><div class="cell-sub" style="max-width:220px">${permSummary(u)}</div></td>
            <td class="small">${U.esc(u.email || '')}<div class="muted">${U.esc(u.phone || '')}</div></td>
            <td class="right num">${nClients}</td>
            <td class="right num">${calls}</td>
            <td class="right num">${u.callGoal || '—'}</td>
            <td class="right num">${u.salesGoal ? U.money(u.salesGoal) : '—'}</td>
            <td>${u.active ? '<span class="badge good">Activo</span>' : '<span class="badge">Inactivo</span>'}${Store.authMode() ? `<div class="cell-sub">${u.authAccount || Store.isOwner(u) ? (u.lastLoginAt ? 'Último ingreso ' + U.ago(u.lastLoginAt) : 'Aún no ha ingresado') : 'Sin acceso (datos demo)'}</div>` : ''}</td>
            <td class="nowrap"><button class="btn sm" data-edit="${u.id}">${icon('edit', 'sm')} Editar</button> <button class="btn sm ghost" data-as="${u.id}" title="Ver el CRM como lo ve esta persona (vista previa)" ${u.active && u.id !== Store.realUser().id ? '' : 'disabled'}>Ver como</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>${icon('shield', 'sm')} Qué puede ver cada rol</h2><span class="muted small">Al editar un usuario puedes ajustar sus permisos uno por uno</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Permiso</th>${Object.values(ROLES).map((r) => `<th style="text-align:center">${r.name}</th>`).join('')}</tr></thead>
          <tbody>${PERMS.map((p) => `<tr><td><div class="cell-main">${p.name}</div><div class="cell-sub">${p.desc}</div></td>${Object.keys(ROLES).map((k) => `<td style="text-align:center">${effectivePerms(k)[p.id] ? `<span style="color:var(--good)">${icon('check', 'sm')}</span>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
            <tr><td><div class="cell-main">Usuarios, configuración, productos y eliminar registros</div><div class="cell-sub">Siempre solo la administración</div></td>${Object.keys(ROLES).map((k) => `<td style="text-align:center">${k === 'admin' ? `<span style="color:var(--good)">${icon('check', 'sm')}</span>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>
          </tbody>
        </table></div>
      </div>`;
    el.querySelector('#newUser').onclick = () => userForm();
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => userForm(b.dataset.edit));
    el.querySelectorAll('[data-as]').forEach((b) => b.onclick = () => { Store.setCurrentUser(b.dataset.as); App.shell(); location.hash = '#/dashboard'; App.route(); UI.toast('Viendo como ' + UI.userName(b.dataset.as)); });
  }

  // Resumen corto de lo que la persona puede ver
  function permSummary(u) {
    if (u.role === 'admin') return 'Acceso total';
    const p = effectivePerms(u.role, u.perms);
    const bits = [];
    if (p.prospects) bits.push(p.viewAll ? 'Prospectos (todo el equipo)' : 'Sus prospectos');
    if (p.sales) bits.push('Ventas');
    bits.push(p.finance ? 'Ve montos' : 'Sin montos');
    if (p.reports) bits.push('Reportes');
    if (p.recruitment) bits.push(p.recruitAll ? 'Reclutamiento (todos)' : 'Reclutamiento');
    return bits.join(' · ');
  }
  const permBoxes = (perms, disabled) => PERMS.map((p) => `<label class="check full" style="align-items:flex-start"><input type="checkbox" name="perm_${p.id}" ${perms[p.id] ? 'checked' : ''} ${disabled ? 'disabled' : ''}> <span><strong>${p.name}</strong>${p.id === 'finance' ? ` <span class="badge violet">${icon('lock', 'sm')} Sensible</span>` : ''}<br><span class="small muted">${p.desc}</span></span></label>`).join('');

  function userForm(id) {
    const auth = Store.authMode();
    const u = id ? Store.get('users', id) : { role: 'agente', active: true, callGoal: 60, salesGoal: 5000, color: USER_COLORS[Store.all('users').length % USER_COLORS.length] };
    // La cuenta principal y la propia no pueden perder el rol ni desactivarse
    const isSelf = id === Store.realUser().id || Store.isOwner(u);
    // Con login, el correo de un usuario existente no se cambia (es su cuenta de acceso)
    const emailLocked = Store.isOwner(u) || (auth && id && u.authAccount);
    const hasAccount = !!u.authAccount;
    UI.modal({
      title: id ? 'Editar usuario' : 'Nuevo usuario',
      footer: `
        ${id && auth && hasAccount && u.email ? `<button type="button" class="btn" id="sendReset" style="margin-right:auto">${icon('mail', 'sm')} Enviar enlace de contraseña</button>` : ''}
        <button type="button" class="btn" data-close>Cancelar</button>
        <button type="submit" class="btn primary">${id ? 'Guardar' : auth ? 'Crear usuario y dar acceso' : 'Crear usuario'}</button>`,
      body: `
        <div class="photo-field" style="margin-bottom:12px">
          <span id="ufAvatar">${UI.avatar(u.name ? u : { name: '?', color: u.color }, 'xl')}</span>
          <div class="stack" style="gap:6px"><strong>Foto de perfil</strong><span class="small muted">Opcional. Cada persona también puede ponerla desde "Mi perfil".</span>
            <div class="row"><button type="button" class="btn sm" id="ufPhoto">${icon('camera', 'sm')} ${u.photoUrl ? 'Cambiar foto' : 'Subir foto'}</button>${u.photoUrl ? '<button type="button" class="btn sm ghost" id="ufNoPhoto">Quitar</button>' : ''}</div>
          </div>
        </div>
        <div class="form-grid">
          <label class="field full">Nombre y apellido ${auth && !id ? '<span class="hint">(opcional: si lo dejas vacío, la persona lo escribe en su primer ingreso)</span>' : '*'}<input name="name" ${auth && !id ? '' : 'required'} value="${U.esc(u.name)}"></label>
          <label class="field">Correo ${auth ? '*' : ''} <span class="hint">${Store.isOwner(u) ? '(cuenta principal)' : auth ? '(con este correo entra al CRM)' : ''}</span><input name="email" type="email" ${auth ? 'required' : ''} value="${U.esc(u.email)}" ${emailLocked ? 'readonly' : ''}></label>
          <label class="field">Teléfono<input name="phone" value="${U.esc(u.phone)}"></label>
          <label class="field">Rol<select name="role" ${isSelf ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select><span class="hint" id="roleHint">${ROLES[u.role].desc}</span></label>
          <label class="field">Color<div class="row wrap">${USER_COLORS.map((c) => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${userColor(u.color) === c ? 'checked' : ''} hidden><span class="avatar" style="background:${c};outline:${userColor(u.color) === c ? '3px solid var(--text)' : 'none'};outline-offset:2px" data-color="${c}"></span></label>`).join('')}</div></label>
          <label class="field">Meta de llamadas por día<input name="callGoal" type="number" min="0" value="${u.callGoal ?? 0}"></label>
          <label class="field">Meta de ventas por mes ($)<input name="salesGoal" type="number" min="0" value="${u.salesGoal ?? 0}"></label>
          ${u.role === 'admin' ? `<label class="check full"><input type="checkbox" name="sells" ${u.sells ? 'checked' : ''}> También vende (aparece en rankings y reparto de prospectos)</label>` : ''}
          ${auth && (!id || !hasAccount) ? `
          <div class="form-section full">Acceso al CRM</div>
          <label class="check full"><input type="radio" name="access" value="invite" checked> <span>Enviarle un correo para que cree su propia contraseña <span class="muted">(recomendado)</span></span></label>
          <label class="check full"><input type="radio" name="access" value="temp"> <span>Asignarle una contraseña temporal y dársela yo</span></label>
          <label class="field full hidden" id="tempWrap">Contraseña temporal <span class="hint">(mínimo 6 caracteres; luego la puede cambiar desde su menú)</span><input name="tempPass" type="text" autocomplete="off"></label>` : ''}
          <div class="form-section full">Permisos <span class="hint" style="text-transform:none;letter-spacing:0">(los trae el rol; puedes ajustarlos para esta persona)</span></div>
          <div class="full stack" id="permBox" style="gap:8px">${permBoxes(effectivePerms(u.role, u.perms), u.role === 'admin')}</div>
          <p class="small muted full" id="permAdminNote" style="margin:0" ${u.role === 'admin' ? '' : 'hidden'}>La administración siempre tiene todos los permisos.</p>
          <label class="check full"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}> Usuario activo (puede entrar al CRM)</label>
        </div>`,
      onOpen: (form, close) => {
        form.querySelectorAll('[data-color]').forEach((sw) => sw.addEventListener('click', () => form.querySelectorAll('[data-color]').forEach((x) => { x.style.outline = x === sw ? '3px solid var(--text)' : 'none'; })));
        const role = form.querySelector('[name=role]');
        role.onchange = () => {
          form.querySelector('#roleHint').textContent = ROLES[role.value].desc;
          // Al cambiar de rol se cargan los permisos de ese rol
          form.querySelector('#permBox').innerHTML = permBoxes(effectivePerms(role.value), role.value === 'admin');
          form.querySelector('#permAdminNote').hidden = role.value !== 'admin';
        };
        form._photo = u.photoUrl || '';
        const showPh = () => { form.querySelector('#ufAvatar').innerHTML = UI.avatar(Object.assign({ name: '?' }, u, { photoUrl: form._photo }), 'xl'); };
        form.querySelector('#ufPhoto').onclick = async () => { const url = await UI.pickPhoto('perfiles').catch(() => null); if (url) { form._photo = url; showPh(); } };
        const noPh = form.querySelector('#ufNoPhoto');
        if (noPh) noPh.onclick = () => { form._photo = ''; showPh(); noPh.remove(); };
        form.querySelectorAll('[name=access]').forEach((r) => r.onchange = () => form.querySelector('#tempWrap').classList.toggle('hidden', form.querySelector('[name=access]:checked').value !== 'temp'));
        const sr = form.querySelector('#sendReset');
        if (sr) sr.onclick = async () => {
          try { await Store.auth().resetPassword(u.email); UI.toast(`Enlace enviado a ${u.email}`, 'good'); close(); }
          catch (err) { UI.toast('No se pudo enviar: ' + (err.code || err.message), 'bad'); }
        };
      },
      onSubmit: async (d, form) => {
        if (isSelf) { d.role = u.role; d.active = true; }
        // Permisos: se guardan completos (los del rol con los ajustes marcados)
        const perms = {};
        PERMS.forEach((p) => { perms[p.id] = !!d['perm_' + p.id]; delete d['perm_' + p.id]; });
        d.perms = d.role === 'admin' ? {} : perms;
        d.photoUrl = form._photo || '';
        if (emailLocked) d.email = u.email;
        d.email = String(d.email || '').trim().toLowerCase();
        const em = d.email.toLowerCase();
        if (em && Store.all('users').some((x) => x.id !== id && String(x.email || '').trim().toLowerCase() === em)) { UI.toast('Ya existe un usuario con ese correo', 'bad'); return false; }
        const access = d.access, tempPass = d.tempPass;
        delete d.access; delete d.tempPass;

        // Crear la cuenta de acceso (Firebase Authentication)
        let createdAccount = false;
        if (auth && (!id || !hasAccount)) {
          if (!em) { UI.toast('Escribe el correo de la persona', 'bad'); return false; }
          if (access === 'temp' && String(tempPass || '').length < 6) { UI.toast('La contraseña temporal debe tener al menos 6 caracteres', 'bad'); return false; }
          const pass = access === 'temp' ? tempPass : (crypto.getRandomValues(new Uint32Array(4)).join('-') + 'Aa!');
          try { await Store.auth().createAccount(em, pass); createdAccount = true; }
          catch (err) {
            if (err.code !== 'auth/email-already-in-use') { UI.toast('No se pudo crear la cuenta: ' + (err.code === 'auth/invalid-email' ? 'correo no válido' : err.code || err.message), 'bad'); return false; }
          }
          if (access !== 'temp' || !createdAccount) { try { await Store.auth().resetPassword(em); } catch (err) { console.warn(err); } }
          d.authAccount = true;
        }

        let saved;
        if (id) {
          const wasActive = u.active;
          saved = Store.update('users', id, d);
          if (wasActive && !d.active) {
            const n = Store.all('clients').filter((c) => c.ownerId === id && OPEN_STAGES.includes(c.stage)).length;
            if (n) setTimeout(() => { state.tab = 'asignacion'; App.refresh(); UI.toast(`${u.name} tiene ${n} prospectos abiertos: reasígnalos aquí`); }, 100);
          }
          UI.toast('Usuario actualizado', 'good');
        } else {
          saved = Store.insert('users', Object.assign({ name: d.name || em.split('@')[0], profileCompleted: false }, d, { name: d.name || em.split('@')[0] }));
        }
        if (auth && saved.authAccount) await Store.syncAccess(saved);
        if (!id || createdAccount) {
          UI.toast(!auth ? 'Usuario creado' : access === 'temp' && createdAccount
            ? `Usuario creado. Dale a ${em} su contraseña temporal para que entre.`
            : `Usuario creado. Le enviamos a ${em} un correo para crear su contraseña.`, 'good');
        }
        App.shell(); App.route();
      }
    });
  }


  /* ---------- Asignación ---------- */
  function asignacion(el) {
    const users = Store.all('users');
    const sellers = Store.sellers();
    const orphan = Store.all('clients').filter((c) => { const u = Store.get('users', c.ownerId); return !u || !u.active; });
    const unworked = Store.all('clients').filter((c) => c.stage === 'nuevo' && !c.callCount);
    el.innerHTML = `
      <div class="grid span-2-1">
        <div class="card">
          <div class="card-head"><h2>Carga de trabajo por vendedor</h2></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Vendedor</th><th class="right">Nuevos sin llamar</th><th class="right">Activos</th><th class="right">Con cita</th><th class="right">Vencidos</th><th class="right">Clientes (ganados)</th></tr></thead>
            <tbody>${users.filter((u) => u.active).map((u) => {
              const cl = Store.all('clients').filter((c) => c.ownerId === u.id);
              return `<tr><td><div class="row">${UI.avatar(u)} ${U.esc(u.name)}</div></td>
                <td class="right num">${cl.filter((c) => c.stage === 'nuevo' && !c.callCount).length}</td>
                <td class="right num">${cl.filter((c) => OPEN_STAGES.includes(c.stage)).length}</td>
                <td class="right num">${cl.filter((c) => Store.activeAppointment(c)).length}</td>
                <td class="right num" style="color:var(--bad)">${cl.filter((c) => OPEN_STAGES.includes(c.stage) && c.nextFollowUp && new Date(c.nextFollowUp) < new Date()).length}</td>
                <td class="right num">${cl.filter((c) => c.stage === 'ganado').length}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
          ${orphan.length ? `<div class="card-body"><div class="badge bad" style="padding:8px 12px">${icon('alert', 'sm')} ${orphan.length} clientes están asignados a usuarios inactivos o eliminados</div></div>` : ''}
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Transferir cartera</h2></div><div class="card-body stack" style="gap:10px">
            <p class="small muted" style="margin:0">Pasa los clientes de un vendedor a otro (por ejemplo, si alguien se va de la empresa).</p>
            <label class="field">De<select id="tFrom"><option value="">Seleccionar…</option>${orphan.length ? '<option value="__orphan">Usuarios inactivos / sin asignar</option>' : ''}${users.map((u) => `<option value="${u.id}">${U.esc(u.name)}${u.active ? '' : ' (inactivo)'}</option>`).join('')}</select></label>
            <label class="field">A<select id="tTo"><option value="">Seleccionar…</option>${UI.userOptions('')}</select></label>
            <label class="field">¿Cuáles?<select id="tWhich"><option value="open">Solo prospectos abiertos</option><option value="all">Todos (incluye clientes ganados)</option></select></label>
            <button class="btn primary" id="tGo">Transferir</button>
          </div></div>
          <div class="card"><div class="card-head"><h2>Repartir prospectos nuevos</h2></div><div class="card-body stack" style="gap:10px">
            <p class="small muted" style="margin:0">Hay <strong>${unworked.length}</strong> prospectos nuevos sin llamar. Repártelos en partes iguales entre los vendedores elegidos.</p>
            <div class="stack" style="gap:6px">${sellers.map((u) => `<label class="check"><input type="checkbox" data-rr="${u.id}" checked> ${U.esc(u.name)}</label>`).join('')}</div>
            <button class="btn" id="rrGo" ${unworked.length ? '' : 'disabled'}>${icon('refresh', 'sm')} Repartir equitativamente</button>
          </div></div>
        </div>
      </div>`;

    el.querySelector('#tGo').onclick = async () => {
      const from = el.querySelector('#tFrom').value, to = el.querySelector('#tTo').value, which = el.querySelector('#tWhich').value;
      if (!from || !to) return UI.toast('Elige origen y destino', 'bad');
      const list = (from === '__orphan' ? orphan : Store.all('clients').filter((c) => c.ownerId === from)).filter((c) => which === 'all' || OPEN_STAGES.includes(c.stage));
      if (!list.length) return UI.toast('No hay clientes para transferir', 'bad');
      if (!(await UI.confirm(`¿Transferir ${list.length} clientes a ${U.esc(UI.userName(to))}?`, { danger: false }))) return;
      Store.reassign(list.map((c) => c.id), to);
      UI.toast(`${list.length} clientes transferidos`, 'good');
    };
    el.querySelector('#rrGo').onclick = async () => {
      const ids = [...el.querySelectorAll('[data-rr]:checked')].map((x) => x.dataset.rr);
      if (!ids.length) return UI.toast('Elige al menos un vendedor', 'bad');
      if (!(await UI.confirm(`¿Repartir ${unworked.length} prospectos entre ${ids.length} vendedores?`, { danger: false }))) return;
      U.sortBy(unworked, (c) => c.createdAt).forEach((c, i) => { const to = ids[i % ids.length]; if (c.ownerId !== to) Store.reassign([c.id], to); });
      UI.toast('Prospectos repartidos', 'good');
    };
  }

  /* ---------- Configuración ---------- */
  function config(el) {
    const s = Store.settings();
    el.innerHTML = `
      <form class="card" id="cfg"><div class="card-body stack">
        <div class="form-grid">
          <label class="field">Nombre del negocio<input name="companyName" value="${U.esc(s.companyName)}"></label>
          <label class="field">Eslogan / descripción<input name="companyTagline" value="${U.esc(s.companyTagline)}"></label>
          <label class="field">Moneda<select name="currency">${UI.options([{ id: 'USD', name: 'Dólar (USD)' }, { id: 'COP', name: 'Peso colombiano (COP)' }, { id: 'MXN', name: 'Peso mexicano (MXN)' }, { id: 'EUR', name: 'Euro (EUR)' }, { id: 'PEN', name: 'Sol (PEN)' }, { id: 'CLP', name: 'Peso chileno (CLP)' }], s.currency)}</select></label>
          <label class="field">Formato regional<select name="locale">${UI.options([{ id: 'es-US', name: 'Español (EE. UU.)' }, { id: 'es-CO', name: 'Español (Colombia)' }, { id: 'es-MX', name: 'Español (México)' }, { id: 'es-ES', name: 'Español (España)' }, { id: 'es-PE', name: 'Español (Perú)' }, { id: 'es-CL', name: 'Español (Chile)' }], s.locale)}</select></label>
          <label class="field">Código de país para WhatsApp<input name="phoneCountryCode" value="${U.esc(s.phoneCountryCode)}" placeholder="1 = EE. UU., 57 = Colombia"></label>
          <label class="field">Días sin contacto para marcar “olvidado”<input name="staleDays" type="number" min="1" value="${s.staleDays}"></label>
          <label class="field">Intentos de contacto antes de archivar <span class="hint">(sin respuesta → Perdido / Sin respuesta)</span><input name="maxAttempts" type="number" min="1" max="50" value="${s.maxAttempts || 12}"></label>
          <label class="field">Fuentes de prospectos <span class="hint">una por línea</span><textarea name="sources" rows="6">${U.esc(s.sources.join('\n'))}</textarea></label>
          <label class="field">Motivos de pérdida <span class="hint">una por línea</span><textarea name="lostReasons" rows="6">${U.esc(s.lostReasons.join('\n'))}</textarea></label>
          <label class="field">Categorías de productos <span class="hint">una por línea</span><textarea name="categories" rows="6">${U.esc(s.categories.join('\n'))}</textarea></label>
          <label class="field">Reclutamiento · puestos <span class="hint">uno por línea</span><textarea name="positions" rows="6">${U.esc((s.positions || []).join('\n'))}</textarea></label>
          <label class="field">Reclutamiento · fuentes de candidatos <span class="hint">una por línea</span><textarea name="candidateSources" rows="6">${U.esc((s.candidateSources || []).join('\n'))}</textarea></label>
          <div class="field full"><strong>Metas de productividad por hora</strong> <span class="hint">(califican a cada agente en Productividad)</span>
            <div class="form-grid cols-3" style="margin-top:6px">
              <label class="field">Llamadas por hora<input name="prodCallsPerHour" type="number" min="1" step="1" value="${s.prodCallsPerHour || 20}"></label>
              <label class="field">% de contacto<input name="prodContactRate" type="number" min="1" max="100" step="1" value="${s.prodContactRate || 30}"></label>
              <label class="field">Citas por hora<input name="prodApptsPerHour" type="number" min="0.1" step="0.1" value="${s.prodApptsPerHour || 1}"></label>
            </div></div>
          <label class="field">Canales de venta <span class="hint">uno por línea (Instagram, Facebook, WhatsApp…)</span><textarea name="saleChannels" rows="6">${U.esc((s.saleChannels || SALE_CHANNEL_DEFAULTS).join('\n'))}</textarea></label>
          <label class="field">Reclutamiento · idiomas <span class="hint">uno por línea</span><textarea name="languages" rows="4">${U.esc((s.languages || []).join('\n'))}</textarea></label>
          <label class="field">Guion de llamada <span class="hint">variables: {nombre} {agente} {empresa} {ciudad}</span><textarea name="callScript" rows="6">${U.esc(s.callScript)}</textarea></label>
        </div>
        <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${icon('check', 'sm')} Guardar configuración</button></div>
      </div></form>`;
    // Al cambiar la moneda se sugiere el formato regional y el código de país que le corresponden
    const REGION = { USD: ['es-US', '1'], COP: ['es-CO', '57'], MXN: ['es-MX', '52'], EUR: ['es-ES', '34'], PEN: ['es-PE', '51'], CLP: ['es-CL', '56'] };
    el.querySelector('[name=currency]').onchange = (e) => {
      const r = REGION[e.target.value]; if (!r) return;
      const loc = el.querySelector('[name=locale]');
      if (![...loc.options].some((o) => o.value === r[0])) loc.add(new Option(r[0], r[0]));
      loc.value = r[0];
      el.querySelector('[name=phoneCountryCode]').value = r[1];
    };
    el.querySelector('#cfg').onsubmit = (e) => {
      e.preventDefault();
      const d = UI.formData(e.target);
      const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
      Store.saveSettings(Object.assign(d, { sources: lines(d.sources), lostReasons: lines(d.lostReasons), categories: lines(d.categories), positions: lines(d.positions), saleChannels: lines(d.saleChannels), candidateSources: lines(d.candidateSources), languages: lines(d.languages), staleDays: d.staleDays || 7, prodCallsPerHour: d.prodCallsPerHour || 20, prodContactRate: d.prodContactRate || 30, prodApptsPerHour: d.prodApptsPerHour || 1, maxAttempts: d.maxAttempts || 12 }));
      App.shell(); App.route();
      UI.toast('Configuración guardada', 'good');
    };
  }

  /* ---------- Datos ---------- */
  function datos(el) {
    const counts = COLLECTIONS.map((c) => `${c}: <strong>${Store.all(c).length}</strong>`).join(' · ');
    el.innerHTML = `
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h2>Respaldo</h2></div><div class="card-body stack" style="gap:10px">
          <p class="small muted" style="margin:0">${counts}</p>
          <p class="small" style="margin:0">Descarga una copia completa de toda la información. Guárdala en un lugar seguro.</p>
          <div class="row wrap">
            <button class="btn primary" id="bk">${icon('download', 'sm')} Descargar respaldo (.json)</button>
            <label class="btn">${icon('upload', 'sm')} Restaurar respaldo<input type="file" id="restore" accept=".json,application/json" hidden></label>
          </div>
        </div></div>
        <div class="card"><div class="card-head"><h2>${Store.mode() === 'firestore' ? 'Empezar de cero' : 'Datos de demostración'}</h2></div><div class="card-body stack" style="gap:10px">
          ${Store.mode() === 'firestore'
            ? '<p class="small" style="margin:0">Borra clientes, ventas, pagos, tareas, productos y candidatos de reclutamiento para todo el equipo. Se conservan la configuración y todas las cuentas con acceso. Úsalo solo si de verdad quieres reiniciar el CRM.</p><p class="small muted" style="margin:0">La demo con datos de ejemplo está aparte, en <a href="?local=1" target="_blank" rel="noopener">la demo sin conexión</a>, y no toca estos datos.</p>'
            : '<p class="small" style="margin:0">Esta demo trae datos de ejemplo para explorar el CRM. Lo que hagas aquí se guarda solo en este navegador.</p>'}
          <div class="row wrap">
            ${Store.mode() === 'firestore' ? '' : `<button class="btn" id="demo">${icon('refresh', 'sm')} Recargar datos demo</button>`}
            <button class="btn danger solid" id="wipe">${icon('trash', 'sm')} Borrar todo y empezar de cero</button>
          </div>
        </div></div>
      </div>`;
    el.querySelector('#bk').onclick = () => U.download(`respaldo-crm-${U.toDateInput(new Date())}.json`, Store.exportJSON(), 'application/json');
    el.querySelector('#restore').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await UI.confirm('Restaurar reemplazará TODA la información actual por la del archivo. ¿Continuar?'))) return;
      try { UI.toast('Restaurando…'); await Store.importJSON(await f.text()); App.shell(); App.route(); UI.toast('Respaldo restaurado', 'good'); } catch (err) { UI.toast('Archivo no válido: ' + err.message, 'bad'); }
    };
    if (el.querySelector('#demo')) el.querySelector('#demo').onclick = async () => { if (await UI.confirm(`Esto reemplaza todo por los datos de demostración${Store.mode() === 'firestore' ? ' <strong>para todo el equipo</strong>' : ''}. ¿Continuar?`)) { UI.toast('Cargando datos demo…'); try { await Store.resetDemo(); App.shell(); App.route(); UI.toast('Datos demo cargados', 'good'); } catch (err) { UI.toast('Error: ' + (err.code || err.message), 'bad'); } } };
    el.querySelector('#wipe').onclick = async () => {
      if (!(await UI.confirm('Se borrarán TODOS los clientes, ventas, pagos, tareas, productos, candidatos de reclutamiento y usuarios (excepto las cuentas con acceso). ¿Seguro? Descarga un respaldo antes si lo necesitas.', { okLabel: 'Sí, borrar todo' }))) return;
      UI.toast('Borrando…');
      try { await Store.wipeAll(); App.shell(); App.route(); UI.toast('Listo: CRM vacío y listo para usar', 'good'); } catch (err) { UI.toast('Error: ' + (err.code || err.message), 'bad'); }
    };
  }

  /* ---------- Conexiones ---------- */
  function conexiones(el) {
    const cfg = window.CRM_CONFIG;
    el.innerHTML = `
      <div class="grid cols-2">
        <div class="card"><div class="card-head"><h2>Firebase / Firestore</h2>${Store.mode() === 'firestore' ? '<span class="badge good">Conectado</span>' : '<span class="badge warn">Sin conexión</span>'}</div>
          <div class="card-body small stack" style="gap:8px">
            ${Store.mode() === 'firestore'
              ? `<p style="margin:0">Todo se guarda en la nube (proyecto <code>${U.esc(cfg.firebase.projectId)}</code>) y los cambios de cada persona le aparecen al resto del equipo en tiempo real.</p>
                 <p style="margin:0" class="muted">Colecciones: <code>${COLLECTIONS.join('</code>, <code>')}</code> y <code>meta/settings</code>. Pendiente: login con email y contraseña.</p>`
              : `<p style="margin:0">Estás en la <strong>demo sin conexión</strong>: los datos se guardan solo en este navegador.</p>${cfg.firebase.enabled ? '<p style="margin:0"><a href="./">Volver a la versión en línea</a></p>' : ''}`}
          </div></div>
        <div class="card"><div class="card-head"><h2>Cloudinary</h2>${UI.cloudinaryReady() ? '<span class="badge good">Configurado</span>' : '<span class="badge warn">Pendiente</span>'}</div>
          <div class="card-body small stack" style="gap:8px">
            <p style="margin:0">Almacena imágenes de productos y archivos de clientes (fotos de instalación, facturas, contratos).</p>
            <p style="margin:0" class="muted">Configura <code>cloudName</code> y un <code>uploadPreset</code> sin firma en <code>js/config.js</code>.</p>
          </div></div>
      </div>`;
  }

  return { title: 'Administración', perm: 'manageUsers', render };
})();
