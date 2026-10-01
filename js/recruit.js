/* =========================================================
   Reclutamiento — datos y reglas
   ---------------------------------------------------------
   Módulo separado de Ventas: los candidatos viven en sus propias
   colecciones (candidates y candidateActivities) y nunca se
   mezclan con los prospectos/clientes.
   ========================================================= */
const CAND_STAGES = [
  { id: 'nuevo', name: 'Nuevo candidato', color: '#3b82f6', soft: '#eff6ff', ink: '#1d4ed8', desc: 'Recién ingresado, todavía sin llamar' },
  { id: 'intentando', name: 'Intentando contactar', color: '#2563eb', soft: '#dbeafe', ink: '#1e40af', desc: 'Se ha llamado o escrito, aún no contesta' },
  { id: 'contactado', name: 'Contactado', color: '#16a34a', soft: '#dcfce7', ink: '#15803d', desc: 'Ya se habló con la persona' },
  { id: 'entrevista_agendada', name: 'Entrevista agendada', color: '#9333ea', soft: '#f3e8ff', ink: '#7e22ce', desc: 'Tiene fecha, hora y lugar de entrevista' },
  { id: 'entrevista_confirmada', name: 'Entrevista confirmada', color: '#7e22ce', soft: '#ede9fe', ink: '#6b21a8', desc: 'Confirmó que asistirá a la entrevista' },
  { id: 'entrevistado', name: 'Entrevistado', color: '#eab308', soft: '#fef9c3', ink: '#854d0e', desc: 'Ya se hizo la entrevista; falta decidir' },
  { id: 'califica', name: 'Califica', color: '#0d9488', soft: '#ccfbf1', ink: '#0f766e', desc: 'Aprobó la entrevista' },
  { id: 'entrenamiento_agendado', name: 'Entrenamiento agendado', color: '#ea580c', soft: '#ffedd5', ink: '#c2410c', desc: 'Tiene fecha para comenzar el entrenamiento' },
  { id: 'en_entrenamiento', name: 'En entrenamiento', color: '#f97316', soft: '#fff7ed', ink: '#9a3412', desc: 'Está haciendo el entrenamiento' },
  { id: 'contratado', name: 'Contratado', color: '#c026d3', soft: '#fae8ff', ink: '#a21caf', desc: 'Se unió al equipo' },
  { id: 'no_seleccionado', name: 'No seleccionado', color: '#dc2626', soft: '#fee2e2', ink: '#b91c1c', desc: 'No continúa en el proceso' },
  { id: 'sin_respuesta', name: 'Sin respuesta', color: '#991b1b', soft: '#fee2e2', ink: '#7f1d1d', desc: 'Nunca respondió' }
];
const CAND_OPEN = ['nuevo', 'intentando', 'contactado', 'entrevista_agendada', 'entrevista_confirmada', 'entrevistado', 'califica', 'entrenamiento_agendado', 'en_entrenamiento'];
const candStageById = (id) => CAND_STAGES.find((s) => s.id === id) || CAND_STAGES[0];

/* Resultado de cada intento de contacto con un candidato */
const CAND_OUTCOMES = [
  { id: 'no_contesto', name: 'No contestó', color: '#2563eb', contact: false, followDays: 1, stage: 'intentando' },
  { id: 'buzon', name: 'Buzón de voz', color: '#3b82f6', contact: false, followDays: 1, stage: 'intentando' },
  { id: 'mensaje', name: 'Mensaje enviado', color: '#60a5fa', contact: false, followDays: 1, stage: 'intentando' },
  { id: 'llamar_despues', name: 'Llamar después', color: '#22c55e', contact: true, followDays: 1, stage: 'contactado' },
  { id: 'contactado', name: 'Contactado', color: '#16a34a', contact: true, followDays: 2, stage: 'contactado' },
  { id: 'entrevista', name: 'Entrevista agendada', color: '#9333ea', contact: true, followDays: null, stage: 'entrevista_agendada', interview: true },
  { id: 'no_interesado', name: 'No le interesa', color: '#dc2626', contact: true, followDays: null, lose: 'no_seleccionado', reason: 'No le interesa' },
  { id: 'numero_incorrecto', name: 'Número incorrecto', color: '#b91c1c', contact: false, followDays: null, lose: 'sin_respuesta', reason: 'Número incorrecto' }
];
const candOutcomeById = (id) => CAND_OUTCOMES.find((o) => o.id === id);

const CAND_ACTIVITY = {
  llamada: { name: 'Llamada', icon: 'phone' },
  mensaje: { name: 'Mensaje (WhatsApp / SMS)', icon: 'message' },
  email: { name: 'Email', icon: 'mail' },
  comentario: { name: 'Comentario', icon: 'note' },
  entrevista: { name: 'Entrevista', icon: 'calendar' },
  seguimiento: { name: 'Seguimiento', icon: 'clock' },
  etapa: { name: 'Cambio de etapa', icon: 'flag' },
  asignacion: { name: 'Asignación', icon: 'users' },
  sistema: { name: 'Sistema', icon: 'info' }
};
const CAND_ATTEMPT_TYPES = ['llamada', 'mensaje', 'email'];
const isCandAttempt = (a) => !!a && !!a.outcome && CAND_ATTEMPT_TYPES.includes(a.type);

