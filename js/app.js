/* =========================================================
   App — shell, navegación y enrutador
   ========================================================= */
const Views = {};

const App = (() => {
  const NAV = [
    { section: 'Trabajo diario' },
    { id: 'dashboard', label: 'Inicio', icon: 'dashboard', perm: 'prospects' },
    { id: 'llamadas', label: 'Modo llamadas', icon: 'phone', perm: 'prospects' },
    { id: 'agenda', label: 'Agenda y tareas', icon: 'calendar', perm: 'prospects', badge: () => overdueCount() },
    { section: 'Clientes' },
    { id: 'clientes', label: 'Clientes y prospectos', icon: 'users', perm: 'prospects' },
    { id: 'pipeline', label: 'Embudo de ventas', icon: 'kanban', perm: 'prospects' },
    { section: 'Reclutamiento' },
    { id: 'reclutamiento', label: 'Reclutamiento', icon: 'briefcase', perm: 'recruitment', badge: () => Views.reclutamiento.myOverdue() },
    { section: 'Ventas' },
    { id: 'ventas', label: 'Ventas y pedidos', icon: 'cart', perm: 'sales' },
    { id: 'recaudo', label: 'Recaudo / Cartera', icon: 'wallet', perm: 'finance' },
    { id: 'productos', label: 'Productos', icon: 'box', perm: 'sales' },
    { section: 'Gestión' },
    { id: 'reportes', label: 'Reportes y equipo', icon: 'chart', perm: 'reports' },
    { id: 'admin', label: 'Panel de administración', icon: 'shield', perm: 'manageUsers' }
  ];
  // Primera sección que la persona puede ver (para quien solo tiene Reclutamiento, por ejemplo)
  const homeView = () => (NAV.find((n) => n.id && (!n.perm || Store.can(n.perm))) || { id: 'dashboard' }).id;

  let current = { view: 'dashboard', params: [] };
  let root;

  function overdueCount() {
    const now = Date.now();
    const me = Store.currentUser();
    // Pendientes personales: seguimientos vencidos de mis clientes + mis tareas vencidas
    const follow = Store.all('clients').filter((c) => c.ownerId === me.id && c.nextFollowUp && new Date(c.nextFollowUp).getTime() < now && OPEN_STAGES.includes(c.stage)).length;
    const tasks = Store.myTasks().filter((t) => !t.done && new Date(t.due).getTime() < now && t.userId === me.id).length;
    return follow + tasks;
  }

  function shell() {
    const s = Store.settings();
    const me = Store.currentUser();
    const real = Store.realUser();
    root.innerHTML = `
      ${Store.isViewingAs() ? `<div class="viewas-bar">${icon('user', 'sm')} Estás viendo el CRM como <strong>${U.esc(me.name)}</strong> (${ROLES[me.role].name}). Es solo una vista previa. <button class="btn xs" id="exitViewAs">Volver a mi vista</button></div>` : ''}
      <div class="app" id="app">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-logo">${U.esc(U.initials(s.companyName))}</div>
            <div><div class="brand-name">${U.esc(s.companyName)}</div><div class="brand-sub">CRM de ventas</div></div>
          </div>
          <nav class="nav" id="nav"></nav>
          <div class="sidebar-foot">
            <span class="demo-pill">${Store.mode() === 'firestore' ? 'En línea · tiempo real' : 'Demo sin conexión'}</span>
            <a href="guia/" target="_blank" rel="noopener" class="row" style="gap:6px">${icon('info', 'sm')}<span>Guía de uso</span></a>
            <a href="propuesta/" target="_blank" rel="noopener" class="row" style="gap:6px">${icon('file', 'sm')}<span>Ver propuesta</span></a>
            ${Store.isAdmin() ? `<a href="revision/" target="_blank" rel="noopener" class="row" style="gap:6px">${icon('check', 'sm')}<span>Revisión de cambios</span></a>` : ''}
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="btn ghost icon menu-btn" id="menuBtn" aria-label="Menú">${icon('menu')}</button>
            <div class="global-search">
              ${icon('search', 'sm')}
              <input id="gsearch" type="search" placeholder="${Store.can('prospects') ? 'Buscar cliente por nombre, teléfono, email… ( / )' : 'Buscar candidato por nombre o teléfono… ( / )'}" autocomplete="off">
              <div class="search-results hidden" id="gresults"></div>
            </div>
            <div class="topbar-right">
              ${Store.can('prospects') ? `<button class="btn primary sm" id="quickAdd">${icon('userPlus', 'sm')}<span class="hide-sm">Nuevo prospecto</span></button>`
                : Store.can('recruitment') ? `<button class="btn primary sm" id="quickAdd" data-cand="1">${icon('userPlus', 'sm')}<span class="hide-sm">Nuevo candidato</span></button>` : ''}
              <button class="btn ghost icon" id="themeBtn" title="Cambiar tema">${icon('moon')}</button>
              ${Store.authMode() ? `
              <div class="user-menu">
                <button class="user-chip" id="userBtn" aria-haspopup="true" aria-expanded="false">
                  ${UI.avatar(real)}
                  <span class="who"><strong>${U.esc(real.name)}</strong><small>${ROLES[real.role] ? ROLES[real.role].name : ''}</small></span>
                  ${icon('chevronDown', 'sm chev')}
                </button>
                <div class="menu-pop hidden" id="userPop" role="menu">
                  <div class="menu-head">${U.esc(real.email || '')}</div>
                  <button role="menuitem" data-menu="perfil">${icon('user', 'sm')} Mi perfil</button>
                  <button role="menuitem" data-menu="clave">${icon('shield', 'sm')} Cambiar mi contraseña</button>
                  <a role="menuitem" href="guia/" target="_blank" rel="noopener">${icon('info', 'sm')} Guía de uso</a>
                  <button role="menuitem" data-menu="salir" class="danger">${icon('logout', 'sm')} Cerrar sesión</button>
                </div>
              </div>` : `
              <label class="user-chip" title="Demo sin conexión: elige con qué usuario ver el CRM">
                ${UI.avatar(me)}
                <select id="userSwitch" aria-label="Usuario activo">
                  ${Store.activeUsers().map((u) => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${U.esc(u.name)} · ${ROLES[u.role].name}</option>`).join('')}
                </select>
              </label>`}
            </div>
          </header>
          <main class="content" id="view"></main>
        </div>
      </div>`;

    document.getElementById('menuBtn').onclick = () => document.getElementById('app').classList.toggle('nav-open');
    document.getElementById('app').addEventListener('click', (e) => {
      const app = e.currentTarget;
      if (app.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#menuBtn')) app.classList.remove('nav-open');
    });
    const sw = document.getElementById('userSwitch');
    if (sw) sw.onchange = (e) => { Store.setCurrentUser(e.target.value); shell(); route(); UI.toast('Ahora ves el CRM como ' + Store.currentUser().name); };
    const ex = document.getElementById('exitViewAs');
    if (ex) ex.onclick = () => { Store.setViewAs(null); shell(); route(); };
    bindUserMenu();
    document.getElementById('themeBtn').onclick = toggleTheme;
    const qa = document.getElementById('quickAdd');
    if (qa) qa.onclick = () => (qa.dataset.cand ? Views.candidato.openForm() : Views.clientes.openForm());
    initSearch();
    renderNav();
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const visible = NAV.filter((n) => n.section || !n.perm || Store.can(n.perm));
    // Se ocultan los títulos de sección que se quedan sin opciones
    nav.innerHTML = visible.filter((n, i) => !n.section || (visible[i + 1] && !visible[i + 1].section)).map((n) => {
      if (n.section) return `<div class="nav-section">${n.section}</div>`;
      const b = n.badge ? n.badge() : 0;
      const active = current.view === n.id || (n.id === 'clientes' && current.view === 'cliente') || (n.id === 'reclutamiento' && current.view === 'candidato');
      return `<a href="#/${n.id}" class="${active ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span>${b ? `<span class="badge-count">${b}</span>` : ''}</a>`;
    }).join('');
  }

  function initSearch() {
    const input = document.getElementById('gsearch');
    const box = document.getElementById('gresults');
    let idx = -1;
    const run = () => {
      const q = U.normalize(input.value.trim());
      if (q.length < 2) { box.classList.add('hidden'); return; }
      const qd = q.replace(/\D/g, '');
      if (!Store.can('prospects')) {
        // Sin acceso a clientes: la búsqueda es de candidatos (solo para quien trabaja Reclutamiento)
        const cands = Store.can('recruitment') ? Recruit.mine().filter((c) => U.normalize(`${c.name} ${c.email} ${c.city}`).includes(q) || (qd.length >= 3 && U.cleanPhone(c.phone + ' ' + c.phone2).includes(qd))).slice(0, 8) : [];
        idx = -1;
        box.innerHTML = cands.length ? cands.map((c) => `<a href="#/candidato/${c.id}"><div class="row between"><strong>${U.esc(c.name)}</strong>${Recruit.stageBadge(c.stage)}</div><div class="small muted">${U.esc(c.phone || '')} · ${U.esc(c.position || '')}</div></a>`).join('') : '<div class="empty small">Sin resultados.</div>';
        box.classList.remove('hidden');
        return;
      }
      const res = Store.myClients().filter((c) =>
        U.normalize(`${c.name} ${c.company} ${c.email} ${c.city}`).includes(q) || (qd.length >= 3 && U.cleanPhone(c.phone + ' ' + c.phone2).includes(qd))
      ).slice(0, 8);
      idx = -1;
      box.innerHTML = res.length ? res.map((c) => `
        <a href="#/cliente/${c.id}"><div class="row between"><strong>${U.esc(c.name)}</strong>${UI.stageBadge(c.stage)}</div>
        <div class="small muted">${U.esc(c.phone)} · ${U.esc(c.city || '')} · ${stageById(c.stage).name} · ${U.esc(UI.userName(c.ownerId))}</div></a>`).join('')
        : `<div class="empty small">Sin resultados. <a href="#" id="gcreate">Crear “${U.esc(input.value)}”</a></div>`;
      box.classList.remove('hidden');
      const gc = document.getElementById('gcreate');
      if (gc) gc.onclick = (e) => { e.preventDefault(); const v = input.value; hide(); Views.clientes.openForm(null, /\d{5,}/.test(v) ? { phone: v } : { name: v }); };
    };
    const hide = () => { box.classList.add('hidden'); input.value = ''; };
    input.addEventListener('input', U.debounce(run, 120));
    input.addEventListener('keydown', (e) => {
      const links = [...box.querySelectorAll('a[href^="#/"]')];
      if (e.key === 'ArrowDown') { idx = Math.min(links.length - 1, idx + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); e.preventDefault(); }
      else if (e.key === 'Enter' && links.length) { location.hash = (links[idx] || links[0]).getAttribute('href'); hide(); input.blur(); return; }
      else if (e.key === 'Escape') { hide(); input.blur(); return; }
      links.forEach((l, i) => l.classList.toggle('focus', i === idx));
    });
    box.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) hide(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.global-search')) box.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------- Menú de usuario ---------- */
  function bindUserMenu() {
    const btn = document.getElementById('userBtn'), pop = document.getElementById('userPop');
    if (!btn) return;
    const close = () => { pop.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
    btn.onclick = (e) => { e.stopPropagation(); const open = pop.classList.toggle('hidden'); btn.setAttribute('aria-expanded', String(!open)); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) close(); });
    pop.querySelectorAll('[data-menu]').forEach((b) => b.onclick = async () => {
      close();
      const me = Store.realUser();
      if (b.dataset.menu === 'perfil') return profileForm(false);
      if (b.dataset.menu === 'clave') {
        if (!(await UI.confirm(`Te enviaremos un correo a <strong>${U.esc(me.email)}</strong> con un enlace para crear una contraseña nueva.`, { title: 'Cambiar contraseña', okLabel: 'Enviar correo', danger: false }))) return;
        try { await Store.auth().resetPassword(me.email); UI.toast('Listo: revisa tu correo (también la carpeta de spam)', 'good'); }
        catch (err) { UI.toast(authError(err), 'bad'); }
      }
      if (b.dataset.menu === 'salir') { if (await UI.confirm('¿Cerrar sesión en este dispositivo?', { title: 'Cerrar sesión', okLabel: 'Cerrar sesión', danger: false })) Store.auth().signOut(); }
    });
  }

  /* ---------- Ingreso ---------- */
  function authError(err) {
    const c = (err && err.code) || '';
    const map = {
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
      'auth/wrong-password': 'Correo o contraseña incorrectos.',
      'auth/user-not-found': 'No existe una cuenta con ese correo.',
      'auth/invalid-email': 'El correo no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos o restablece tu contraseña.',
      'auth/network-request-failed': 'Sin conexión a internet. Revisa tu conexión e intenta de nuevo.',
      'auth/email-already-in-use': 'Esa cuenta ya existe. Ingresa con tu contraseña o usa "¿Olvidaste tu contraseña?".',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/missing-password': 'Escribe tu contraseña.',
      'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
      'auth/operation-not-allowed': 'El ingreso con correo y contraseña no está activado en Firebase (Authentication → Sign-in method).'
    };
    return map[c] || (err && err.message) || 'Ocurrió un error. Intenta de nuevo.';
  }

  // Muestra la pantalla de ingreso y resuelve cuando la persona entra
  function login(adapter, notice) {
    return new Promise((resolve) => {
      const s = Store.settings();
      const owner = String(window.CRM_CONFIG.ownerEmail || '').toLowerCase();
      let mode = 'in'; // in | create | reset
      const draw = (msg = notice || '', type = msg && notice ? 'bad' : '') => {
        const titles = { in: ['Ingresa a tu CRM', 'Escribe el correo y la contraseña de tu usuario.'], create: ['Crear la contraseña de la cuenta principal', 'Solo para el primer ingreso de la administradora principal.'], reset: ['Recuperar contraseña', 'Te enviaremos un enlace a tu correo para crear una contraseña nueva.'] };
        root.innerHTML = `
          <div class="login">
            <form class="login-card" id="loginForm" novalidate>
              <div class="brand-logo">${U.esc(U.initials(s.companyName))}</div>
              <h1>${titles[mode][0]}</h1>
              <p class="muted">${titles[mode][1]}</p>
              ${msg ? `<div class="login-msg ${type}">${msg}</div>` : ''}
              <label class="field">Correo<input name="email" type="email" autocomplete="username" required value="${U.esc(mode === 'create' ? owner : (draw.email || ''))}" ${mode === 'create' ? 'readonly' : ''}></label>
              ${mode !== 'reset' ? `<label class="field">Contraseña
                <span class="pass"><input name="pass" type="password" autocomplete="${mode === 'create' ? 'new-password' : 'current-password'}" required minlength="6"><button type="button" class="btn ghost sm" id="showPass">Ver</button></span></label>` : ''}
              ${mode === 'create' ? '<label class="field">Repite la contraseña<input name="pass2" type="password" autocomplete="new-password" required minlength="6"></label>' : ''}
              <button class="btn primary login-btn" type="submit">${{ in: 'Ingresar', create: 'Crear contraseña e ingresar', reset: 'Enviar enlace' }[mode]}</button>
              <div class="login-links">
                ${mode === 'in' ? `<a href="#" data-mode="reset">¿Olvidaste tu contraseña?</a>${/[?&]setup=1/.test(location.search) ? '<a href="#" data-mode="create">Primer ingreso de la cuenta principal</a>' : ''}` : '<a href="#" data-mode="in">← Volver a ingresar</a>'}
              </div>
            </form>
            <div class="login-foot"><a href="guia/" target="_blank" rel="noopener">Guía de uso</a> · <a href="?local=1">Ver demo sin conexión</a></div>
          </div>`;
        const form = document.getElementById('loginForm');
        const em = form.querySelector('[name=email]');
        (mode === 'create' ? form.querySelector('[name=pass]') : em.value ? form.querySelector('[name=pass]') || em : em).focus();
        const sp = document.getElementById('showPass');
        if (sp) sp.onclick = () => { const i = form.querySelector('[name=pass]'); i.type = i.type === 'password' ? 'text' : 'password'; sp.textContent = i.type === 'password' ? 'Ver' : 'Ocultar'; };
        form.querySelectorAll('[data-mode]').forEach((a) => a.onclick = (e) => { e.preventDefault(); draw.email = em.value; mode = a.dataset.mode; draw(''); });
        form.onsubmit = async (e) => {
          e.preventDefault();
          const f = UI.formData(form);
          draw.email = f.email;
          const btn = form.querySelector('.login-btn');
          btn.disabled = true; btn.textContent = 'Un momento…';
          try {
            if (mode === 'reset') {
              await adapter.resetPassword(f.email);
              mode = 'in'; draw(`Si existe una cuenta con <strong>${U.esc(f.email)}</strong>, te llegó un correo para crear una contraseña nueva. Revisa también la carpeta de spam.`, 'good');
              return;
            }
            if (mode === 'create') {
              if (f.pass !== f.pass2) throw { code: 'x', message: 'Las contraseñas no coinciden.' };
              if ((f.pass || '').length < 6) throw { code: 'auth/weak-password' };
              const u = await adapter.createOwnAccount(owner, f.pass);
              return resolve(u);
            }
            const u = await adapter.signIn(f.email, f.pass || '');
            root.innerHTML = `<div class="boot"><div class="brand-logo">MQ</div><div class="muted small">Cargando tu CRM…</div></div>`;
            resolve(u);
          } catch (err) {
            draw(authError(err), 'bad');
          }
        };
      };
      draw();
    });
  }

  // Primer ingreso: pedir nombre y apellido una sola vez
  function profileForm(first) {
    const me = Store.realUser();
    const parts = String(me.name || '').includes('@') ? ['', ''] : [me.firstName || String(me.name || '').split(' ')[0] || '', me.lastName || String(me.name || '').split(' ').slice(1).join(' ')];
    return new Promise((resolve) => {
      UI.modal({
        title: first ? '¡Te damos la bienvenida! ¿Cómo te llamas?' : 'Mi perfil',
        size: 'sm',
        submitLabel: first ? 'Guardar y empezar' : 'Guardar',
        locked: first,
        body: `
          ${first ? '<p style="margin:0" class="muted">Es tu primer ingreso. Escribe el <strong>nombre y apellido con el que vas a atender</strong> a los clientes: aparecerá en el guion de llamadas, los recibos y los reportes del equipo. Solo te lo pedimos esta vez.</p>' : ''}
          <div class="photo-field">
            <span id="pfAvatar">${UI.avatar(me, 'xl')}</span>
            <div class="stack" style="gap:6px">
              <strong>Foto de perfil</strong><span class="small muted">${first ? 'Opcional. ' : ''}La verá el equipo junto a tu nombre.</span>
              <div class="row"><button type="button" class="btn sm" id="pfPhoto">${icon('camera', 'sm')} ${me.photoUrl ? 'Cambiar foto' : 'Subir foto'}</button>${me.photoUrl ? '<button type="button" class="btn sm ghost" id="pfNoPhoto">Quitar</button>' : ''}</div>
            </div>
          </div>
          <div class="form-grid">
            <label class="field">Nombre *<input name="firstName" required autocomplete="given-name" value="${U.esc(parts[0])}"></label>
            <label class="field">Apellido *<input name="lastName" required autocomplete="family-name" value="${U.esc(parts[1])}"></label>
            <label class="field full">Teléfono <span class="hint">(opcional)</span><input name="phone" type="tel" autocomplete="tel" value="${U.esc(me.phone)}"></label>
          </div>`,
        onOpen: (form) => {
          form._photo = me.photoUrl || '';
          const show = () => { form.querySelector('#pfAvatar').innerHTML = UI.avatar(Object.assign({}, me, { photoUrl: form._photo }), 'xl'); };
          form.querySelector('#pfPhoto').onclick = async () => { const url = await UI.pickPhoto('perfiles').catch(() => null); if (url) { form._photo = url; show(); } };
          const rm = form.querySelector('#pfNoPhoto');
          if (rm) rm.onclick = () => { form._photo = ''; show(); rm.remove(); };
        },
        onSubmit: (d, form) => {
          const cap = (x) => x.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
          const patch = { firstName: cap(d.firstName), lastName: cap(d.lastName), name: `${cap(d.firstName)} ${cap(d.lastName)}`, phone: d.phone || '', photoUrl: form._photo || '' };
          if (first) Object.assign(patch, { profileCompleted: true, firstLoginAt: new Date().toISOString() });
          Store.update('users', me.id, patch);
          UI.toast(first ? `¡Hola, ${patch.firstName}! Tu CRM está listo.` : 'Perfil actualizado', 'good');
          shell(); route();
          resolve();
        }
      });

    });
  }

  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    html.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('crm_mq_theme', html.dataset.theme); } catch (e) {}
  }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const [view, ...params] = path.split('/');
    return { view: view || 'dashboard', params, query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  function route() {
    current = parseHash();
    const v = Views[current.view];
    const el = document.getElementById('view');
    if (!v) { location.hash = '#/' + homeView(); return; }
    // Inicio sin permiso de prospectos (p. ej. Reclutamiento): se abre su primera sección
    if (current.view === 'dashboard' && !Store.can('prospects') && homeView() !== 'dashboard') { location.hash = '#/' + homeView(); return; }
    if (v.perm && !Store.can(v.perm)) {
      el.innerHTML = UI.empty('No tienes permiso para ver esta sección.', 'ban');
      renderNav();
      return;
    }
    try { v.render(el, current.params, current.query); }
    catch (err) { console.error(err); el.innerHTML = UI.empty('Ocurrió un error al mostrar esta sección: ' + U.esc(err.message), 'alert'); }
    renderNav();
    document.title = `${v.title || 'CRM'} · ${Store.settings().companyName}`;
    document.getElementById('app').classList.remove('nav-open');
  }

  // Re-render tras cambios en datos (sin perder la vista actual)
  let pendingRefresh = false;
  const refresh = U.debounce(() => {
    if (document.querySelector('.modal-backdrop')) { renderNav(); return; }
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view') && a.type !== 'checkbox') {
      // Hay alguien escribiendo: se actualiza al salir del campo para no perder el foco
      if (!pendingRefresh) { pendingRefresh = true; a.addEventListener('blur', () => { pendingRefresh = false; refresh(); }, { once: true }); }
      renderNav();
      return;
    }
    const v = Views[current.view];
    const y = window.scrollY;
    if (v && v.render && !v.noAutoRefresh) { v.render(document.getElementById('view'), current.params, current.query); window.scrollTo(0, y); }
    renderNav();
  }, 60);

  async function start() {
    root = document.getElementById('root');
    let t = null;
    try { t = localStorage.getItem('crm_mq_theme'); } catch (e) {}
    document.documentElement.dataset.theme = t || 'light';
    root.innerHTML = `<div class="boot"><div class="brand-logo">MQ</div><div class="muted small">${window.CRM_CONFIG.firebase.enabled ? 'Conectando con la base de datos…' : 'Cargando…'}</div></div>`;
    try {
      await Store.init();
    } catch (err) {
      console.error(err);
      if (err && err.code === 'no-access') {
        // Vuelve a la pantalla de ingreso con el aviso
        await login(FirestoreAdapter, U.esc(err.message));
        location.reload();
        return;
      }
      const msg = String(err && (err.code || err.message) || err);
      const perm = /permission/i.test(msg);
      root.innerHTML = `<div class="boot" style="max-width:460px;text-align:center;padding:0 16px">
        <div class="brand-logo">MQ</div>
        <h2>No se pudo conectar con la base de datos</h2>
        <p class="muted small" style="margin:0">${perm ? 'Firestore rechazó el acceso. Revisa las reglas de seguridad en la consola de Firebase.' : 'Revisa tu conexión a internet e intenta de nuevo.'}</p>
        <code class="small muted">${U.esc(msg)}</code>
        <div class="row" style="justify-content:center;margin-top:6px">
          <button class="btn primary" onclick="location.reload()">Reintentar</button>
          <a class="btn" href="?local=1">Abrir demo sin conexión</a>
        </div></div>`;
      return;
    }
    UI.initTooltips();
    shell();
    Store.onChange(refresh);
    Store.onChange(watchAccount);
    window.addEventListener('hashchange', route);
    route();
    if (Store.authMode()) {
      const me = Store.realUser();
      if (me.email && Store.get('users', me.id)) {
        Store.update('users', me.id, { lastLoginAt: new Date().toISOString() });
        if (!me.profileCompleted) profileForm(true);
      }
    }
  }

  // Si la administración desactiva a alguien mientras está conectado, se cierra su sesión
  function watchAccount() {
    if (!Store.authMode()) return;
    const me = Store.realUser();
    if (me && me.active === false) { UI.toast('Tu usuario fue desactivado.', 'bad'); setTimeout(() => Store.auth().signOut(), 1500); }
  }

  return { start, route, refresh, renderNav, shell, login, current: () => current };
})();

document.addEventListener('DOMContentLoaded', App.start);
