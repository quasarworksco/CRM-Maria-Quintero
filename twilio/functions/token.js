/* /token — entrega el permiso para llamar desde el navegador (dura 1 hora y se renueva solo).
   Solo para personas con sesión activa en el CRM y permiso de prospectos. */
exports.handler = async (context, event, callback) => {
  const auth = require(Runtime.getFunctions().auth.path);
  const res = auth.json(context);
  try {
    const u = await auth.verify(context, event.idToken);
    const AccessToken = Twilio.jwt.AccessToken;
    const token = new AccessToken(context.ACCOUNT_SID, context.API_KEY_SID, context.API_KEY_SECRET, { identity: u.identity, ttl: 3600 });
    token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: context.TWIML_APP_SID, incomingAllow: true }));
    res.setBody({ token: token.toJwt(), identity: u.identity, callerIds: { fl: context.NUMBER_FL || '', pr: context.NUMBER_PR || '' } });
  } catch (e) {
    res.setStatusCode(e.status || 500);
    res.setBody({ error: e.message });
  }
  callback(null, res);
};
