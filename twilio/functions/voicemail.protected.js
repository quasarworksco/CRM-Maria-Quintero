/* /voicemail — si nadie contesta una llamada entrante, se graba un mensaje.
   Los mensajes quedan en Twilio: Monitor → Logs → Call recordings. */
exports.handler = (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  if (event.DialCallStatus === 'completed' || event.DialCallStatus === 'answered') { twiml.hangup(); return callback(null, twiml); }
  twiml.say({ language: 'es-MX' }, context.VOICEMAIL_TEXT || `Gracias por llamar a ${context.COMPANY_NAME || 'nuestra empresa'}. En este momento no podemos atenderle. Deje su nombre y su número después del tono y le devolveremos la llamada.`);
  twiml.record({ maxLength: 120, playBeep: true, trim: 'trim-silence' });
  twiml.hangup();
  callback(null, twiml);
};
