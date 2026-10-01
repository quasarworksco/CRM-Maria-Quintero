/* =========================================================
   Store — capa de datos
   ---------------------------------------------------------
   Todo el CRM lee de una caché en memoria y escribe por
   documento a través de un "adaptador":
   - LocalAdapter: guarda en el navegador (demo sin nube).
   - FirestoreAdapter: guarda en Firebase Firestore y escucha
     cambios en tiempo real, así todo el equipo ve lo mismo.
   ========================================================= */
const COLLECTIONS = ['users', 'clients', 'activities', 'tasks', 'products', 'orders', 'payments', 'candidates', 'candidateActivities'];
// Colecciones de Reclutamiento: si las reglas aún no las permiten, el resto del CRM sigue funcionando
const OPTIONAL_COLLECTIONS = ['candidates', 'candidateActivities'];

// Firestore no acepta campos undefined: el viaje por JSON los elimina
const cleanDoc = (d) => JSON.parse(JSON.stringify(d));

const LocalAdapter = {
  name: 'local',
  KEY: 'crm_mq_db_v2',
  async load(ctx) {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { db = null; }
    if (!db || !db.users) { db = ctx.seed(); this.replaceAll(db); }
    COLLECTIONS.forEach((c) => (db[c] || []).forEach((d) => normalizeDoc(c, d)));
    return db;
  },
  _timer: null,
  _db: null,
  put(_col, _doc, db) { this._flush(db); },
  del(_col, _id, db) { this._flush(db); },
  putSettings(_s, db) { this._flush(db); },
  replaceAll(db) { this._flush(db, true); },
  _flush(db, now) {
    clearTimeout(this._timer);
    const write = () => {
      try { localStorage.setItem(this.KEY, JSON.stringify(db)); }
      catch (e) { UI && UI.toast('No se pudo guardar: almacenamiento lleno', 'bad'); }
    };
    if (now) write(); else this._timer = setTimeout(write, 150);
  }
};

const FirestoreAdapter = {
  name: 'firestore',
  SDK: 'https://www.gstatic.com/firebasejs/10.14.1/',
  fs: null,
  fdb: null,
  cache: null,
  appMod: null,
  authMod: null,
  auth: null,
  access: null, // { email, role, userId, isOwner } de la persona que inició sesión

  async load(ctx) {
    const cfg = window.CRM_CONFIG.firebase;
    this.cfg = { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId };
    const appMod = this.appMod = await import(this.SDK + 'firebase-app.js');
    const [fs, authMod] = await Promise.all([import(this.SDK + 'firebase-firestore.js'), import(this.SDK + 'firebase-auth.js')]);
    this.fs = fs;
    this.authMod = authMod;
    const app = appMod.initializeApp(this.cfg);
    this.auth = authMod.getAuth(app);
    // Caché local persistente: el CRM sigue funcionando si se cae el internet y sincroniza al volver
    try { this.fdb = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
    catch (e) { this.fdb = fs.getFirestore(app); }

    // 1) Sesión: si no hay nadie conectado, la app muestra la pantalla de ingreso
    let user = await new Promise((resolve) => { const off = authMod.onAuthStateChanged(this.auth, (u) => { off(); resolve(u); }); });
    if (!user) user = await ctx.login(this);
    const email = String(user.email || '').trim().toLowerCase();
    const isOwner = !!ctx.ownerEmail && email === ctx.ownerEmail;

    // 2) Permiso: la cuenta principal siempre entra; el resto necesita acceso activo
    let access = null;
    try {
      const snap = await fs.getDoc(fs.doc(this.fdb, 'access', email));
      access = snap.exists() ? snap.data() : null;
    } catch (e) { if (!isOwner) throw e; }
    if (!isOwner && (!access || access.active === false)) {
      await authMod.signOut(this.auth);
      throw Object.assign(new Error(access ? 'Tu usuario está desactivado. Habla con la administradora.' : 'Tu correo no tiene acceso a este CRM. Pídele a la administradora que te cree un usuario.'), { code: 'no-access', email });
    }
    const role = isOwner ? 'admin' : access.role;
    this.access = { email, role, userId: access ? access.userId : null, isOwner };
    const manager = role === 'admin' || role === 'supervisor';

    // 3) La base en línea empieza vacía: solo se crea la configuración la primera vez.
    //    (Los datos de ejemplo viven únicamente en la demo sin conexión, ?local=1)
    const settingsRef = fs.doc(this.fdb, 'meta', 'settings');
    if (role === 'admin') {
      try {
        await fs.runTransaction(this.fdb, async (tx) => {
          const snap = await tx.get(settingsRef);
          if (!snap.exists()) tx.set(settingsRef, cleanDoc(Object.assign({}, ctx.defaults, { createdAt: new Date().toISOString(), demoData: false, schemaVersion: 3 })));
        });
      } catch (e) {
        // Sin internet la transacción falla: se sigue con lo guardado en la caché local
        if (e && e.code === 'permission-denied') throw e;
        console.warn('No se pudo verificar la base (¿sin conexión?)', e);
      }
    }

    // 4) Escuchar cambios en vivo. Cada agente solo recibe sus clientes y sus ventas.
    const cache = this.cache = { settings: Object.assign({}, ctx.defaults) };
    COLLECTIONS.forEach((c) => { cache[c] = []; });
    const mine = this.access.userId || '__sin_usuario__';
    const source = (col) => {
      const ref = fs.collection(this.fdb, col);
      if (manager) return ref;
      if (col === 'clients') return fs.query(ref, fs.where('ownerId', '==', mine));
      if (col === 'orders') return fs.query(ref, fs.where('userId', '==', mine));
      if (col === 'candidates') return fs.query(ref, fs.where('ownerId', '==', mine));
      return ref;
    };
    this.denied = [];
    const listen = (ref, apply, optional) => new Promise((resolve, reject) => {
      let first = true;
      fs.onSnapshot(ref, (snap) => {
        apply(snap);
        if (first) { first = false; resolve(); } else ctx.onRemote();
      }, (err) => {
        console.error(err);
        if (first) { first = false; if (optional) { this.denied.push(optional); resolve(); } else reject(err); }
        else UI.toast('Se perdió la conexión con la base de datos', 'bad');
      });
    });
    await Promise.all([
      ...COLLECTIONS.map((col) => listen(source(col), (snap) => { cache[col] = snap.docs.map((d) => normalizeDoc(col, Object.assign({ id: d.id }, d.data()))); }, OPTIONAL_COLLECTIONS.includes(col) && col)),
      listen(settingsRef, (snap) => { cache.settings = Object.assign({}, ctx.defaults, snap.exists() ? snap.data() : {}); })
    ]);

    // Si la sesión se cierra en otra pestaña, se recarga
    authMod.onAuthStateChanged(this.auth, (u) => { if (!u || String(u.email || '').toLowerCase() !== email) location.reload(); });
    return cache;
  },

  /* ---------- Cuentas (Firebase Authentication) ---------- */
  signIn(email, pass) { return this.authMod.signInWithEmailAndPassword(this.auth, email.trim(), pass).then((c) => c.user); },
  createOwnAccount(email, pass) { return this.authMod.createUserWithEmailAndPassword(this.auth, email.trim(), pass).then((c) => c.user); },
  resetPassword(email) { return this.authMod.sendPasswordResetEmail(this.auth, email.trim()); },
  // Al cerrar sesión se borra también la copia local de los datos (computadores compartidos)
  async signOut() {
    try { sessionStorage.removeItem('crm_mq_view_as'); } catch (e) {}
    await this.authMod.signOut(this.auth);
    try { await this.fs.terminate(this.fdb); await this.fs.clearIndexedDbPersistence(this.fdb); } catch (e) { console.warn('No se pudo limpiar la caché local', e); }
    location.reload();
  },
  // Crea la cuenta de otra persona sin cerrar la sesión de la administradora (usa una segunda instancia)
  async createAccount(email, pass) {
    const sec = this.appMod.getApps().find((a) => a.name === 'crm-alta') || this.appMod.initializeApp(this.cfg, 'crm-alta');
    const secAuth = this.authMod.getAuth(sec);
    try { await this.authMod.createUserWithEmailAndPassword(secAuth, email.trim(), pass); }
    finally { await this.authMod.signOut(secAuth).catch(() => {}); }
  },
  // Documento de acceso por correo: es lo que leen las reglas de seguridad para saber el rol
  putAccess(u) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) return Promise.resolve();
    return this.fs.setDoc(this.fs.doc(this.fdb, 'access', email), { email, userId: u.id, role: u.role, active: u.active !== false, updatedAt: new Date().toISOString() }).catch((e) => this._err(e));
  },

  _err(e) { console.error(e); UI.toast('No se pudo guardar en la nube: ' + (e.code || e.message), 'bad'); },
  put(col, d) { this.fs.setDoc(this.fs.doc(this.fdb, col, d.id), cleanDoc(d)).catch((e) => this._err(e)); },
  del(col, id) { this.fs.deleteDoc(this.fs.doc(this.fdb, col, id)).catch((e) => this._err(e)); },
  putSettings(s) { this.fs.setDoc(this.fs.doc(this.fdb, 'meta', 'settings'), cleanDoc(s)).catch((e) => this._err(e)); },

  // Escritura masiva en lotes (Firestore permite 500 operaciones por lote)
  async _batchOps(ops) {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = this.fs.writeBatch(this.fdb);
      ops.slice(i, i + 450).forEach((op) => op(batch));
      await batch.commit();
    }
  },
  _writeAll(data) {
    const ops = [];
    COLLECTIONS.forEach((col) => (data[col] || []).forEach((d) => ops.push((b) => b.set(this.fs.doc(this.fdb, col, d.id), cleanDoc(d)))));
    return this._batchOps(ops);
  },
  // Reemplaza toda la base (restaurar respaldo, datos demo, empezar de cero)
  async replaceAll(data) {
    const ops = [];
    const keep = new Set(COLLECTIONS.flatMap((col) => (data[col] || []).map((d) => col + '/' + d.id)));
    COLLECTIONS.forEach((col) => this.cache[col].forEach((d) => { if (!keep.has(col + '/' + d.id)) ops.push((b) => b.delete(this.fs.doc(this.fdb, col, d.id))); }));
    await this._batchOps(ops);
    await this._writeAll(data);
    if (data.settings) await this.fs.setDoc(this.fs.doc(this.fdb, 'meta', 'settings'), cleanDoc(data.settings));
  }
};

