/* /notice — si se graban las llamadas, avisa a la persona que contesta (en Florida
   hace falta el consentimiento de ambas partes para grabar). */
exports.handler = (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ language: 'es-MX' }, 'Esta llamada puede ser grabada para fines de calidad.');
  twiml.say({ language: 'en-US' }, 'This call may be recorded.');
  callback(null, twiml);
};
