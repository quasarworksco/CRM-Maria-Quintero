/* /call-result — al colgar, el CRM pregunta cómo terminó la llamada:
   contestada, no contestó, ocupado o falló, y la duración real en segundos. */
exports.handler = async (context, event, callback) => {
  const auth = require(Runtime.getFunctions().auth.path);
  const res = auth.json(context);
  try {
    const u = await auth.verify(context, event.idToken);
    if (!/^CA[0-9a-f]{32}$/.test(String(event.sid || ''))) throw Object.assign(new Error('Llamada no válida'), { status: 400 });
    const client = context.getTwilioClient();
    const parent = await client.calls(event.sid).fetch();
    if (parent.from !== 'client:' + u.identity && u.role !== 'admin') throw Object.assign(new Error('Esta llamada no es tuya'), { status: 403 });
    const kids = await client.calls.list({ parentCallSid: event.sid, limit: 5 });
    const child = kids[0];
    const status = child ? child.status : parent.status; // completed, busy, no-answer, failed, canceled, in-progress
    const duration = child ? Number(child.duration) || 0 : 0;
    res.setBody({ status, answered: !!child && status === 'completed' && duration > 0, duration });
  } catch (e) {
    res.setStatusCode(e.status || 500);
    res.setBody({ error: e.message });
  }
  callback(null, res);
};