// Motivos de pérdida (los de los resultados de llamada van primero)
const LOST_REASON_DEFAULTS = ['Sin respuesta (12 intentos)', 'No interesado', 'Número incorrecto', 'Pidió no volver a llamar', 'Precio alto', 'Compró con la competencia', 'No lo necesita', 'Sin presupuesto', 'Otro'];

// Fuentes / cómo llegó (las nuevas van primero; se conservan las anteriores)
const SOURCE_DEFAULTS = ['Florida Mall / Tienda', 'Feria / Evento', 'Referido', 'Cliente anterior', 'Leads', 'Facebook', 'Instagram', 'Indeed', 'Base de datos', 'Llamada entrante', 'Llamada en frío', 'Google', 'WhatsApp', 'Volante', 'Sitio web', 'Cliente recurrente'];

// Ajusta documentos guardados con versiones anteriores del CRM
function normalizeDoc(col, d) {
  if (col === 'clients' && d && STAGE_ALIASES[d.stage]) d.stage = STAGE_ALIASES[d.stage];
  return d;
}

const Store = (() => {
  let db = null;
  // ?local=1 fuerza la demo en el navegador aunque Firestore esté configurado
  const forceLocal = /[?&]local=1/.test(location.search);
  const adapter = window.CRM_CONFIG.firebase.enabled && !forceLocal ? FirestoreAdapter : LocalAdapter;
  const listeners = new Set();

  const DEFAULT_SETTINGS = {
    companyName: 'Maria Quintero',
    companyTagline: 'Filtros de aire y soluciones para el hogar',
    currency: 'USD',
    locale: 'es-US',
    phoneCountryCode: '1',
    sources: SOURCE_DEFAULTS.slice(),
    lostReasons: LOST_REASON_DEFAULTS.slice(),
    maxAttempts: 12,
    // Reclutamiento (módulo aparte de ventas)
    candidateSources: ['Indeed', 'Referido', 'Facebook', 'Instagram', 'Florida Mall / Tienda', 'Feria / Evento', 'Otra fuente'],
    positions: ['Agente de ventas telefónicas', 'Vendedor(a) de campo', 'Técnico(a) instalador', 'Supervisor(a)', 'Recepcionista', 'Otro'],
    languages: ['Español', 'Inglés', 'Bilingüe (Español/Inglés)', 'Otro'],
    categories: ['Filtros de aire', 'Purificadores', 'Filtros de agua', 'Deshumidificadores', 'Accesorios', 'Servicios'],
    staleDays: 7,
    callScript:
      'Hola, ¿hablo con {nombre}? Mucho gusto, le habla {agente} de {empresa}.\n\n' +
      'Le llamo porque estamos ayudando a familias de {ciudad} a mejorar la calidad del aire de su hogar. ' +
      '¿Sabía que el aire dentro de casa puede estar hasta 5 veces más contaminado que el de afuera?\n\n' +
      'Preguntas clave:\n• ¿Cada cuánto cambia los filtros del aire acondicionado?\n• ¿Alguien en casa sufre de alergias o asma?\n• ¿Tiene mascotas?\n\n' +
      'Cierre: "Esta semana tenemos una promoción en el kit de filtros + instalación. ¿Le agendo la entrega para el jueves o prefiere el sábado?"'
  };

  function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  async function init() {
    db = await adapter.load({ defaults: DEFAULT_SETTINGS, seed: () => Seed.build(DEFAULT_SETTINGS), onRemote: emit, ownerEmail: ownerEmail(), login: (a) => App.login(a) });
    COLLECTIONS.forEach((c) => { db[c] = db[c] || []; });
    db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
    ensureOwner();
    migrateSettings();
    // Limpieza única: si la base en línea todavía tiene los datos de ejemplo de las pruebas,
    // se borran (se conservan las cuentas reales y la configuración) para empezar en cero.
    if (authMode() && adapter.access && adapter.access.role === 'admin' && db.settings.demoData === true) {
      await wipeAll();
      db.settings.cleanedDemoAt = new Date().toISOString();
      saveSettings({ demoData: false, cleanedDemoAt: db.settings.cleanedDemoAt });
    }
  }
  const mode = () => adapter.name;
  // Colecciones que las reglas de Firestore todavía no permiten leer (p. ej. Reclutamiento sin publicar las reglas nuevas)
  const deniedCollections = () => (adapter.denied || []).slice();

  // Agrega las fuentes nuevas a la configuración guardada (una sola vez)
  function migrateSettings() {
    const v = db.settings.schemaVersion || 1;
    if (v >= 3) return;
    if (authMode() && (!adapter.access || adapter.access.role !== 'admin')) return;
    const norm = (x) => U.normalize(x).trim();
    const mergeFirst = (defaults, have) => defaults.concat((have || []).filter((x) => !defaults.some((d) => norm(d) === norm(x))));
    const patch = { schemaVersion: 3 };
    if (v < 2) patch.sources = mergeFirst(SOURCE_DEFAULTS, db.settings.sources);
    patch.lostReasons = mergeFirst(LOST_REASON_DEFAULTS.slice(0, 4), db.settings.lostReasons);
    if (!db.settings.maxAttempts) patch.maxAttempts = 12;
    saveSettings(patch);
  }

  // Garantiza que la cuenta principal exista, sea administradora y esté activa
  const ownerEmail = () => String((window.CRM_CONFIG || {}).ownerEmail || '').trim().toLowerCase();
  const isOwner = (u) => !!u && !!ownerEmail() && String(u.email || '').trim().toLowerCase() === ownerEmail();
  function ensureOwner() {
    const email = ownerEmail();
    if (!email) return;
    if (authMode() && (!adapter.access || adapter.access.role !== 'admin')) return;
    let owner = db.users.find(isOwner);
    if (!owner) {
      // Datos anteriores: se asigna el correo a la primera administradora con correo de ejemplo
      owner = db.users.find((u) => u.role === 'admin' && /@empresa\.com$/i.test(u.email || '')) || null;
      if (owner) update('users', owner.id, { email, authAccount: true });
      else owner = insert('users', { name: 'Maria Quintero', email, phone: '', role: 'admin', active: true, authAccount: true, profileCompleted: false, callGoal: 0, salesGoal: 0, color: USER_COLORS[0] });
      owner = get('users', owner.id);
    }
    if (owner.role !== 'admin' || !owner.active || !owner.authAccount) update('users', owner.id, { role: 'admin', active: true, authAccount: true });
    if (authMode() && adapter.access && adapter.access.role === 'admin') syncAccess(get('users', owner.id));
  }

  const all = (col) => db[col];
  const get = (col, id) => db[col].find((x) => x.id === id) || null;
  const where = (col, fn) => db[col].filter(fn);

  function insert(col, doc) {
    const now = new Date().toISOString();
    const d = Object.assign({ id: U.uid(col.slice(0, 2) + '_'), createdAt: now, updatedAt: now }, doc);
    db[col].push(d);
    adapter.put(col, d, db);
    emit();
    return d;
  }
  function update(col, id, patch) {
    const d = get(col, id);
    if (!d) return null;
    Object.assign(d, patch, { updatedAt: new Date().toISOString() });
    adapter.put(col, d, db);
    emit();
    return d;
  }
  function remove(col, id) {
    const i = db[col].findIndex((x) => x.id === id);
    if (i >= 0) { db[col].splice(i, 1); adapter.del(col, id, db); emit(); }
  }
  const settings = () => (db ? db.settings : DEFAULT_SETTINGS);
  function saveSettings(patch) { Object.assign(db.settings, patch); adapter.putSettings(db.settings, db); emit(); }

  /* ---------- Sesión ---------- */
  // Con Firestore la persona es la que inició sesión; en la demo sin conexión se elige con el selector.
  const SESSION_KEY = 'crm_mq_session';
  const VIEW_AS_KEY = 'crm_mq_view_as';
  const authMode = () => adapter.name === 'firestore';
  const lower = (x) => String(x || '').trim().toLowerCase();
  function realUser() {
    if (authMode() && adapter.access) {
      const a = adapter.access;
      return db.users.find((u) => lower(u.email) === a.email)
        || { id: a.userId || '__yo__', name: a.email, email: a.email, role: a.role, active: true, profileCompleted: true };
    }
    let id = null;
    try { id = localStorage.getItem(SESSION_KEY); } catch (e) {}
    let u = id && get('users', id);
    if (!u || !u.active) u = db.users.find((x) => x.role === 'admin' && x.active) || db.users[0];
    return u;
  }
  // "Ver como": la administración puede ver el CRM como otra persona (solo vista previa)
  function viewAsId() { try { return sessionStorage.getItem(VIEW_AS_KEY); } catch (e) { return null; } }
  function currentUser() {
    const me = realUser();
    if (authMode() && me.role === 'admin') {
      const other = viewAsId() && get('users', viewAsId());
      if (other && other.id !== me.id && other.active) return other;
    }
    return me;
  }
  const isViewingAs = () => currentUser().id !== realUser().id;
  function setViewAs(id) { try { id ? sessionStorage.setItem(VIEW_AS_KEY, id) : sessionStorage.removeItem(VIEW_AS_KEY); } catch (e) {} emit(); }
  function setCurrentUser(id) {
    if (authMode()) return setViewAs(id === realUser().id ? null : id);
    try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
    emit();
  }
  // Guarda el rol y el estado de la persona donde lo leen las reglas de seguridad
  function syncAccess(u) { return adapter.putAccess ? adapter.putAccess(u) : Promise.resolve(); }
  const auth = () => (authMode() ? adapter : null);

  /* ---------- Permisos ---------- */
  const isManager = (u = currentUser()) => u.role === 'admin' || u.role === 'supervisor';
  const isAdmin = (u = currentUser()) => u.role === 'admin';
  function can(action, u = currentUser()) {
    const rules = {
      manageUsers: isAdmin(u),
      manageSettings: isAdmin(u),
      manageProducts: isAdmin(u),
      deleteRecords: isAdmin(u),
      reassign: isManager(u),
      viewAll: isManager(u),
      viewReports: isManager(u),
      exportData: isManager(u)
    };
    return !!rules[action];
  }
  // Datos visibles según el rol
  const myClients = () => (can('viewAll') ? db.clients : db.clients.filter((c) => c.ownerId === currentUser().id));
  const myOrders = () => (can('viewAll') ? db.orders : db.orders.filter((o) => o.userId === currentUser().id || (get('clients', o.clientId) || {}).ownerId === currentUser().id));
  const myTasks = () => (can('viewAll') ? db.tasks : db.tasks.filter((t) => t.userId === currentUser().id));
  const myActivities = () => (can('viewAll') ? db.activities : db.activities.filter((a) => a.userId === currentUser().id));
  const canSeeClient = (c) => c && (can('viewAll') || c.ownerId === currentUser().id);
  const activeUsers = () => db.users.filter((u) => u.active);
  const sellers = () => db.users.filter((u) => u.active && (u.role !== 'admin' || u.sells));

  /* ---------- Lógica de negocio ---------- */
  const orderPaid = (o) => U.sum(db.payments.filter((p) => p.orderId === o.id), (p) => p.amount);
  const orderBalance = (o) => (o.status === 'cancelada' ? 0 : Math.max(0, (o.total || 0) - orderPaid(o)));
  function orderPayStatus(o) {
    if (o.status === 'cancelada') return { id: 'cancelada', name: 'Cancelada', cls: 'bad' };
    const paid = orderPaid(o);
    if (paid >= (o.total || 0) - 0.009) return { id: 'pagada', name: 'Pagada', cls: 'good' };
    if (paid > 0) return { id: 'parcial', name: 'Abono parcial', cls: 'warn' };
    return { id: 'sin_pago', name: 'Sin pago', cls: 'bad' };
  }
  const calcOrderTotal = (items, discount = 0, shipping = 0, taxRate = 0) => {
    const subtotal = U.sum(items, (i) => (Number(i.qty) || 0) * (Number(i.price) || 0));
    const afterDisc = Math.max(0, subtotal - (Number(discount) || 0));
    const tax = afterDisc * ((Number(taxRate) || 0) / 100);
    return { subtotal, tax, total: afterDisc + tax + (Number(shipping) || 0) };
  };
  const clientOrders = (clientId) => db.orders.filter((o) => o.clientId === clientId);
  const clientBalance = (clientId) => U.sum(clientOrders(clientId), orderBalance);
  const clientRevenue = (clientId) => U.sum(clientOrders(clientId).filter((o) => o.status !== 'cancelada'), (o) => o.total);
  const nextOrderNumber = () => {
    const max = db.orders.reduce((m, o) => Math.max(m, parseInt(String(o.number).replace(/\D/g, ''), 10) || 0), 1000);
    return 'V-' + (max + 1);
  };

  // Prioridad del prospecto 0-100 (para ordenar colas): etapa + cita próxima + recencia del contacto
  function leadScore(c) {
    if (c.stage === 'ganado') return 100;
    if (c.stage === 'perdido' || c.dnc) return 0;
    let s = stageById(c.stage).prob * 70;
    if (c.appointment && c.appointment.at && c.appointment.status !== 'cancelada' && new Date(c.appointment.at) > new Date()) s += 15;
    if (c.lastContact) {
      const days = (Date.now() - new Date(c.lastContact).getTime()) / U.DAY;
      s += days < 3 ? 10 : days < 7 ? 6 : days < 14 ? 3 : 0;
    }
    return Math.max(0, Math.min(99, Math.round(s)));
  }
  const isStale = (c) => OPEN_STAGES.includes(c.stage) && (!c.lastContact || (Date.now() - new Date(c.lastContact).getTime()) / U.DAY > (settings().staleDays || 7));

  function logActivity(data) {
    const a = insert('activities', Object.assign({ userId: currentUser().id }, data));
    return a;
  }

  function changeStage(clientId, stage, extra = {}) {
    const c = get('clients', clientId);
    if (!c || c.stage === stage) return;
    const from = c.stage;
    const patch = Object.assign({ stage }, extra);
    if (stage === 'ganado') patch.wonAt = new Date().toISOString();
    if (stage === 'perdido') patch.lostAt = new Date().toISOString();
    update('clients', clientId, patch);
    logActivity({ clientId, type: 'etapa', text: `${stageById(from).name} → ${stageById(stage).name}${extra.lostReason ? ' · Motivo: ' + extra.lostReason : ''}` });
  }

  // Registrar un intento de contacto. Guarda solo el número de intento, la fecha, la hora y la agente;
  // actualiza el último resultado, el contador de intentos y el próximo seguimiento, y mueve la etapa.
  const maxAttempts = () => Number(settings().maxAttempts) || 12;
  const attemptsOf = (clientId) => U.sortBy(db.activities.filter((a) => a.clientId === clientId && isAttempt(a)), (a) => a.createdAt);
  function logCall(clientId, { outcome, duration = 0, notes = '', nextFollowUp, type = 'llamada' }) {
    const c = get('clients', clientId);
    const o = outcomeById(outcome);
    const now = new Date().toISOString();
    const attempt = (c.callCount || 0) + 1;
    logActivity({ clientId, type, outcome, duration, text: notes, attempt });
    const patch = { lastOutcome: outcome || '', lastContact: now, lastCallAt: now, callCount: attempt };
    if (o && !o.contact) patch.noAnswerCount = (c.noAnswerCount || 0) + 1; else patch.noAnswerCount = 0;
    if (o && o.contact && !c.reachedAt) patch.reachedAt = now;
    if (o && o.dnc) patch.dnc = true;
    if (nextFollowUp !== undefined) patch.nextFollowUp = nextFollowUp;
    else if (o && o.followDays) patch.nextFollowUp = new Date(Date.now() + o.followDays * U.DAY).toISOString();
    else if (o && o.followDays === null) patch.nextFollowUp = null;
    update('clients', clientId, patch);
    const order = STAGES.map((x) => x.id);
    const cur = get('clients', clientId).stage;
    // El resultado manda: no interesado, número incorrecto o no volver a llamar cierran el prospecto
    if (o && o.lose) {
      if (OPEN_STAGES.includes(cur)) changeStage(clientId, 'perdido', { lostReason: o.lose, nextFollowUp: null });
      return;
    }
    if (o && o.stage && OPEN_STAGES.includes(cur) && order.indexOf(o.stage) > order.indexOf(cur)) changeStage(clientId, o.stage);
    // Regla de los intentos: si se completan sin lograr contacto, se archiva como Perdido / Sin respuesta
    const after = get('clients', clientId);
    if (attempt >= maxAttempts() && ['nuevo', 'intentando'].includes(after.stage)) {
      changeStage(clientId, 'perdido', { lostReason: `Sin respuesta (${maxAttempts()} intentos)`, nextFollowUp: null, archivedNoAnswer: true });
      logActivity({ clientId, type: 'sistema', text: `Se completaron ${maxAttempts()} intentos sin lograr contacto. El prospecto quedó archivado como Perdido / Sin respuesta, con todo su historial.` });
    }
  }
  // Al borrar un intento (solo la administración) el contador se recalcula
  function removeAttempt(activityId) {
    const a = get('activities', activityId);
    if (!a) return;
    remove('activities', activityId);
    if (isAttempt(a)) update('clients', a.clientId, { callCount: attemptsOf(a.clientId).length });
  }

  /* ---------- Citas (demostraciones) ---------- */
  const APPT_STATUS = { agendada: 'Agendada', confirmada: 'Confirmada', realizada: 'Demo realizada', cancelada: 'Cancelada' };
  const demoByName = (a) => (a && (a.demoBy ? (get('users', a.demoBy) || {}).name : '') ) || (a && a.demoByName) || 'Sin asignar';
  const activeAppointment = (c) => (c && c.appointment && c.appointment.at && ['agendada', 'confirmada'].includes(c.appointment.status)) ? c.appointment : null;
  function saveAppointment(clientId, { at, address, demoBy = '', demoByName: extName = '', notes = '' }) {
    const c = get('clients', clientId);
    const prev = activeAppointment(c);
    const now = new Date().toISOString();
    const appt = { at, address: address || '', demoBy, demoByName: demoBy ? '' : extName, notes, status: 'agendada', createdAt: prev ? prev.createdAt : now, updatedAt: now, by: currentUser().id };
    // El seguimiento queda para confirmar la cita el día anterior (o el mismo día si es muy pronto)
    const t = new Date(at).getTime();
    const confirmAt = t - U.DAY > Date.now() ? new Date(t - U.DAY) : new Date(Math.max(Date.now(), t - 2 * 3600000));
    update('clients', clientId, { appointment: appt, nextFollowUp: confirmAt.toISOString() });
    logActivity({ clientId, type: 'cita', kind: prev ? 'reagendada' : 'agendada', text: `${prev ? 'Cita reagendada' : 'Cita agendada'} para el ${U.dateTime(at)}${address ? ' · ' + address : ''} · Demostración: ${demoByName(appt)}${notes ? '\n' + notes : ''}` });
    if (OPEN_STAGES.includes(c.stage) && c.stage !== 'cita_agendada') changeStage(clientId, 'cita_agendada');
  }
  function setAppointmentStatus(clientId, status, note = '') {
    const c = get('clients', clientId);
    if (!c || !c.appointment) return;
    update('clients', clientId, { appointment: Object.assign({}, c.appointment, { status, updatedAt: new Date().toISOString() }) });
    const label = { confirmada: 'Cita confirmada', realizada: 'Demostración realizada', cancelada: 'Cita cancelada' }[status];
    logActivity({ clientId, type: 'cita', kind: status, text: label + (note ? ' · ' + note : '') });
    if (status === 'confirmada') changeStage(clientId, 'cita_confirmada');
    if (status === 'realizada') { changeStage(clientId, 'demo_realizada'); update('clients', clientId, { nextFollowUp: new Date(Date.now() + U.DAY).toISOString() }); }
    if (status === 'cancelada' && APPT_STAGES.includes(c.stage)) changeStage(clientId, 'contactado');
  }

  function registerPayment({ orderId, amount, method, date, reference, notes }) {
    const o = get('orders', orderId);
    const p = insert('payments', { orderId, clientId: o.clientId, userId: currentUser().id, amount: Number(amount), method, date: date || new Date().toISOString(), reference, notes });
    logActivity({ clientId: o.clientId, type: 'pago', text: `Pago de ${U.money(amount)} (${method}) a la venta ${o.number}. Saldo: ${U.money(orderBalance(o))}` });
    return p;
  }

  function createOrder(data) {
    const t = calcOrderTotal(data.items, data.discount, data.shipping, data.taxRate);
    const owner = (get('clients', data.clientId) || {}).ownerId;
    const o = insert('orders', Object.assign({ number: nextOrderNumber(), userId: owner || currentUser().id, status: 'pendiente' }, data, { subtotal: t.subtotal, tax: t.tax, total: t.total }));
    // Descontar inventario
    data.items.forEach((it) => {
      const p = get('products', it.productId);
      if (p && p.trackStock) update('products', p.id, { stock: (p.stock || 0) - (Number(it.qty) || 0) });
    });
    logActivity({ clientId: o.clientId, type: 'venta', text: `Venta ${o.number} por ${U.money(o.total)}: ${data.items.map((i) => i.qty + '× ' + i.name).join(', ')}` });
    const c = get('clients', o.clientId);
    if (c && c.stage !== 'ganado') changeStage(c.id, 'ganado');
    return o;
  }

  function reassign(clientIds, userId) {
    const u = get('users', userId);
    clientIds.forEach((id) => {
      const c = get('clients', id);
      if (!c || c.ownerId === userId) return;
      update('clients', id, { ownerId: userId });
      logActivity({ clientId: id, type: 'asignacion', text: `Asignado a ${u ? u.name : '—'}` });
    });
  }

  function deleteClient(id) {
    db.activities.filter((a) => a.clientId === id).forEach((a) => remove('activities', a.id));
    db.tasks.filter((t) => t.clientId === id).forEach((t) => remove('tasks', t.id));
    remove('clients', id);
  }

  /* ---------- Respaldo ---------- */
  const exportJSON = () => JSON.stringify(db, null, 2);
  // Reemplaza toda la información. En local cambia la caché; en Firestore escribe y los listeners actualizan.
  async function replaceData(data) {
    COLLECTIONS.forEach((c) => { data[c] = data[c] || []; });
    data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    if (adapter.name === 'local') { db = data; adapter.replaceAll(db); emit(); return; }
    await adapter.replaceAll(data);
    emit();
  }
  async function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.users) || !Array.isArray(data.clients)) throw new Error('Archivo no válido');
    await replaceData(data);
  }
  // Cuentas reales (con acceso al CRM): nunca se borran al recargar la demo o empezar de cero
  const realAccounts = () => db.users.filter((u) => u.authAccount || isOwner(u));
  function resetDemo() {
    const d = Seed.build(Object.assign({}, db.settings, { demoData: true }));
    const keep = realAccounts();
    const emails = new Set(keep.map((u) => lower(u.email)));
    d.users = d.users.filter((u) => !emails.has(lower(u.email))).concat(keep);
    return replaceData(d);
  }
  function wipeAll() {
    const keep = realAccounts();
    if (!keep.length) keep.push(Object.assign({}, realUser(), { role: 'admin', active: true }));
    const data = { settings: Object.assign({}, db.settings, { demoData: false }) };
    COLLECTIONS.forEach((c) => { data[c] = []; });
    data.users = keep.map((u) => Object.assign({}, u));
    return replaceData(data);
  }

  return {
    init, all, get, where, insert, update, remove, settings, saveSettings, onChange: (fn) => listeners.add(fn),
    currentUser, setCurrentUser, isManager, isAdmin, can, myClients, myOrders, myTasks, myActivities, canSeeClient, activeUsers, sellers,
    orderPaid, orderBalance, orderPayStatus, calcOrderTotal, clientOrders, clientBalance, clientRevenue, nextOrderNumber,
    leadScore, isStale, logActivity, changeStage, logCall, registerPayment, createOrder, reassign, deleteClient,
    exportJSON, importJSON, resetDemo, wipeAll, mode, deniedCollections, isOwner,
    saveAppointment, setAppointmentStatus, maxAttempts, attemptsOf, removeAttempt, activeAppointment, demoByName, APPT_STATUS,
    realUser, isViewingAs, setViewAs, authMode, syncAccess, auth
  };
})();

