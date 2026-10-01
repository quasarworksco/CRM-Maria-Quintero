/* =========================================================
   Utilidades, constantes del negocio e íconos
   ========================================================= */
const U = (() => {
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const settings = () => (window.Store ? Store.settings() : { currency: 'USD', locale: 'es-US' });

  function money(n, opts = {}) {
    const s = settings();
    try {
      return new Intl.NumberFormat(s.locale || 'es-US', {
        style: 'currency', currency: s.currency || 'USD',
        maximumFractionDigits: opts.decimals ?? (s.currency === 'COP' || s.currency === 'CLP' || Number.isInteger(Number(n)) ? 0 : 2),
        minimumFractionDigits: opts.decimals ?? (s.currency === 'COP' || s.currency === 'CLP' || Number.isInteger(Number(n)) ? 0 : 2)
      }).format(Number(n) || 0);
    } catch (e) {
      return '$' + (Number(n) || 0).toFixed(0);
    }
  }
  const moneyShort = (n) => {
    n = Number(n) || 0;
    const abs = Math.abs(n);
    if (abs >= 1e9) return money(n / 1e9, { decimals: 1 }) + 'B';
    if (abs >= 1e6) return money(n / 1e6, { decimals: 1 }) + 'M';
    if (abs >= 1e4) return money(n / 1e3, { decimals: 0 }) + 'K';
    return money(n, { decimals: 0 });
  };
  const num = (n) => new Intl.NumberFormat(settings().locale || 'es-US').format(Number(n) || 0);
  const pct = (n) => (isFinite(n) ? Math.round(n * 100) : 0) + '%';

  const toDate = (d) => (d instanceof Date ? d : new Date(d));
  const DAY = 86400000;
  const startOfDay = (d = new Date()) => { const x = toDate(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
  const endOfDay = (d = new Date()) => new Date(startOfDay(d).getTime() + DAY - 1);
  const startOfWeek = (d = new Date()) => { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; return new Date(x.getTime() - day * DAY); };
  const startOfMonth = (d = new Date()) => { const x = toDate(d); return new Date(x.getFullYear(), x.getMonth(), 1); };
  const isToday = (d) => d && startOfDay(d).getTime() === startOfDay().getTime();
  const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
  const addDays = (d, n) => new Date(toDate(d).getTime() + n * DAY);

  function date(d, opts) {
    if (!d) return '—';
    return toDate(d).toLocaleDateString(settings().locale || 'es-US', opts || { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function dateTime(d) {
    if (!d) return '—';
    const x = toDate(d);
    return x.toLocaleDateString(settings().locale || 'es-US', { day: '2-digit', month: 'short' }) + ' ' +
      x.toLocaleTimeString(settings().locale || 'es-US', { hour: '2-digit', minute: '2-digit' });
  }
  function time(d) {
    if (!d) return '';
    return toDate(d).toLocaleTimeString(settings().locale || 'es-US', { hour: '2-digit', minute: '2-digit' });
  }
  function ago(d) {
    if (!d) return 'nunca';
    const diff = Date.now() - toDate(d).getTime();
    const future = diff < 0;
    const a = Math.abs(diff);
    const m = Math.round(a / 60000), h = Math.round(a / 3600000), dd = Math.round(a / DAY);
    let s;
    if (m < 1) s = 'ahora';
    else if (m < 60) s = m + ' min';
    else if (h < 24) s = h + ' h';
    else if (dd < 30) s = dd + (dd === 1 ? ' día' : ' días');
    else if (dd < 365) s = Math.round(dd / 30) + ' mes' + (Math.round(dd / 30) > 1 ? 'es' : '');
    else s = Math.round(dd / 365) + ' año' + (Math.round(dd / 365) > 1 ? 's' : '');
    if (s === 'ahora') return s;
    return future ? 'en ' + s : 'hace ' + s;
  }
  // Valor para <input type="datetime-local">
  const toLocalInput = (d) => {
    if (!d) return '';
    const x = toDate(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  };
  const toDateInput = (d) => (d ? toLocalInput(d).slice(0, 10) : '');
  const fromInput = (v) => (v ? new Date(v).toISOString() : null);
  const duration = (sec) => { sec = Math.max(0, Math.round(sec || 0)); if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`; const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; };

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const cleanPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
  const waLink = (p, text = '') => {
    let n = cleanPhone(p).replace(/^\+/, '');
    const cc = (settings().phoneCountryCode || '').replace(/\D/g, '');
    if (cc && n.length <= 10 && !n.startsWith(cc)) n = cc + n;
    return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  };
  const telLink = (p) => 'tel:' + cleanPhone(p);
  const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
  const sortBy = (arr, fn, dir = 1) => [...arr].sort((a, b) => { const x = fn(a), y = fn(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });

  function download(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }
  function toCSV(rows, columns) {
    const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const head = columns.map((c) => q(c.label)).join(',');
    const body = rows.map((r) => columns.map((c) => q(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
    return '﻿' + head + '\n' + body;
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = []; let cur = ''; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const [head, ...data] = rows.filter((r) => r.some((x) => x.trim()));
    if (!head) return [];
    const keys = head.map((h) => normalize(h).trim());
    return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])));
  }

  // Semilla pseudoaleatoria para datos demo reproducibles
  function rng(seed = 42) {
    let s = seed;
    const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    r.int = (a, b) => Math.floor(r() * (b - a + 1)) + a;
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }

  return {
    uid, esc, money, moneyShort, num, pct, DAY, startOfDay, endOfDay, startOfWeek, startOfMonth, isToday, sameDay, addDays,
    date, dateTime, time, ago, toLocalInput, toDateInput, fromInput, duration, initials, cleanPhone, waLink, telLink,
    normalize, debounce, sum, groupBy, sortBy, download, toCSV, parseCSV, rng
  };
})();

/* ---------- Constantes del negocio ---------- */
// Colores por etapa (se aplican solos en la ficha, los listados, el embudo y la agenda)
//   Azul: Nuevo / Intentando contactar · Verde: Contactado · Morado: Citas
//   Amarillo: Demo realizada · Fucsia: Venta · Rojo: Perdido / Sin respuesta
const STAGES = [
  { id: 'nuevo', name: 'Nuevo', color: '#3b82f6', soft: '#eff6ff', ink: '#1d4ed8', prob: 0.05, desc: 'Prospecto recién ingresado, todavía sin llamar' },
  { id: 'intentando', name: 'Intentando contactar', color: '#2563eb', soft: '#dbeafe', ink: '#1e40af', prob: 0.08, desc: 'Se ha llamado o escrito pero aún no contesta' },
  { id: 'contactado', name: 'Contactado', color: '#16a34a', soft: '#dcfce7', ink: '#15803d', prob: 0.15, desc: 'Ya se habló con la persona; está en seguimiento' },
  { id: 'cita_agendada', name: 'Cita agendada', color: '#9333ea', soft: '#f3e8ff', ink: '#7e22ce', prob: 0.35, desc: 'Tiene fecha y hora para la demostración' },
  { id: 'cita_confirmada', name: 'Cita confirmada', color: '#7e22ce', soft: '#ede9fe', ink: '#6b21a8', prob: 0.5, desc: 'La persona confirmó que asistirá a la cita' },
  { id: 'demo_realizada', name: 'Demo realizada', color: '#eab308', soft: '#fef9c3', ink: '#854d0e', prob: 0.65, desc: 'Ya se hizo la demostración; falta cerrar' },
  { id: 'ganado', name: 'Venta', color: '#c026d3', soft: '#fae8ff', ink: '#a21caf', prob: 1, desc: 'Compró: ahora es cliente' },
  { id: 'perdido', name: 'Perdido / Sin respuesta', color: '#dc2626', soft: '#fee2e2', ink: '#b91c1c', prob: 0, desc: 'No compró, no está interesado, pidió no llamar o no respondió' }
];
const OPEN_STAGES = ['nuevo', 'intentando', 'contactado', 'cita_agendada', 'cita_confirmada', 'demo_realizada'];
const APPT_STAGES = ['cita_agendada', 'cita_confirmada'];
// Etapas de versiones anteriores → etapa actual
const STAGE_ALIASES = { interesado: 'contactado', cotizacion: 'contactado', negociacion: 'demo_realizada' };
const stageById = (id) => STAGES.find((s) => s.id === (STAGE_ALIASES[id] || id)) || STAGES[0];

/* Resultado de cada intento de contacto: puede mover la etapa y programar el seguimiento.
   contact: true = se logró hablar con la persona (ya no aplica la regla de los 12 intentos)
   lose: el prospecto pasa a Perdido / Sin respuesta con ese motivo */
const OUTCOMES = [
  { id: 'no_contesto', name: 'No contestó', color: '#2563eb', contact: false, followDays: 1, icon: 'phoneOff', stage: 'intentando' },
  { id: 'buzon', name: 'Buzón de voz', color: '#3b82f6', contact: false, followDays: 1, icon: 'voicemail', stage: 'intentando' },
  { id: 'whatsapp', name: 'WhatsApp enviado', color: '#60a5fa', contact: false, followDays: 1, icon: 'message', stage: 'intentando' },
  { id: 'llamar_despues', name: 'Llamar después', color: '#22c55e', contact: true, followDays: 1, icon: 'clock', stage: 'contactado' },
  { id: 'contactado', name: 'Contactado', color: '#16a34a', contact: true, followDays: 2, icon: 'phone', stage: 'contactado' },
  { id: 'cita_agendada', name: 'Cita agendada', color: '#9333ea', contact: true, followDays: null, icon: 'calendar', stage: 'cita_agendada', appointment: true },
  { id: 'no_interesado', name: 'No interesado', color: '#dc2626', contact: true, followDays: null, icon: 'x', lose: 'No interesado' },
  { id: 'numero_incorrecto', name: 'Número incorrecto', color: '#b91c1c', contact: false, followDays: null, icon: 'alert', lose: 'Número incorrecto' },
  { id: 'no_volver', name: 'No volver a llamar', color: '#7f1d1d', contact: true, followDays: null, icon: 'ban', lose: 'Pidió no volver a llamar', dnc: true }
];
// Resultados de versiones anteriores (solo para mostrar el historial)
const LEGACY_OUTCOMES = [
  { id: 'no_contesta', name: 'No contestó', color: '#2563eb', contact: false },
  { id: 'dejo_mensaje', name: 'Buzón de voz', color: '#3b82f6', contact: false },
  { id: 'contesto', name: 'Contactado', color: '#16a34a', contact: true },
  { id: 'interesado', name: 'Contactado', color: '#16a34a', contact: true },
  { id: 'reagendar', name: 'Llamar después', color: '#22c55e', contact: true },
  { id: 'cotizacion', name: 'Contactado', color: '#16a34a', contact: true },
  { id: 'venta', name: 'Venta cerrada', color: '#c026d3', contact: true },
  { id: 'equivocado', name: 'Número incorrecto', color: '#b91c1c', contact: false }
];
const outcomeById = (id) => OUTCOMES.find((o) => o.id === id) || LEGACY_OUTCOMES.find((o) => o.id === id);
// Un intento de contacto es toda llamada, WhatsApp, email o visita registrada con resultado
const ATTEMPT_TYPES = ['llamada', 'whatsapp', 'email', 'visita'];
const isAttempt = (a) => !!a && !!a.outcome && ATTEMPT_TYPES.includes(a.type);

/* Fuente / cómo llegó: las que piden un dato adicional */
const isReferralSource = (src) => /referid/i.test(String(src || ''));
const isEventSource = (src) => /feria|evento/i.test(String(src || ''));

const ACTIVITY_TYPES = {
  llamada: { name: 'Llamada', icon: 'phone' },
  whatsapp: { name: 'WhatsApp', icon: 'message' },
  email: { name: 'Email', icon: 'mail' },
  visita: { name: 'Visita', icon: 'mapPin' },
  nota: { name: 'Nota', icon: 'note' },
  etapa: { name: 'Cambio de etapa', icon: 'flag' },
  venta: { name: 'Venta', icon: 'cart' },
  pago: { name: 'Pago', icon: 'dollar' },
  cita: { name: 'Cita', icon: 'calendar' },
  asignacion: { name: 'Asignación', icon: 'users' },
  sistema: { name: 'Sistema', icon: 'info' }
};

const ORDER_STATUS = [
  { id: 'pendiente', name: 'Pendiente', cls: 'warn' },
  { id: 'confirmada', name: 'Confirmada', cls: 'info' },
  { id: 'enviada', name: 'Enviada', cls: 'violet' },
  { id: 'entregada', name: 'Entregada', cls: 'good' },
  { id: 'cancelada', name: 'Cancelada', cls: 'bad' }
];
const orderStatusById = (id) => ORDER_STATUS.find((s) => s.id === id) || ORDER_STATUS[0];

const PAY_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Zelle', 'Nequi / Daviplata', 'Cheque', 'Financiación', 'Otro'];

const ROLES = {
  admin: { name: 'Administrador', desc: 'Acceso total: usuarios, configuración, ventas, montos, reportes y estadísticas' },
  supervisor: { name: 'Supervisor', desc: 'Ve y reasigna todo el equipo, prospectos, reclutamiento y reportes (sin montos, salvo que se le dé el permiso)' },
  agente: { name: 'Agente / Call center', desc: 'Solo sus prospectos, llamadas, seguimientos y citas; puede registrar ventas sin ver montos' },
  reclutador: { name: 'Reclutamiento', desc: 'Solo el módulo de Reclutamiento: sus candidatos, entrevistas y seguimientos' }
};

/* ---------- Permisos por usuario ----------
   Cada rol trae permisos por defecto; la administración puede ajustarlos a cada persona. */
const PERMS = [
  { id: 'prospects', name: 'Prospectos, llamadas, seguimientos y citas', desc: 'Clientes, Modo llamadas, Agenda y Embudo (sus propios clientes)' },
  { id: 'sales', name: 'Registrar ventas', desc: 'Crear ventas y ver la lista de sus ventas (productos, canal y entrega)' },
  { id: 'finance', name: 'Información financiera', desc: 'Montos de ventas, pagos, saldos, Recaudo / Cartera, metas de venta e ingresos en reportes' },
  { id: 'reports', name: 'Reportes y estadísticas', desc: 'Rendimiento del equipo, llamadas, fuentes y canales' },
  { id: 'viewAll', name: 'Ver todo el equipo', desc: 'Clientes, llamadas y ventas de todas las personas (no solo los suyos)' },
  { id: 'reassign', name: 'Reasignar', desc: 'Cambiar el responsable de clientes y candidatos' },
  { id: 'recruitment', name: 'Reclutamiento', desc: 'Módulo de candidatos: sus candidatos asignados' },
  { id: 'recruitAll', name: 'Ver todos los candidatos', desc: 'Todos los candidatos de reclutamiento, no solo los suyos' },
  { id: 'exportData', name: 'Exportar', desc: 'Descargar listas en Excel / CSV' }
];
const ROLE_PERMS = {
  supervisor: { prospects: true, sales: true, reports: true, viewAll: true, reassign: true, recruitment: true, recruitAll: true, exportData: true },
  agente: { prospects: true, sales: true },
  reclutador: { recruitment: true }
};
// Permisos efectivos: administración = todo; el resto = los del rol + los ajustes de la persona
function effectivePerms(role, overrides) {
  const out = {};
  if (role === 'admin') { PERMS.forEach((p) => { out[p.id] = true; }); return out; }
  const base = Object.assign({}, ROLE_PERMS[role] || ROLE_PERMS.agente, overrides || {});
  PERMS.forEach((p) => { out[p.id] = base[p.id] === true; });
  if (out.recruitAll) out.recruitment = true;
  return out;
}

/* ---------- Perfil del cliente / hogar ---------- */
const HOUSING = [{ id: 'dueno', name: 'Dueño de casa' }, { id: 'renta', name: 'Renta' }];
const CREDIT = [{ id: 'si', name: 'Tiene crédito' }, { id: 'no', name: 'No tiene crédito' }];
const MARITAL = [{ id: 'casado', name: 'Casado(a)' }, { id: 'soltero', name: 'Soltero(a)' }, { id: 'divorciado', name: 'Divorciado(a)' }, { id: 'viudo', name: 'Viudo(a)' }];
const BEST_TIMES = ['Mañana', 'Tarde', 'Noche', 'Cualquier horario'];
const CONTACT_PREFS = ['Llamada', 'WhatsApp', 'SMS / Mensaje de texto', 'Email'];
const labelOf = (list, id, none = 'No indicado') => ((list.find((x) => x.id === id) || {}).name || none);
const yesNoLabel = (v) => (v === true ? 'Sí' : v === false ? 'No' : 'No indicado');

/* ---------- Canal de la venta ---------- */
const SALE_CHANNEL_DEFAULTS = ['Llamada / Call center', 'Instagram', 'Facebook', 'WhatsApp', 'Página web', 'Tienda', 'Referido', 'Feria / Evento', 'Otro'];
// Canal sugerido según la fuente del cliente
function channelFromSource(src) {
  const s = String(src || '').toLowerCase();
  if (/instagram/.test(s)) return 'Instagram';
  if (/facebook/.test(s)) return 'Facebook';
  if (/whatsapp/.test(s)) return 'WhatsApp';
  if (/web|google/.test(s)) return 'Página web';
  if (/tienda|mall/.test(s)) return 'Tienda';
  if (/referid|anterior|recurrente/.test(s)) return 'Referido';
  if (/feria|evento/.test(s)) return 'Feria / Evento';
  return 'Llamada / Call center';
}

const USER_COLORS = ['#1a4fd6', '#0b2a5c', '#2563eb', '#0e7490', '#1e40af', '#3b82f6', '#0369a1', '#4338ca'];
// Colores grises de versiones anteriores → su equivalente azul
const LEGACY_USER_COLORS = { '#18181b': '#1a4fd6', '#52525b': '#0b2a5c', '#78716c': '#2563eb', '#3f3f46': '#0e7490', '#71717a': '#1e40af', '#44403c': '#3b82f6', '#27272a': '#0369a1', '#57534e': '#4338ca' };
const userColor = (c) => LEGACY_USER_COLORS[c] || c || '#5b7bbf';

/* ---------- Íconos (SVG inline, estilo lucide) ---------- */
const ICONS = {
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  phoneOff: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-3.3-2.7M5.2 13.2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8"/><line x1="22" y1="2" x2="2" y2="22"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-8.5 8.4 8.4 0 0 1 8.6 8.5z"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  voicemail: '<circle cx="5.5" cy="11.5" r="4.5"/><circle cx="18.5" cy="11.5" r="4.5"/><line x1="5.5" y1="16" x2="18.5" y2="16"/>',
  thumbUp: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
  snow: '<line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.4 1.4 2.8 2.5 2.8z"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  paperclip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
