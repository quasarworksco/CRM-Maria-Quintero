/* =========================================================
   MQ Store → CRM
   ---------------------------------------------------------
   La tienda (mqstore.dgp-link.com) guarda cada formulario en la
   colección webLeads. Mientras el CRM esté abierto por alguien de
   la administración o la supervisión, cada solicitud nueva:
   - Información / demostración → prospecto nuevo (fuente "MQ Store"),
     asignado a la agente del enlace (?a=codigo), a la persona elegida
     en Conexiones o a la agente con menos prospectos abiertos.
     Si el teléfono ya existe, se suma al historial de ese cliente.
   - Empleo → candidato en Reclutamiento.
   - Reseña → queda por aprobar en Panel admin → Conexiones → MQ Store.
   Una transacción evita que dos sesiones procesen la misma solicitud.
   ========================================================= */
const WebLeads = (() => {
  const SOURCE = 'MQ Store (catálogo web)';
  const CAND_SOURCE = 'MQ Store (página web)';
  const STORE_URL = 'https://mqstore.dgp-link.com';
  let started = false;
  let status = 'off';          // off | on | denied
  let pendingReviews = [];
  const busy = new Set();

  const adapter = () => (typeof Store !== 'undefined' && Store.auth ? Store.auth() : null);
  const storeUrl = () => String(Store.settings().storeUrl || STORE_URL).replace(/\/+$/, '');

  function start() {
    if (started) return;
    const a = adapter();
    if (!a || !a.watchWebLeads || !Store.can('viewAll') || Store.isViewingAs()) return;
    started = true;
    a.watchWebLeads((list) => {
      status = 'on';
      pendingReviews = list.filter((l) => l.type === 'resena').sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
      list.filter((l) => l.type !== 'resena').sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt))).forEach(processOne);
      if (typeof App !== 'undefined') App.refresh();
    }, (e) => {
      status = e && e.code === 'permission-denied' ? 'denied' : 'off';
      console.warn('MQ Store:', e && e.message);
      if (typeof App !== 'undefined') App.refresh();
    });
  }

  /* ---------- Códigos de las agentes para sus enlaces (?a=codigo) ---------- */
  const slug = (s) => U.normalize(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  function codes() {
    const users = U.sortBy(Store.all('users').filter((u) => u.active !== false), (u) => u.createdAt || '');
    const map = new Map(); const used = new Set();
    users.forEach((u) => {
      const first = slug((u.firstName || u.name || '').split(' ')[0]) || 'agente';
      let c = first, n = 2;
      if (used.has(c)) c = first + slug((u.lastName || u.name || '').split(' ').slice(-1)[0]).slice(0, 1);
      while (used.has(c)) c = first + n++;
      used.add(c); map.set(u.id, c);
    });
    return map;
  }
  const codeOf = (u) => codes().get(u.id) || '';
  const linkOf = (u) => `${storeUrl()}/?a=${codeOf(u)}`;
  const sellers = () => Store.all('users').filter((u) => u.active !== false && ['agente', 'supervisor', 'admin'].includes(u.role));

  // A quién se asigna: enlace de la agente → persona elegida → agente con menos prospectos abiertos
  function pickOwner(lead) {
    const byCode = lead.ref && [...codes().entries()].find(([, c]) => c === lead.ref);
    if (byCode) { const u = Store.get('users', byCode[0]); if (u && u.active !== false && u.role !== 'reclutador') return u.id; }
    const fixed = Store.settings().storeLeadOwner;
    if (fixed && fixed !== 'auto') { const u = Store.get('users', fixed); if (u && u.active !== false) return u.id; }
    const agents = Store.all('users').filter((u) => u.active !== false && u.role === 'agente');
    if (!agents.length) return Store.realUser().id;
    const open = (u) => Store.all('clients').filter((c) => c.ownerId === u.id && OPEN_STAGES.includes(c.stage)).length;
    return U.sortBy(agents, open)[0].id;
  }
  function pickRecruiter() {
    const r = Store.all('users').filter((u) => u.active !== false && u.role === 'reclutador');
    if (!r.length) return Store.realUser().id;
    const open = (u) => Store.all('candidates').filter((c) => c.ownerId === u.id).length;
    return U.sortBy(r, open)[0].id;
  }

  function ensureSource(key, value) {
    const s = Store.settings();
    const list = s[key] || [];
    if (!list.some((x) => U.normalize(x) === U.normalize(value))) Store.saveSettings({ [key]: [value].concat(list) });
  }

  /* ---------- Procesar una solicitud ---------- */
  async function processOne(lead) {
    if (busy.has(lead.id)) return;
    if (lead.type === 'empleo' && !(Store.can('recruitAll') || Store.can('recruitment'))) return;
    busy.add(lead.id);
    try {
      const me = Store.realUser();
      const ok = await adapter().claimWebLead(lead.id, { status: 'procesado', processedBy: me.id, processedAt: new Date().toISOString() });
      if (!ok) return;
      const result = lead.type === 'empleo' ? toCandidate(lead) : toClient(lead);
      adapter().updateWebLead(lead.id, result).catch(() => {});
    } catch (e) {
      console.error('MQ Store: no se pudo procesar la solicitud', e);
    } finally {
      busy.delete(lead.id);
    }
  }

  const productsText = (l) => (l.productNames || []).join(', ');
  const kindText = (l) => (l.type === 'demo' ? 'Demostración' : 'Información');

  function toClient(l) {
    ensureSource('sources', SOURCE);
    const phone = String(l.phone || '').trim();
    const key = U.cleanPhone(phone).slice(-10);
    const existing = key.length >= 7 && Store.all('clients').find((c) => [c.phone, c.phone2].some((p) => U.cleanPhone(p).slice(-10) === key));
    // Productos del CRM con el mismo nombre (para "productos de interés")
    const names = (l.productNames || []).map((n) => U.normalize(n));
    const interests = Store.all('products').filter((p) => names.some((n) => n && (U.normalize(p.name).includes(n) || n.includes(U.normalize(p.name))))).map((p) => p.id);
    const detail = [
      `Solicitud desde MQ Store: ${kindText(l)}`,
      productsText(l) && `Productos: ${productsText(l)}`,
      l.bestTime && `Mejor horario: ${l.bestTime}`,
      l.city && `Ciudad: ${l.city}`,
      l.email && `Correo: ${l.email}`,
      l.message && `Mensaje: ${l.message}`,
      l.lang === 'en' && 'Prefiere inglés'
    ].filter(Boolean).join(' · ');
    const now = new Date().toISOString();
    if (existing) {
      Store.update('clients', existing.id, {
        nextFollowUp: now, followUpExact: false,
        interests: [...new Set((existing.interests || []).concat(interests))],
        email: existing.email || l.email || ''
      });
      Store.logActivity({ clientId: existing.id, type: 'sistema', text: 'Nueva ' + detail.charAt(0).toLowerCase() + detail.slice(1) });
      notify(`${l.name} volvió a escribir desde MQ Store`);
      return { clientId: existing.id, duplicate: true };
    }
    const ownerId = pickOwner(l);
    const c = Store.insert('clients', {
      name: l.name, phone, email: l.email || '', city: l.city || '', source: SOURCE, stage: 'nuevo', ownerId,
      interests, notes: [l.message, productsText(l) && `Le interesa: ${productsText(l)}`].filter(Boolean).join('\n'),
      bestTime: '', preferredContact: '', language: l.lang === 'en' ? 'Inglés' : '',
      callCount: 0, noAnswerCount: 0, attachments: [], lastContact: null, lastOutcome: '',
      nextFollowUp: now, followUpExact: false,
      webLead: { id: l.id, type: l.type, products: l.products || [], ref: l.ref || '' }
    });
    Store.logActivity({ clientId: c.id, type: 'sistema', text: `${detail} · Asignado a ${UI.userName(ownerId)}` });
    notify(`Nueva solicitud de MQ Store: ${l.name}${productsText(l) ? ' · ' + productsText(l) : ''} → ${UI.userName(ownerId)}`);
    return { clientId: c.id };
  }

  function toCandidate(l) {
    ensureSource('candidateSources', CAND_SOURCE);
    const ownerId = pickRecruiter();
    const s = Store.settings();
    const c = Store.insert('candidates', {
      name: l.name, phone: l.phone || '', phone2: '', email: l.email || '', city: l.city || '', state: '',
      language: l.languages || '', position: (s.positions && s.positions[0]) || 'Ventas',
      source: CAND_SOURCE, notes: l.experience || '', referredBy: '', referredByRef: null,
      hasVehicle: null, salesExperience: null, weekends: null, startDate: '',
      stage: 'nuevo', ownerId, callCount: 0, lastOutcome: '', lastContact: null, nextFollowUp: new Date().toISOString(), followUpNote: 'Llamar: se registró en la página de MQ Store', interview: null
    });
    if (typeof Recruit !== 'undefined') Recruit.log(c.id, { type: 'sistema', text: `Candidato registrado desde MQ Store${l.experience ? ' · Experiencia: ' + l.experience : ''}` });
    notify(`Nuevo candidato desde MQ Store: ${l.name}`);
    return { candidateId: c.id };
  }

  function notify(text) {
    UI.toast(text, 'good');
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('MQ Store', { body: text, icon: 'favicon.svg', tag: 'mq-' + text }); } catch (e) {}
  }

  /* ---------- Reseñas ---------- */
  async function approveReview(l) {
    const a = adapter();
    await a.putReview(l.id, { name: l.name, city: l.city || '', productName: (l.productNames || [])[0] || '', rating: Number(l.rating) || 5, text: l.message || '', createdAt: l.createdAt || new Date().toISOString(), approvedBy: Store.realUser().id });
    await a.updateWebLead(l.id, { status: 'aprobada', processedBy: Store.realUser().id, processedAt: new Date().toISOString() });
  }
  const rejectReview = (l) => adapter().updateWebLead(l.id, { status: 'descartada', processedBy: Store.realUser().id, processedAt: new Date().toISOString() });
  const publishedReviews = () => adapter().getReviews();
  const removeReview = (id) => adapter().deleteReview(id);

  return { start, status: () => status, pendingReviews: () => pendingReviews, codeOf, linkOf, sellers, storeUrl, approveReview, rejectReview, publishedReviews, removeReview, SOURCE };
})();
