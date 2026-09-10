// Worker independiente: no sustituye al Worker de María IA.
// Secrets: SIRI_TOKEN (64 caracteres hex), FIREBASE_REFRESH_TOKEN.
const API_KEY = 'AIzaSyCABy9Rpn1wc1gYBzDEm8Mf05x0gu9lpyQ';
const DATABASE = 'https://portonpique-default-rtdb.firebaseio.com';
const ADMIN_EMAIL = 'pirqueporton@gmail.com';
const json = (status, mensaje, extra = {}) => Response.json({ ok: status === 200, mensaje, ...extra }, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
async function sameSecret(a, b) {
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
const network = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(8000), redirect: 'error' });
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!['/abrir', '/verificar'].includes(path)) return json(404, 'Ruta no disponible.');
    if (request.method !== 'POST') return json(405, 'Usa el atajo configurado en el iPhone.');
    if (!/^[a-f0-9]{64}$/i.test(env.SIRI_TOKEN || '') || !env.FIREBASE_REFRESH_TOKEN) {
      return json(503, 'Falta configurar la conexión de Siri en Cloudflare.');
    }
    const supplied = request.headers.get('Authorization') || '';
    if (supplied.length > 200 || !await sameSecret(supplied, `Bearer ${env.SIRI_TOKEN}`)) return json(401, 'La clave del atajo no es válida.');
    // Shortcuts realiza la petición nativa, sin Origin. No se ofrece una API web con CORS.
    if (request.headers.has('Origin')) return json(403, 'Esta conexión es exclusiva del atajo.');
    if (path === '/abrir') {
      try {
        const text = await request.text();
        if (text.length > 200 || JSON.parse(text).accion !== 'abrir') return json(400, 'Falta la orden explícita de apertura.');
      } catch (_) { return json(400, 'La orden no tiene un formato válido.'); }
    }
    let writing = false;
    try {
      const tokenResponse = await network(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.FIREBASE_REFRESH_TOKEN })
      });
      if (!tokenResponse.ok) return json(401, 'Vuelve a vincular la cuenta de SmartHub en Cloudflare.');
      const token = await tokenResponse.json();
      if (!token.id_token || !token.user_id) return json(502, 'No se pudo validar la sesión.');
      const accountResponse = await network(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token.id_token })
      });
      if (!accountResponse.ok) return json(401, 'La cuenta vinculada ya no está disponible.');
      const account = (await accountResponse.json()).users?.[0];
      if (!account || account.disabled || account.localId !== token.user_id || account.email !== ADMIN_EMAIL || !account.emailVerified) {
        return json(403, 'Vincula la cuenta administradora autorizada de SmartHub.');
      }
      const stateUrl = `${DATABASE}/estado_porton.json?auth=${encodeURIComponent(token.id_token)}`;
      const stateResponse = await network(stateUrl, { headers: { 'X-Firebase-ETag': 'true' } });
      if (!stateResponse.ok) return json(403, 'Firebase no permite acceder al portón con esta cuenta.');
      const state = await stateResponse.json();
      const etag = stateResponse.headers.get('ETag');
      const now = Date.now();
      let seen = Number(state?.ultima_conexion);
      if (seen > 0 && seen < 1e11) seen *= 1000;
      const online = Number.isFinite(seen) && seen > 0 && now - seen >= -5000 && now - seen <= 30000;
      if (path === '/verificar') return json(200, online ? 'Conexión lista. El portón está en línea. No se ha enviado ninguna orden.' : 'La cuenta está vinculada, pero el portón está sin conexión. No se ha enviado ninguna orden.', { online });
      if (!online) return json(409, 'El portón está sin conexión. No envié la orden.');
      const previous = Number(state.timestamp);
      if (Number.isFinite(previous) && now - previous < 10000 && now - previous >= -5000) {
        return json(409, 'Hay una orden reciente. Espera diez segundos antes de volver a intentarlo.');
      }
      if (!etag) return json(502, 'No se pudo comprobar el estado del portón. No envié la orden.');
      // Escritura condicional: no pisa latidos/comandos concurrentes ni reintenta una apertura.
      writing = true;
      const written = await network(stateUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify({ ...state, comando: `abrir_${now}`, timestamp: { '.sv': 'timestamp' } })
      });
      if (written.status === 412) return json(409, 'El estado cambió durante la consulta. No envié la orden; puedes volver a pedirla.');
      if (!written.ok) return json(502, 'No pude confirmar el envío de la orden. Revisa el portón antes de repetirla.');
      return json(200, 'Orden de apertura enviada.', { enviada: true });
    } catch (_) {
      return json(502, writing ? 'No pude confirmar el envío de la orden. Revisa el portón antes de repetirla.' : 'No pude conectar con SmartHub. No envié la orden.');
    }
  }
};
