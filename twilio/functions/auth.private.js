/* Funciones compartidas (privadas: no se pueden abrir desde internet).
   - verify(): comprueba la sesión de Firebase del CRM y que la persona tenga acceso activo.
     Firestore valida la firma del token: si el token es falso, responde 401 y no se entrega nada.
   - El horario de llamadas aplica solo a las agentes (identidad terminada en ".a"). */
const err = (status, message) => Object.assign(new Error(message), { status });

function decode(jwt) {
  const part = String(jwt || '').split('.')[1];
  if (!part) throw err(401, 'Falta la sesión del CRM');
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

exports.verify = async (context, idToken) => {
  const project = context.FIREBASE_PROJECT_ID;
  const p = decode(idToken);
  const email = String(p.email || '').toLowerCase();
  if (!email || p.aud !== project || p.iss !== 'https://securetoken.google.com/' + project) throw err(401, 'Sesión no válida');
  if (!p.exp || p.exp * 1000 < Date.now()) throw err(401, 'La sesión venció: recarga el CRM');
  const isOwner = !!context.OWNER_EMAIL && email === String(context.OWNER_EMAIL).toLowerCase();
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/access/${encodeURIComponent(email)}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 401) throw err(401, 'Sesión no válida');
  if (!r.ok && !(r.status === 404 && isOwner)) throw err(403, 'Tu usuario no tiene acceso al CRM');
  const f = r.ok ? ((await r.json()).fields || {}) : {};
  const val = (x) => (x ? (x.booleanValue !== undefined ? x.booleanValue : x.stringValue) : undefined);
  if (!isOwner && val(f.active) !== true) throw err(403, 'Tu usuario está desactivado');
  const role = isOwner ? 'admin' : val(f.role) || 'agente';
  const perms = (f.perms && f.perms.mapValue && f.perms.mapValue.fields) || null;
  const canCall = role === 'admin' || (perms ? val(perms.prospects) === true : role !== 'reclutador');
  if (!canCall) throw err(403, 'Tu usuario no tiene permiso para llamar');
  const userId = String(val(f.userId) || (isOwner ? 'owner' : email)).replace(/[^A-Za-z0-9_-]/g, '_');
  const exempt = role === 'admin' || role === 'supervisor';
  return { email, role, userId, identity: userId + (exempt ? '.m' : '.a') };
};

exports.json = (context) => {
  const res = new Twilio.Response();
  res.appendHeader('Access-Control-Allow-Origin', context.ALLOWED_ORIGIN || '*');
  res.appendHeader('Content-Type', 'application/json');
  return res;
};

// +1 y 10 dígitos (EE. UU. y Puerto Rico); bloquea números de tarifa especial
exports.normalize = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? '+1' + d : '';
};
exports.validTo = (to) => /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(to) && !/^\+1(900|976)/.test(to);

// Con un cliente 787 o 939 sale con el número de Puerto Rico; con los demás, con el de Florida
exports.callerIdFor = (context, to) => (/^\+1(787|939)/.test(to) ? context.NUMBER_PR || context.NUMBER_FL : context.NUMBER_FL || context.NUMBER_PR);

// Horario (por defecto 10:30 a 19:30, hora de Miami); la administración y la supervisión no tienen límite
exports.inHours = (context, identity) => {
  if (String(identity || '').endsWith('.m')) return true;
  const tz = context.CALL_TZ || 'America/New_York';
  const [start, end] = String(context.CALL_HOURS || '10:30-19:30').split('-');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const now = (Number(parts.find((x) => x.type === 'hour').value) % 24) * 60 + Number(parts.find((x) => x.type === 'minute').value);
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  return now >= toMin(start) && now < toMin(end);
};
