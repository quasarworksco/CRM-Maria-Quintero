/* =========================================================
   Store — capa de datos
   ---------------------------------------------------------
   Todo el CRM lee de una caché en memoria y escribe por
   documento a través de un "adaptador". Hoy el adaptador es
   localStorage; para Firestore basta con implementar el mismo
   contrato (load / put / del) usando getDocs / setDoc / deleteDoc
   sobre colecciones con estos mismos nombres.
   ========================================================= */
const COLLECTIONS = ['users', 'clients', 'activities', 'tasks', 'products', 'orders', 'payments'];

const LocalAdapter = {
  KEY: 'crm_mq_db_v2',
  async load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { return null; }
  },
  // En local se guarda la base completa (con debounce); en Firestore sería setDoc(doc(db, col, id), data)
  _timer: null,
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

const Store = (() => {
  let db = null;
  const adapter = LocalAdapter;
  const listeners = new Set();

  const DEFAULT_SETTINGS = {
    companyName: 'Maria Quintero',
    companyTagline: 'Filtros de aire y soluciones para el hogar',
    currency: 'USD',
    locale: 'es-US',
    phoneCountryCode: '1',
    sources: ['Llamada en frío', 'Referido', 'Facebook', 'Instagram', 'Google', 'WhatsApp', 'Feria / Evento', 'Volante', 'Sitio web', 'Cliente recurrente'],
    lostReasons: ['Precio alto', 'Compró con la competencia', 'No lo necesita', 'No contesta nunca', 'Sin presupuesto', 'Número equivocado', 'Otro'],
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
    db = await adapter.load();
    if (!db || !db.users) {
      db = Seed.build(DEFAULT_SETTINGS);
      adapter.replaceAll(db);
    }
    COLLECTIONS.forEach((c) => { db[c] = db[c] || []; });
    db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
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

  /* ---------- Sesión (temporal hasta tener login) ---------- */
  const SESSION_KEY = 'crm_mq_session';
  function currentUser() {
    let id = null;
    try { id = localStorage.getItem(SESSION_KEY); } catch (e) {}
    let u = id && get('users', id);
    if (!u || !u.active) u = db.users.find((x) => x.role === 'admin' && x.active) || db.users[0];
    return u;
  }
  function setCurrentUser(id) { try { localStorage.setItem(SESSION_KEY, id); } catch (e) {} emit(); }

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

  // Puntaje de prospecto 0-100: etapa + temperatura + recencia + valor
  function leadScore(c) {
    if (c.stage === 'ganado') return 100;
    if (c.stage === 'perdido' || c.dnc) return 0;
    let s = stageById(c.stage).prob * 50;
    s += { frio: 0, tibio: 15, caliente: 30 }[c.temperature] || 0;
    if (c.lastContact) {
      const days = (Date.now() - new Date(c.lastContact).getTime()) / U.DAY;
      s += days < 3 ? 10 : days < 7 ? 6 : days < 14 ? 3 : 0;
    }
    if ((c.estValue || 0) > 500) s += 10; else if ((c.estValue || 0) > 150) s += 5;
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
    if (stage === 'ganado') { patch.temperature = 'caliente'; patch.wonAt = new Date().toISOString(); }
    if (stage === 'perdido') patch.lostAt = new Date().toISOString();
    update('clients', clientId, patch);
    logActivity({ clientId, type: 'etapa', text: `${stageById(from).name} → ${stageById(stage).name}${extra.lostReason ? ' · Motivo: ' + extra.lostReason : ''}` });
  }

  // Registrar una llamada aplicando las reglas del resultado
  function logCall(clientId, { outcome, duration = 0, notes = '', nextFollowUp, type = 'llamada' }) {
    const c = get('clients', clientId);
    const o = outcomeById(outcome);
    const now = new Date().toISOString();
    logActivity({ clientId, type, outcome, duration, text: notes });
    const patch = { lastCallAt: now, callCount: (c.callCount || 0) + 1 };
    if (!o || o.contact) patch.lastContact = now;
    if (o && !o.contact) patch.noAnswerCount = (c.noAnswerCount || 0) + 1; else patch.noAnswerCount = 0;
    if (o && o.temp) patch.temperature = o.temp;
    if (nextFollowUp !== undefined) patch.nextFollowUp = nextFollowUp;
    else if (o && o.followDays) patch.nextFollowUp = new Date(Date.now() + o.followDays * U.DAY).toISOString();
    else if (o && o.followDays === null) patch.nextFollowUp = null;
    if (c.stage === 'nuevo' && o && o.contact) patch.stage = 'contactado';
    update('clients', clientId, patch);
    if (o && o.stage) {
      const order = STAGES.map((s) => s.id);
      // Solo avanzar (o ir a ganado/perdido); no retroceder etapas por un resultado
      if (o.stage === 'ganado' || o.stage === 'perdido' || order.indexOf(o.stage) > order.indexOf(get('clients', clientId).stage)) {
        changeStage(clientId, o.stage, o.stage === 'perdido' ? { lostReason: 'Número equivocado' } : {});
      }
    }
    if (o && o.id === 'no_interesado' && OPEN_STAGES.includes(c.stage) && (c.noInterestCount || 0) >= 1) {
      changeStage(clientId, 'perdido', { lostReason: 'No lo necesita' });
    }
    if (o && o.id === 'no_interesado') update('clients', clientId, { noInterestCount: (c.noInterestCount || 0) + 1 });
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
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.users) || !Array.isArray(data.clients)) throw new Error('Archivo no válido');
    db = data;
    COLLECTIONS.forEach((c) => { db[c] = db[c] || []; });
    db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
    adapter.replaceAll(db);
    emit();
  }
  function resetDemo() { db = Seed.build(DEFAULT_SETTINGS); adapter.replaceAll(db); emit(); }
  function wipeAll() {
    const admin = currentUser();
    db = { settings: db.settings };
    COLLECTIONS.forEach((c) => { db[c] = []; });
    db.users.push(Object.assign({}, admin, { role: 'admin', active: true }));
    adapter.replaceAll(db);
    emit();
  }

  return {
    init, all, get, where, insert, update, remove, settings, saveSettings, onChange: (fn) => listeners.add(fn),
    currentUser, setCurrentUser, isManager, isAdmin, can, myClients, myOrders, myTasks, myActivities, canSeeClient, activeUsers, sellers,
    orderPaid, orderBalance, orderPayStatus, calcOrderTotal, clientOrders, clientBalance, clientRevenue, nextOrderNumber,
    leadScore, isStale, logActivity, changeStage, logCall, registerPayment, createOrder, reassign, deleteClient,
    exportJSON, importJSON, resetDemo, wipeAll
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
      { name: 'Maria Quintero', email: 'maria@empresa.com', phone: '(305) 555-0100', role: 'admin', callGoal: 0, salesGoal: 0 },
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

    const stageWeights = [['nuevo', 22], ['contactado', 18], ['interesado', 14], ['cotizacion', 9], ['negociacion', 6], ['ganado', 20], ['perdido', 11]];
    const pickStage = () => { let t = r() * 100; for (const [s, w] of stageWeights) { if ((t -= w) < 0) return s; } return 'nuevo'; };
    const tempFor = (s) => ({ nuevo: 'frio', contactado: r.pick(['frio', 'frio', 'tibio']), interesado: r.pick(['tibio', 'tibio', 'caliente']), cotizacion: r.pick(['tibio', 'caliente', 'caliente']), negociacion: 'caliente', ganado: 'caliente', perdido: 'frio' }[s]);

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
        source: r.pick(settings.sources),
        interests: [...new Set(interest)],
        stage,
        temperature: tempFor(stage),
        ownerId: owner.id,
        estValue: r.pick([45, 90, 120, 189, 240, 349, 459, 600, 900, 1200]),
        acUnits: r.int(1, 3),
        householdSize: r.int(1, 6),
        pets: r.chance(0.4),
        allergies: r.chance(0.35),
        preferredContact: r.pick(['Llamada', 'WhatsApp', 'Llamada', 'Email']),
        bestTime: r.pick(['Mañana', 'Tarde', 'Noche', 'Cualquiera']),
        birthday: '',
        tags: r.chance(0.3) ? [r.pick(['VIP', 'Referidor', 'Mayorista', 'Recompra', 'Urgente'])] : [],
        notes: r.pick(notesPool),
        dnc: false,
        attachments: [],
        callCount: 0,
        noAnswerCount: 0,
        lastContact: null,
        lastCallAt: null,
        nextFollowUp: null,
        lostReason: stage === 'perdido' ? r.pick(settings.lostReasons) : '',
        createdAt: iso(created),
        updatedAt: iso(created)
      };
      // Historial de llamadas
      const nCalls = stage === 'nuevo' ? (r.chance(0.3) ? 1 : 0) : r.int(1, 7);
      let t = created;
      for (let k = 0; k < nCalls; k++) {
        t = Math.min(now - r.int(0, 8) * 3600000, t + r.int(1, 9) * U.DAY + r.int(0, 30000) * 1000);
        let outcome;
        const lastOne = k === nCalls - 1;
        if (lastOne && stage === 'ganado') outcome = 'venta';
        else if (lastOne && stage === 'cotizacion') outcome = 'cotizacion';
        else if (lastOne && stage === 'interesado') outcome = 'interesado';
        else if (lastOne && stage === 'perdido') outcome = r.pick(['no_interesado', 'no_interesado', 'equivocado']);
        else if (stage === 'nuevo') outcome = r.pick(['no_contesta', 'buzon']);
        else outcome = r.pick(['no_contesta', 'no_contesta', 'buzon', 'llamar_despues', 'interesado']);
        const o = outcomeById(outcome);
        db.activities.push({ id: U.uid('ac_'), clientId: c.id, userId: owner.id, type: r.chance(0.12) ? 'whatsapp' : 'llamada', outcome, duration: o.contact ? r.int(60, 900) : r.int(10, 40), text: o.contact ? r.pick(['Conversó sobre los filtros', 'Pidió precios del kit', 'Quedó en revisar con su esposo(a)', 'Le envié catálogo por WhatsApp', 'Muy amable, interesada', '']) : '', createdAt: iso(t), updatedAt: iso(t) });
        c.callCount++;
        c.lastCallAt = iso(t);
        if (o.contact) c.lastContact = iso(t);
      }
      if (OPEN_STAGES.includes(stage)) {
        c.nextFollowUp = iso(now + r.int(-3, 6) * U.DAY + r.int(-4, 4) * 3600000);
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

    return db;
  }
};
