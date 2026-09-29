/* =========================================================
   App — shell, navegación y enrutador
   ========================================================= */
const Views = {};

const App = (() => {
  const NAV = [
    { section: 'Trabajo diario' },
    { id: 'dashboard', label: 'Inicio', icon: 'dashboard' },
    { id: 'llamadas', label: 'Modo llamadas', icon: 'phone' },
    { id: 'agenda', label: 'Agenda y tareas', icon: 'calendar', badge: () => overdueCount() },
    { section: 'Clientes' },
    { id: 'clientes', label: 'Clientes y prospectos', icon: 'users' },
    { id: 'pipeline', label: 'Embudo de ventas', icon: 'kanban' },
    { section: 'Dinero' },
    { id: 'ventas', label: 'Ventas y pedidos', icon: 'cart' },
    { id: 'recaudo', label: 'Recaudo / Cartera', icon: 'wallet' },
    { id: 'productos', label: 'Productos', icon: 'box' },
    { section: 'Gestión', perm: 'viewReports' },
    { id: 'reportes', label: 'Reportes y equipo', icon: 'chart', perm: 'viewReports' },
    { id: 'admin', label: 'Panel de administración', icon: 'shield', perm: 'manageUsers' }
  ];

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
    root.innerHTML = `
      <div class="app" id="app">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-logo">${U.esc(U.initials(s.companyName))}</div>
            <div><div class="brand-name">${U.esc(s.companyName)}</div><div class="brand-sub">CRM de ventas</div></div>
          </div>
          <nav class="nav" id="nav"></nav>
          <div class="sidebar-foot">
            <span class="demo-pill">${window.CRM_CONFIG.firebase.enabled ? 'En línea · Firestore' : 'Versión demo'}</span>
            <a href="propuesta/" target="_blank" rel="noopener" class="row" style="gap:6px">${icon('file', 'sm')}<span>Ver propuesta</span></a>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="btn ghost icon menu-btn" id="menuBtn" aria-label="Menú">${icon('menu')}</button>
            <div class="global-search">
              ${icon('search', 'sm')}
              <input id="gsearch" type="search" placeholder="Buscar cliente por nombre, teléfono, email… ( / )" autocomplete="off">
              <div class="search-results hidden" id="gresults"></div>
            </div>
            <div class="topbar-right">
              <button class="btn primary sm" id="quickAdd">${icon('userPlus', 'sm')}<span class="hide-sm">Nuevo prospecto</span></button>
              <button class="btn ghost icon" id="themeBtn" title="Cambiar tema">${icon('moon')}</button>
              <label class="user-chip" title="Usuario activo (temporal hasta tener login)">
                ${UI.avatar(me)}
                <select id="userSwitch" aria-label="Usuario activo">
                  ${Store.activeUsers().map((u) => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${U.esc(u.name)} · ${ROLES[u.role].name}</option>`).join('')}
                </select>
              </label>
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
    document.getElementById('userSwitch').onchange = (e) => { Store.setCurrentUser(e.target.value); shell(); route(); UI.toast('Ahora ves el CRM como ' + Store.currentUser().name); };
    document.getElementById('themeBtn').onclick = toggleTheme;
    document.getElementById('quickAdd').onclick = () => Views.clientes.openForm();
    initSearch();
    renderNav();
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = NAV.filter((n) => !n.perm || Store.can(n.perm)).map((n) => {
      if (n.section) return `<div class="nav-section">${n.section}</div>`;
      const b = n.badge ? n.badge() : 0;
      const active = current.view === n.id || (n.id === 'clientes' && current.view === 'cliente');
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
      const res = Store.myClients().filter((c) =>
        U.normalize(`${c.name} ${c.company} ${c.email} ${c.city}`).includes(q) || (qd.length >= 3 && U.cleanPhone(c.phone + ' ' + c.phone2).includes(qd))
      ).slice(0, 8);
      idx = -1;
      box.innerHTML = res.length ? res.map((c) => `
        <a href="#/cliente/${c.id}"><div class="row between"><strong>${U.esc(c.name)}</strong>${UI.tempBadge(c.temperature)}</div>
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
    if (!v) { location.hash = '#/dashboard'; return; }
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
  const refresh = U.debounce(() => {
    if (document.querySelector('.modal-backdrop')) { renderNav(); return; }
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
    await Store.init();
    UI.initTooltips();
    shell();
    Store.onChange(refresh);
    window.addEventListener('hashchange', route);
    route();
  }

  return { start, route, refresh, renderNav, shell, current: () => current };
})();

document.addEventListener('DOMContentLoaded', App.start);
