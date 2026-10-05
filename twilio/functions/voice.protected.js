/* /voice — instrucciones para cada llamada (protegida: solo Twilio puede usarla).
   - Saliente (desde el CRM): marca al cliente con el número 407 o 787 y respeta el horario.
   - Entrante (alguien llama al 407 o al 787): suena en las computadoras de las personas
     indicadas en INBOUND_IDENTITIES y, si nadie contesta, va al buzón de voz. */
exports.handler = (context, event, callback) => {
  const auth = require(Runtime.getFunctions().auth.path);
  const twiml = new Twilio.twiml.VoiceResponse();
  const say = (text) => twiml.say({ language: 'es-MX' }, text);
  const from = String(event.From || '');

  if (from.startsWith('client:')) {
    const identity = from.slice(7);
    const to = auth.normalize(event.To);
    if (!auth.validTo(to)) { say('El número no es válido.'); return callback(null, twiml); }
    if (!auth.inHours(context, identity)) { say('Fuera del horario de llamadas.'); return callback(null, twiml); }
    const record = context.RECORD_CALLS === 'true';
    const dial = twiml.dial(Object.assign({ callerId: auth.callerIdFor(context, to), answerOnBridge: true, timeout: 30 }, record ? { record: 'record-from-answer-dual' } : {}));
    dial.number(record ? { url: '/notice' } : {}, to);
    return callback(null, twiml);
  }

  const ids = String(context.INBOUND_IDENTITIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length && auth.inHours(context, 'entrante.a')) {
    const dial = twiml.dial({ timeout: 25, answerOnBridge: true, action: '/voicemail' });
    ids.forEach((id) => { dial.client(id + '.a'); dial.client(id + '.m'); });
  } else {
    twiml.redirect('/voicemail');
  }
  callback(null, twiml);
};