/* =========================================================
   Datos de demostración (para ver el CRM funcionando)
   ========================================================= */
const Seed = {
  build(settings) {
    const r = U.rng(20260929);
    const now = Date.now();
    const iso = (t) => new Date(t).toISOString();
    const db = { settings: Object.assign({}, settings) };
    COLLECTIONS.forEach((c) => { db[c] = []; });

    const users = [
      { name: 'Maria Quintero', email: (window.CRM_CONFIG && window.CRM_CONFIG.ownerEmail) || 'maria@empresa.com', phone: '(305) 555-0100', role: 'admin', callGoal: 0, salesGoal: 0 },
      { name: 'Laura Gómez', email: 'laura@empresa.com', phone: '(305) 555-0101', role: 'supervisor', callGoal: 40, salesGoal: 8000, sells: true },
      { name: 'Carlos Rivera', email: 'carlos@empresa.com', phone: '(305) 555-0102', role: 'agente', callGoal: 60, salesGoal: 6000 },
      { name: 'Andrea Torres', email: 'andrea@empresa.com', phone: '(305) 555-0103', role: 'agente', callGoal: 60, salesGoal: 6000 },
      { name: 'Jorge Martínez', email: 'jorge@empresa.com', phone: '(305) 555-0104', role: 'agente', callGoal: 50, salesGoal: 5000 },
      { name: 'Sofía Herrera', email: 'sofia@empresa.com', phone: '(305) 555-0105', role: 'agente', callGoal: 50, salesGoal: 5000 }
    ].map((u, i) => Object.assign({ id: 'us_' + (i + 1), active: true, color: USER_COLORS[i % USER_COLORS.length], createdAt: iso(now - 120 * U.DAY), updatedAt: iso(now) }, u));
    db.users = users;
    const agents = users.filter((u) => u.role !== 'admin');

    const products = [
      ['FA-1620', 'Filtro de aire 16x20x1 MERV 8', 'Filtros de aire', 18, 7],
      ['FA-2025', 'Filtro de aire 20x25x1 MERV 11', 'Filtros de aire', 24, 9],
      ['FA-1625', 'Filtro de aire 16x25x4 MERV 13', 'Filtros de aire', 42, 16],
      ['FA-KIT6', 'Kit 6 filtros (suscripción 6 meses)', 'Filtros de aire', 120, 45],
      ['PU-300', 'Purificador HEPA 300 m²', 'Purificadores', 349, 170],
      ['PU-150', 'Purificador HEPA compacto', 'Purificadores', 189, 90],
      ['AG-OSM', 'Sistema de ósmosis inversa 5 etapas', 'Filtros de agua', 459, 210],
      ['AG-DUCHA', 'Filtro de ducha anticloro', 'Filtros de agua', 45, 15],
      ['DH-50', 'Deshumidificador 50 pintas', 'Deshumidificadores', 279, 140],
      ['AC-UV', 'Lámpara UV para ducto', 'Accesorios', 159, 60],
      ['SV-INST', 'Instalación y revisión de sistema', 'Servicios', 89, 20],
      ['SV-DUCT', 'Limpieza de ductos', 'Servicios', 299, 90]
    ].map(([sku, name, category, price, cost], i) => ({ id: 'pr_' + (i + 1), sku, name, category, price, cost, stock: r.int(5, 80), trackStock: category !== 'Servicios', minStock: 8, active: true, imageUrl: '', description: '', createdAt: iso(now - 100 * U.DAY), updatedAt: iso(now) }));
    db.products = products;

    const first = ['Ana', 'Luis', 'Carmen', 'José', 'María', 'Pedro', 'Rosa', 'Miguel', 'Elena', 'Juan', 'Patricia', 'Ricardo', 'Gloria', 'Fernando', 'Lucía', 'Alberto', 'Diana', 'Héctor', 'Isabel', 'Raúl', 'Teresa', 'Óscar', 'Beatriz', 'Manuel', 'Claudia', 'Roberto', 'Silvia', 'Daniel', 'Mónica', 'Andrés', 'Natalia', 'Javier', 'Paola', 'Eduardo', 'Verónica', 'Samuel'];
    const last = ['García', 'Rodríguez', 'López', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Morales', 'Ortiz', 'Castillo', 'Vargas', 'Reyes', 'Jiménez', 'Mendoza', 'Ruiz', 'Álvarez', 'Romero', 'Navarro'];
    const cities = ['Miami', 'Hialeah', 'Doral', 'Kendall', 'Homestead', 'Fort Lauderdale', 'Pembroke Pines', 'Coral Gables', 'Miami Beach', 'Weston'];
    const streets = ['NW 7th St', 'SW 8th St', 'Coral Way', 'Bird Rd', 'Flagler St', 'NW 36th St', 'Biscayne Blvd', 'SW 40th St'];
    const companies = ['', '', '', '', 'Oficinas Brisa LLC', 'Clínica Dental Sonrisa', 'Restaurante El Fogón', 'Colegio San Marcos', 'Gimnasio Fit Zone', 'Hotel Palmeras'];
    const notesPool = ['Tiene 2 aires centrales', 'Hijo con asma, muy interesado en purificador', 'Pidió que la llamen después de las 5pm', 'Tiene 3 perros, cambia filtros cada mes', 'Casa de 2 pisos, 4 habitaciones', 'Prefiere WhatsApp', 'Compró filtros en Home Depot, compara precios', 'Quiere cotización para su oficina', ''];

    const stageWeights = [['nuevo', 16], ['intentando', 14], ['contactado', 14], ['cita_agendada', 9], ['cita_confirmada', 6], ['demo_realizada', 8], ['ganado', 20], ['perdido', 13]];
    const pickStage = () => { let t = r() * 100; for (const [s, w] of stageWeights) { if ((t -= w) < 0) return s; } return 'nuevo'; };
    const referrers = ['Gloria Pérez', 'Roberto Díaz', 'Carmen Ruiz', 'Luis Romero', 'Ana Vargas'];
    const events = ['Feria de Hogar Miami 2026', 'Expo Salud Doral', 'Feria Latina Kendall'];

    let orderNo = 1000;
    const N = 96;
    for (let i = 0; i < N; i++) {
      const fn = r.pick(first), ln = r.pick(last), ln2 = r.pick(last);
      const stage = pickStage();
      const owner = r.pick(agents);
      const created = now - r.int(1, 75) * U.DAY - r.int(0, 36000) * 1000;
      const city = r.pick(cities);
      const company = r.chance(0.2) ? r.pick(companies.filter(Boolean)) : '';
      const interest = [r.pick(products).id];
      if (r.chance(0.4)) interest.push(r.pick(products).id);
      const c = {
        id: 'cl_' + (i + 1),
        name: `${fn} ${ln} ${ln2}`,
        company,
        phone: `(${r.pick(['305', '786', '954'])}) ${r.int(200, 999)}-${String(r.int(0, 9999)).padStart(4, '0')}`,
        phone2: r.chance(0.2) ? `(786) ${r.int(200, 999)}-${String(r.int(0, 9999)).padStart(4, '0')}` : '',
        email: r.chance(0.6) ? `${U.normalize(fn)}.${U.normalize(ln)}${r.int(1, 99)}@${r.pick(['gmail.com', 'hotmail.com', 'yahoo.com'])}` : '',
        address: `${r.int(100, 19999)} ${r.pick(streets)}`,
        city,
        state: 'FL',
        zip: String(r.int(33010, 33199)),
        source: r.pick(settings.sources.slice(0, 11)),
        referredBy: '',
        eventName: '',
        interests: [...new Set(interest)],
        stage,
        ownerId: owner.id,
        acUnits: r.int(1, 3),
        householdSize: r.int(1, 6),
        pets: r.chance(0.4),
        allergies: r.chance(0.35),
        preferredContact: r.pick(['Llamada', 'WhatsApp', 'Llamada', 'Email']),
        bestTime: r.pick(['Mañana', 'Tarde', 'Noche', 'Cualquiera']),
        birthday: '',
        notes: r.pick(notesPool),
        dnc: false,
        attachments: [],
        callCount: 0,
        noAnswerCount: 0,
        lastContact: null,
        lastCallAt: null,
        lastOutcome: '',
        nextFollowUp: null,
        lostReason: '',
        createdAt: iso(created),
        updatedAt: iso(created)
      };
      if (isReferralSource(c.source)) c.referredBy = r.pick(referrers);
      if (isEventSource(c.source)) c.eventName = r.pick(events);
      // Historial de llamadas
      const noAnswer12 = stage === 'perdido' && r.chance(0.4); // ejemplo de la regla de los 12 intentos
      const nCalls = noAnswer12 ? 12 : stage === 'nuevo' ? 0 : stage === 'intentando' ? r.int(1, 9) : r.int(2, 7);
      let t = created;
      for (let k = 0; k < nCalls; k++) {
        t = Math.min(now - r.int(0, 8) * 3600000, t + r.int(1, 6) * U.DAY + r.int(0, 30000) * 1000);
        let outcome;
        const lastOne = k === nCalls - 1;
        if (stage === 'intentando' || noAnswer12) outcome = r.pick(['no_contesto', 'no_contesto', 'buzon', 'whatsapp']);
        else if (lastOne && (APPT_STAGES.includes(stage) || stage === 'demo_realizada' || stage === 'ganado')) outcome = 'cita_agendada';
        else if (lastOne && stage === 'contactado') outcome = r.pick(['contactado', 'llamar_despues']);
        else if (lastOne && stage === 'perdido') outcome = r.pick(['no_interesado', 'numero_incorrecto', 'no_volver']);
        else outcome = r.pick(['no_contesto', 'no_contesto', 'buzon', 'whatsapp']);
        const o = outcomeById(outcome);
        db.activities.push({ id: U.uid('ac_'), clientId: c.id, userId: owner.id, attempt: k + 1, type: outcome === 'whatsapp' ? 'whatsapp' : 'llamada', outcome, duration: o.contact ? r.int(60, 900) : r.int(10, 40), text: o.contact ? r.pick(['Conversó sobre los filtros', 'Pidió precios del kit', 'Quedó en revisar con su esposo(a)', 'Le envié catálogo por WhatsApp', 'Muy amable, interesada', '']) : '', createdAt: iso(t), updatedAt: iso(t) });
        c.callCount++;
        c.lastCallAt = iso(t);
        c.lastContact = iso(t);
        c.lastOutcome = outcome;
        if (o.contact && !c.reachedAt) c.reachedAt = iso(t);
        if (o.dnc) c.dnc = true;
      }
      if (stage === 'perdido') { c.lostReason = noAnswer12 ? 'Sin respuesta (12 intentos)' : (outcomeById(c.lastOutcome) || {}).lose || 'Otro'; if (noAnswer12) c.archivedNoAnswer = true; }
      // Citas para las etapas de cita y demostración
      if (APPT_STAGES.includes(stage) || stage === 'demo_realizada') {
        const at = stage === 'demo_realizada' ? now - r.int(1, 5) * U.DAY : now + r.int(0, 7) * U.DAY;
        const d = new Date(at); d.setHours(r.pick([10, 11, 14, 15, 16, 17]), r.pick([0, 30]), 0, 0);
        c.appointment = { at: d.toISOString(), address: `${c.address}, ${c.city}, FL`, demoBy: r.chance(0.6) ? owner.id : 'us_2', demoByName: '', notes: '', status: stage === 'cita_confirmada' ? 'confirmada' : stage === 'demo_realizada' ? 'realizada' : 'agendada', createdAt: iso(t), updatedAt: iso(t), by: owner.id };
        db.activities.push({ id: U.uid('ac_'), clientId: c.id, userId: owner.id, type: 'cita', kind: 'agendada', text: `Cita agendada para el ${U.dateTime(c.appointment.at)} · ${c.appointment.address}`, createdAt: iso(t + 60000), updatedAt: iso(t + 60000) });
      }
      if (OPEN_STAGES.includes(stage)) {
        c.nextFollowUp = c.appointment && c.appointment.status !== 'realizada'
          ? iso(new Date(c.appointment.at).getTime() - U.DAY)
          : iso(now + r.int(-3, 6) * U.DAY + r.int(-4, 4) * 3600000);
      }
      if (c.notes) db.activities.push({ id: U.uid('ac_'), clientId: c.id, userId: owner.id, type: 'nota', text: c.notes, createdAt: iso(created + 60000), updatedAt: iso(created + 60000) });
      db.clients.push(c);

      // Ventas
      if (stage === 'ganado') {
        const nOrders = r.chance(0.3) ? 2 : 1;
        for (let k = 0; k < nOrders; k++) {
          const when = Math.min(now - r.int(0, 3) * U.DAY, (c.lastContact ? new Date(c.lastContact).getTime() : created) - k * r.int(10, 30) * U.DAY);
          const items = [];
          const nItems = r.int(1, 3);
          for (let j = 0; j < nItems; j++) {
            const p = r.pick(products);
            if (items.find((x) => x.productId === p.id)) continue;
            items.push({ productId: p.id, name: p.name, qty: p.category === 'Filtros de aire' ? r.int(1, 6) : 1, price: p.price });
          }
          const subtotal = U.sum(items, (x) => x.qty * x.price);
          const discount = subtotal >= 150 && r.chance(0.3) ? r.pick([10, 20, 25, 50]) : 0;
          const total = Math.max(0, subtotal - discount);
          const status = r.pick(['entregada', 'entregada', 'entregada', 'enviada', 'confirmada', 'pendiente']);
          const o = { id: U.uid('or_'), number: 'V-' + (++orderNo), clientId: c.id, userId: owner.id, items, discount, shipping: 0, taxRate: 0, subtotal, tax: 0, total, status, paymentTerms: r.pick(['Contado', 'Contado', '2 cuotas', '3 cuotas']), dueDate: iso(when + 15 * U.DAY), deliveryDate: iso(when + r.int(1, 5) * U.DAY), notes: '', createdAt: iso(when), updatedAt: iso(when) };
          db.orders.push(o);
          db.activities.push({ id: U.uid('ac_'), clientId: c.id, userId: owner.id, type: 'venta', text: `Venta ${o.number} por $${total}`, createdAt: iso(when + 1000), updatedAt: iso(when + 1000) });
          // Pagos: la mayoría pagan completo, algunos abonan
          const pr = r();
          const pays = pr < 0.6 ? [total] : pr < 0.85 ? [Math.round(total * r.pick([0.3, 0.5]))] : [];
          if (pays.length && pays[0] < total && r.chance(0.3)) pays.push(Math.round((total - pays[0]) / 2));
          let pt = when;
          pays.forEach((amt) => {
            pt = Math.min(now, pt + r.int(0, 6) * U.DAY);
            db.payments.push({ id: U.uid('pa_'), orderId: o.id, clientId: c.id, userId: owner.id, amount: amt, method: r.pick(PAY_METHODS.slice(0, 5)), date: iso(pt), reference: r.chance(0.5) ? 'REF' + r.int(10000, 99999) : '', createdAt: iso(pt), updatedAt: iso(pt) });
          });
        }
        c.wonAt = db.orders.filter((o) => o.clientId === c.id).reduce((m, o) => (!m || o.createdAt < m ? o.createdAt : m), null);
      }
    }

    // Tareas
    const taskTitles = ['Enviar cotización por WhatsApp', 'Confirmar dirección de entrega', 'Llamar para cerrar venta', 'Enviar catálogo', 'Recordar cambio de filtros', 'Cobrar saldo pendiente', 'Agendar instalación'];
    db.clients.filter((c) => OPEN_STAGES.includes(c.stage) || c.stage === 'ganado').forEach((c) => {
      if (!r.chance(0.3)) return;
      const due = now + r.int(-2, 5) * U.DAY + r.int(-3, 3) * 3600000;
      db.tasks.push({ id: U.uid('ta_'), clientId: c.id, userId: c.ownerId, title: r.pick(taskTitles), due: iso(due), done: due < now - U.DAY && r.chance(0.6), priority: r.pick(['normal', 'normal', 'alta']), createdAt: iso(now - 5 * U.DAY), updatedAt: iso(now) });
    });

    // Reclutamiento (demo): candidatos separados de los prospectos de ventas
    const rc = U.rng(20261001);
    const cSources = settings.candidateSources || ['Indeed'];
    const positions = settings.positions || ['Agente de ventas telefónicas'];
    const languages = settings.languages || ['Español'];
    const recruiters = users.filter((u) => u.role !== 'agente' || u.id === 'us_3');
    const candStageW = [['nuevo', 14], ['intentando', 14], ['contactado', 10], ['entrevista_agendada', 9], ['entrevista_confirmada', 6], ['entrevistado', 7], ['califica', 6], ['entrenamiento_agendado', 5], ['en_entrenamiento', 5], ['contratado', 8], ['no_seleccionado', 8], ['sin_respuesta', 8]];
    const pickCand = () => { let t = rc() * 100; for (const [s, w] of candStageW) { if ((t -= w) < 0) return s; } return 'nuevo'; };
    const order = CAND_STAGES.map((s) => s.id);
    const places = ['Oficina principal · 8200 NW 41st St, Doral', 'Florida Mall · Kiosko central', 'Llamada por Zoom'];
    for (let i = 0; i < 30; i++) {
      const fn = rc.pick(first), ln = rc.pick(last);
      const stage = pickCand();
      const owner = rc.pick(recruiters);
      const created = now - rc.int(1, 40) * U.DAY - rc.int(0, 36000) * 1000;
      const source = i < 12 ? 'Indeed' : rc.pick(cSources);
      const start = new Date(now + rc.int(3, 30) * U.DAY);
      const c = {
        id: 'ca_' + (i + 1), name: `${fn} ${ln}`,
        phone: `(${rc.pick(['305', '786', '954'])}) ${rc.int(200, 999)}-${String(rc.int(0, 9999)).padStart(4, '0')}`,
        phone2: rc.chance(0.2) ? `(786) ${rc.int(200, 999)}-${String(rc.int(0, 9999)).padStart(4, '0')}` : '',
        email: rc.chance(0.8) ? `${U.normalize(fn)}.${U.normalize(ln)}${rc.int(1, 99)}@gmail.com` : '',
        city: rc.pick(cities), state: 'FL', language: rc.pick(languages.slice(0, 3)), position: rc.pick(positions.slice(0, 4)),
        hasVehicle: rc.chance(0.7), salesExperience: rc.chance(0.55), weekends: rc.chance(0.6),
        startDate: start.toISOString().slice(0, 10), notes: rc.pick(['Disponible de inmediato', 'Trabaja medio tiempo, puede en las tardes', 'Vio el anuncio en Indeed', 'Tiene experiencia en call center', '']),
        source, referredBy: '', referredByRef: null, stage, ownerId: owner.id,
        callCount: 0, lastOutcome: '', lastContact: null, nextFollowUp: null, followUpNote: '', interview: null,
        createdAt: iso(created), updatedAt: iso(created)
      };
      if (isReferralSource(source)) {
        const u = rc.pick(users.slice(2));
        const prev = db.candidates.filter((x) => x.stage === 'contratado');
        if (prev.length && rc.chance(0.5)) { const p = rc.pick(prev); c.referredBy = p.name; c.referredByRef = { type: 'candidate', id: p.id }; }
        else { c.referredBy = u.name; c.referredByRef = { type: 'user', id: u.id }; }
      }
      const act = (t, data) => db.candidateActivities.push(Object.assign({ id: U.uid('ca_'), candidateId: c.id, userId: owner.id, createdAt: iso(t), updatedAt: iso(t) }, data));
      act(created, { type: 'sistema', text: `Candidato registrado · Fuente: ${source}` });
      const idx = order.indexOf(stage);
      const nCalls = stage === 'nuevo' ? 0 : stage === 'sin_respuesta' ? 12 : stage === 'intentando' ? rc.int(1, 6) : rc.int(1, 3);
      let t = created;
      for (let k = 0; k < nCalls; k++) {
        t = Math.min(now - rc.int(1, 8) * 3600000, t + rc.int(0, 2) * U.DAY + rc.int(1800, 30000) * 1000);
        const lastOne = k === nCalls - 1;
        let outcome = rc.pick(['no_contesto', 'no_contesto', 'buzon', 'mensaje']);
        if (lastOne && stage !== 'intentando' && stage !== 'sin_respuesta') outcome = idx >= 3 ? 'entrevista' : stage === 'no_seleccionado' ? 'no_interesado' : 'contactado';
        const o = candOutcomeById(outcome);
        act(t, { type: outcome === 'mensaje' ? 'mensaje' : 'llamada', outcome, attempt: k + 1, text: o.contact ? rc.pick(['Le interesa el puesto', 'Preguntó por el horario y el pago', 'Muy buena actitud al teléfono', '']) : '' });
        c.callCount++; c.lastOutcome = outcome; c.lastContact = iso(t);
        if (o.contact && !c.reachedAt) c.reachedAt = iso(t);
      }
      if (stage !== 'nuevo' && stage !== 'intentando') act(t + 60000, { type: 'etapa', text: `Nuevo candidato → ${candStageById(stage).name}` });
      if (idx >= 3 && stage !== 'sin_respuesta') {
        const done = idx >= 5;
        const at = done ? now - rc.int(1, 6) * U.DAY : now + rc.int(0, 6) * U.DAY;
        const d = new Date(at); d.setHours(rc.pick([9, 10, 11, 14, 15, 16]), rc.pick([0, 30]), 0, 0);
        const status = stage === 'entrevista_confirmada' ? 'confirmada' : stage === 'entrevista_agendada' ? 'agendada' : 'realizada';
        c.interview = { at: d.toISOString(), place: rc.pick(places), interviewerId: rc.pick(['us_1', 'us_2']), interviewerName: '', notes: '', status, resultNotes: done ? rc.pick(['Buena comunicación, con experiencia en ventas', 'Puntual, muy motivado(a)', 'Le falta experiencia pero aprende rápido']) : '', updatedAt: iso(t), by: owner.id };
        act(t + 120000, { type: 'entrevista', kind: 'agendada', text: `Entrevista agendada para el ${U.dateTime(c.interview.at)} · ${c.interview.place}` });
        if (done) act(d.getTime() + 3600000, { type: 'entrevista', kind: 'realizada', text: 'Entrevista realizada\nNotas de la entrevista: ' + c.interview.resultNotes });
      }
      if (stage === 'contratado') c.hiredAt = iso(now - rc.int(1, 15) * U.DAY);
      if (CAND_OPEN.includes(stage)) {
        if (c.interview && c.interview.status !== 'realizada') { c.nextFollowUp = iso(Math.max(now - 3600000, new Date(c.interview.at).getTime() - U.DAY)); c.followUpNote = 'Confirmar la entrevista'; }
        else { c.nextFollowUp = iso(now + rc.int(-2, 5) * U.DAY + rc.int(-4, 4) * 3600000); c.followUpNote = rc.pick(['Volver a llamar', 'Enviar dirección de la oficina', 'Confirmar disponibilidad', '']); }
      }
      db.candidates.push(c);
    }

    return db;
  }
};