const Recruit = (() => {
  const all = () => Store.all('candidates');
  const get = (id) => Store.get('candidates', id);
  const mine = () => (Store.can('recruitAll') ? all() : all().filter((c) => c.ownerId === Store.currentUser().id));
  const canSee = (c) => c && (Store.can('recruitAll') || c.ownerId === Store.currentUser().id);
  const activitiesOf = (id) => U.sortBy(Store.where('candidateActivities', (a) => a.candidateId === id), (a) => a.createdAt, -1);
  const attemptsOf = (id) => U.sortBy(Store.where('candidateActivities', (a) => a.candidateId === id && isCandAttempt(a)), (a) => a.createdAt);
  const log = (candidateId, data) => Store.insert('candidateActivities', Object.assign({ candidateId, userId: Store.currentUser().id }, data));

  function changeStage(id, stage, extra = {}) {
    const c = get(id);
    if (!c || c.stage === stage) return;
    const from = c.stage;
    const patch = Object.assign({ stage }, extra);
    if (stage === 'contratado') patch.hiredAt = new Date().toISOString();
    if (!CAND_OPEN.includes(stage)) patch.nextFollowUp = extra.nextFollowUp !== undefined ? extra.nextFollowUp : null;
    Store.update('candidates', id, patch);
    log(id, { type: 'etapa', text: `${candStageById(from).name} → ${candStageById(stage).name}${extra.closeReason ? ' · Motivo: ' + extra.closeReason : ''}` });
  }

  // Intento de contacto: número, fecha, hora y agente automáticos; mueve la etapa según el resultado
  function logAttempt(id, { outcome, type = 'llamada', notes = '', nextFollowUp, followNote = '' }) {
    const c = get(id);
    const o = candOutcomeById(outcome);
    const now = new Date().toISOString();
    const attempt = (c.callCount || 0) + 1;
    log(id, { type, outcome, text: notes, attempt });
    const patch = { lastOutcome: outcome, lastContact: now, callCount: attempt };
    if (o && o.contact && !c.reachedAt) patch.reachedAt = now;
    if (nextFollowUp !== undefined) { patch.nextFollowUp = nextFollowUp; patch.followUpNote = followNote; }
    else if (o && o.followDays) { patch.nextFollowUp = new Date(Date.now() + o.followDays * U.DAY).toISOString(); patch.followUpNote = followNote; }
    else if (o && o.followDays === null) patch.nextFollowUp = null;
    Store.update('candidates', id, patch);
    const cur = get(id).stage;
    if (o && o.lose) { if (CAND_OPEN.includes(cur)) changeStage(id, o.lose, { closeReason: o.reason }); return; }
    const order = CAND_STAGES.map((s) => s.id);
    if (o && o.stage && CAND_OPEN.includes(cur) && order.indexOf(o.stage) > order.indexOf(cur)) changeStage(id, o.stage);
    // Igual que en ventas: si se completan los intentos sin lograr contacto, pasa a Sin respuesta
    const max = Store.maxAttempts();
    if (attempt >= max && ['nuevo', 'intentando'].includes(get(id).stage)) {
      changeStage(id, 'sin_respuesta', { closeReason: `Sin respuesta (${max} intentos)` });
      log(id, { type: 'sistema', text: `Se completaron ${max} intentos sin lograr contacto. El candidato quedó en Sin respuesta, con todo su historial.` });
    }
  }

  /* ---------- Entrevista ---------- */
  const INTERVIEW_STATUS = { agendada: 'Agendada', confirmada: 'Confirmada', realizada: 'Realizada', cancelada: 'Cancelada' };
  const interviewerName = (iv) => (iv && iv.interviewerId ? (Store.get('users', iv.interviewerId) || {}).name : '') || (iv && iv.interviewerName) || 'Sin asignar';
  const activeInterview = (c) => (c && c.interview && c.interview.at && ['agendada', 'confirmada'].includes(c.interview.status)) ? c.interview : null;
  function saveInterview(id, { at, place, interviewerId = '', interviewerName: ext = '', notes = '' }) {
    const c = get(id);
    const prev = activeInterview(c);
    const iv = { at, place: place || '', interviewerId, interviewerName: interviewerId ? '' : ext, notes, status: 'agendada', updatedAt: new Date().toISOString(), by: Store.currentUser().id };
    const t = new Date(at).getTime();
    const confirmAt = t - U.DAY > Date.now() ? new Date(t - U.DAY) : new Date(Math.max(Date.now(), t - 2 * 3600000));
    Store.update('candidates', id, { interview: iv, nextFollowUp: confirmAt.toISOString(), followUpNote: 'Confirmar la entrevista' });
    log(id, { type: 'entrevista', kind: prev ? 'reagendada' : 'agendada', text: `${prev ? 'Entrevista reagendada' : 'Entrevista agendada'} para el ${U.dateTime(at)}${place ? ' · ' + place : ''} · Entrevistador: ${interviewerName(iv)}${notes ? '\n' + notes : ''}` });
    if (CAND_OPEN.includes(c.stage) && CAND_STAGES.findIndex((s) => s.id === c.stage) < 3) changeStage(id, 'entrevista_agendada');
    else if (c.stage === 'entrevista_confirmada') changeStage(id, 'entrevista_agendada');
  }
  function setInterviewStatus(id, status, resultNotes = '') {
    const c = get(id);
    if (!c || !c.interview) return;
    const iv = Object.assign({}, c.interview, { status, updatedAt: new Date().toISOString() });
    if (status === 'realizada') iv.resultNotes = resultNotes;
    Store.update('candidates', id, { interview: iv });
    const label = { confirmada: 'Entrevista confirmada', realizada: 'Entrevista realizada', cancelada: 'Entrevista cancelada' }[status];
    log(id, { type: 'entrevista', kind: status, text: label + (resultNotes ? '\nNotas de la entrevista: ' + resultNotes : '') });
    if (status === 'confirmada') changeStage(id, 'entrevista_confirmada');
    if (status === 'realizada') { changeStage(id, 'entrevistado'); Store.update('candidates', id, { nextFollowUp: new Date(Date.now() + U.DAY).toISOString(), followUpNote: 'Decidir si califica' }); }
    if (status === 'cancelada' && ['entrevista_agendada', 'entrevista_confirmada'].includes(c.stage)) changeStage(id, 'contactado');
  }

  function setFollowUp(id, at, note = '') {
    Store.update('candidates', id, { nextFollowUp: at, followUpNote: note });
    log(id, { type: 'seguimiento', text: at ? `Próximo seguimiento: ${U.dateTime(at)}${note ? ' · ' + note : ''}` : 'Seguimiento quitado' });
  }

  function reassign(ids, userId) {
    ids.forEach((id) => {
      const c = get(id);
      if (!c || c.ownerId === userId) return;
      Store.update('candidates', id, { ownerId: userId });
      log(id, { type: 'asignacion', text: `Asignado a ${(Store.get('users', userId) || {}).name || '—'}` });
    });
  }

  function remove(id) {
    Store.where('candidateActivities', (a) => a.candidateId === id).forEach((a) => Store.remove('candidateActivities', a.id));
    Store.remove('candidates', id);
  }

  /* ---------- Referido por (conectado a la persona que refiere) ---------- */
  // Personas que pueden referir: el equipo, otros candidatos y los clientes visibles
  function referrerOptions(excludeId) {
    const opts = [];
    Store.activeUsers().forEach((u) => opts.push({ type: 'user', id: u.id, name: u.name, label: `${u.name} · Equipo` }));
    all().filter((c) => c.id !== excludeId).forEach((c) => opts.push({ type: 'candidate', id: c.id, name: c.name, label: `${c.name} · Candidato` }));
    Store.myClients().forEach((c) => opts.push({ type: 'client', id: c.id, name: c.name, label: `${c.name} · Cliente` }));
    return opts;
  }
  function referrerLink(c) {
    if (!c.referredBy) return '';
    const r = c.referredByRef || {};
    if (r.type === 'candidate' && get(r.id)) return `<a href="#/candidato/${r.id}">${U.esc(c.referredBy)}</a> <span class="muted small">(candidato)</span>`;
    if (r.type === 'client' && Store.get('clients', r.id)) return `<a href="#/cliente/${r.id}">${U.esc(c.referredBy)}</a> <span class="muted small">(cliente)</span>`;
    if (r.type === 'user') return `${U.esc(c.referredBy)} <span class="muted small">(equipo)</span>`;
    return U.esc(c.referredBy);
  }
  const referralsOf = (type, id) => all().filter((c) => c.referredByRef && c.referredByRef.type === type && c.referredByRef.id === id);

  const stageBadge = (s) => { const x = candStageById(s); return `<span class="badge stage-badge" style="background:${x.soft};color:${x.ink};border-color:${x.color}33"><span class="dot" style="background:${x.color}"></span>${x.name}</span>`; };
  const outcomeBadge = (id) => { const o = candOutcomeById(id); return o ? `<span class="badge" style="background:${o.color}1f;color:${o.color}">${o.name}</span>` : ''; };
  const yesNo = (v) => (v === true ? 'Sí' : v === false ? 'No' : '—');

  return {
    all, get, mine, canSee, activitiesOf, attemptsOf, log, changeStage, logAttempt, INTERVIEW_STATUS, interviewerName, activeInterview,
    saveInterview, setInterviewStatus, setFollowUp, reassign, remove, referrerOptions, referrerLink, referralsOf, stageBadge, outcomeBadge, yesNo
  };
})();
