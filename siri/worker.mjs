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
async function network(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const error = new Error('redirect_blocked'); error.name = 'RedirectBlocked'; throw error;
    }
    // Leer el cuerpo antes de quitar el límite de tiempo.
    const body = await response.text();
    return new Response(body, { status: response.status, headers: response.headers });
  } finally { clearTimeout(timer); }
}
const legacyWorker = {
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
    let etapa = 'renovar_sesion';
    try {
      const tokenResponse = await network(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.FIREBASE_REFRESH_TOKEN }).toString()
      });
      if (!tokenResponse.ok) return json(401, 'Vuelve a vincular la cuenta de SmartHub en Cloudflare.');
      const token = await tokenResponse.json();
      if (!token.id_token || !token.user_id) return json(502, 'No se pudo validar la sesión.');
      etapa = 'validar_cuenta';
      const accountResponse = await network(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token.id_token })
      });
      if (!accountResponse.ok) return json(401, 'La cuenta vinculada ya no está disponible.');
      const account = (await accountResponse.json()).users?.[0];
      if (!account || account.disabled || account.localId !== token.user_id || (env.__uid ? account.localId !== env.__uid : account.email !== ADMIN_EMAIL) || !account.emailVerified) {
        return json(403, 'Vincula la cuenta administradora autorizada de SmartHub.');
      }
      if (env.__uid && account.email !== ADMIN_EMAIL) {
        const permission = await network(`${DATABASE}/lista_blanca/${encodeURIComponent(account.localId)}.json?auth=${encodeURIComponent(token.id_token)}`);
        if (!permission.ok || !await permission.json()) return json(403, 'Tu cuenta ya no tiene acceso al portón.');
      }
      if (env.__saveRefresh) await env.__saveRefresh(token.refresh_token || env.FIREBASE_REFRESH_TOKEN);
      etapa = 'leer_porton';
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
      etapa = 'enviar_orden';
      if (env.__beforeWrite && !await env.__beforeWrite()) return json(401, 'Esta vinculación fue revocada. No envié la orden.');
      writing = true;
      const written = await network(stateUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify({ ...state, comando: `abrir_${now}`, timestamp: { '.sv': 'timestamp' } })
      });
      if (written.status === 412) return json(409, 'El estado cambió durante la consulta. No envié la orden; puedes volver a pedirla.');
      if (!written.ok) return json(502, 'No pude confirmar el envío de la orden. Revisa el portón antes de repetirla.');
      return json(200, 'Orden de apertura enviada.', { enviada: true });
    } catch (error) {
      // Solo códigos controlados: nunca registrar URLs, tokens ni respuestas de Firebase.
      const tipo = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'tiempo_agotado'
        : error instanceof SyntaxError ? 'respuesta_invalida'
        : error?.name === 'RedirectBlocked' ? 'redireccion_bloqueada'
        : /dns|resolve|name resolution/i.test(error?.message || '') ? 'error_dns'
        : /certificate|tls|ssl/i.test(error?.message || '') ? 'error_tls'
        : /not a function|not defined|unsupported|not implemented/i.test(error?.message || '') ? 'incompatibilidad_runtime'
        : 'fallo_conexion';
      const codigo = etapa + ':' + tipo;
      const pasos = { renovar_sesion: 'renovar la sesión de Firebase', validar_cuenta: 'validar la cuenta de Google', leer_porton: 'leer el estado del portón', enviar_orden: 'enviar la orden' };
      console.warn('SmartHub conexión', codigo);
      return json(502, writing ? 'No pude confirmar el envío de la orden. Revisa el portón antes de repetirla. Código: ' + codigo
        : 'Falló la conexión al ' + pasos[etapa] + '. No envié la orden. Código: ' + codigo, { codigo, version: '20260912-conexion-v2' });
    }
  }
};


// Appended to the legacy handler to produce a single dashboard-deployable Worker.
const PWA_ORIGIN = 'https://pirqueporton-byte.github.io';
const enc = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const hash = async s => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const fail = (status,message) => { const e=new Error(message);e.status=status;throw e; };
const shortcutUrl = env => /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i.test(env.SIRI_SHORTCUT_URL || '') ? env.SIRI_SHORTCUT_URL : '';
function configured(env) {return !!env.SIRI_DB && /^[a-f0-9]{64}$/i.test(env.SIRI_ENCRYPTION_KEY || '');}
async function cryptKey(env) {
 return crypto.subtle.importKey('raw',Uint8Array.from(env.SIRI_ENCRYPTION_KEY.match(/../g),s=>parseInt(s,16)),'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(env,id,text) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},await cryptKey(env),enc.encode(text)));
 return hex(iv)+':'+hex(bytes);
}
async function unseal(env,id,text) {
 const [iv,data]=text.split(':').map(s=>Uint8Array.from(s.match(/../g),b=>parseInt(b,16)));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},await cryptKey(env),data));
}
async function body(request) {
 // Stream limit also applies when Content-Length is absent.
 const reader=request.body?.getReader();if(!reader)fail(400,'Faltan los datos.');
 let size=0,chunks=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail(413,'Solicitud demasiado grande.');}chunks.push(value);}}
 finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try {const b=JSON.parse(new TextDecoder().decode(bytes));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch(_){fail(400,'Datos no válidos.');}
}
async function account(token) {
 if(typeof token!=='string'||token.length<20||token.length>12000)fail(401,'Vuelve a iniciar sesión en SmartHub.');
 const r=await network(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)fail(401,'Vuelve a iniciar sesión en SmartHub.');
 const u=(await r.json()).users?.[0];
 if(!u?.localId||u.disabled||!u.emailVerified)fail(403,'Necesitas una cuenta de Google verificada.');
 return u;
}
async function allowed(u,token) {
 if(u.email===ADMIN_EMAIL)return;
 const r=await network(`${DATABASE}/lista_blanca/${encodeURIComponent(u.localId)}.json?auth=${encodeURIComponent(token)}`);
 if(!r.ok||!await r.json())fail(403,'Tu cuenta no tiene acceso al portón.');
}
async function renew(refresh) {
 if(typeof refresh!=='string'||refresh.length<20||refresh.length>8192)fail(400,'No se pudo vincular la sesión.');
 const r=await network(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}).toString()});
 if(!r.ok)fail(401,'La sesión venció. Vuelve a iniciar sesión en SmartHub.');
 return r.json();
}
async function handleV1(request,env,path) {
 if(path==='/v1/config'&&request.method==='GET') {
  let ready=configured(env);
  if(ready){try{await env.SIRI_DB.prepare('SELECT id FROM siri_links LIMIT 1').first();}catch(_){ready=false;}}
  return json(200,ready&&shortcutUrl(env)?'Siri disponible.':'Estamos preparando la conexión con Siri.',{ready:ready&&!!shortcutUrl(env),shortcut_url:ready?shortcutUrl(env):''});
 }
 if(request.method!=='POST')return json(405,'Método no permitido.');
 if(!configured(env))return json(503,'La conexión con Siri todavía no está activada.');
 const db=env.SIRI_DB,now=Date.now();
 if(['/v1/pair/start','/v1/status','/v1/revoke'].includes(path)) {
  if(request.headers.get('Origin')!==PWA_ORIGIN)fail(403,'Usa la configuración de SmartHub.');
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))fail(401,'Inicia sesión en SmartHub.');
  const token=authorization.slice(7),u=await account(token),b=await body(request);
  if(path==='/v1/status') {
   const records=await db.prepare("SELECT id,label,created,expires FROM siri_links WHERE uid=? AND kind='active' AND expires>? ORDER BY created DESC").bind(u.localId,now).all();
   return json(200,records.results.length?'Siri vinculado.':'Aún no tienes Siri vinculado.',{links:records.results});
  }
  if(path==='/v1/revoke') {
   if(typeof b.id!=='string'||!/^[a-f0-9]{32}$/.test(b.id))fail(400,'Selecciona la vinculación.');
   await db.prepare('DELETE FROM siri_links WHERE uid=? AND id=?').bind(u.localId,b.id).run();
   return json(200,'Vinculación eliminada.');
  }
  if(!shortcutUrl(env))fail(503,'Falta publicar el atajo de SmartHub.');
  await allowed(u,token);
  const session=await renew(b.refresh_token);
  if(session.user_id!==u.localId)fail(403,'La sesión no coincide con tu cuenta.');
  const verified=await account(session.id_token);if(verified.localId!==u.localId)fail(403,'La sesión no coincide.');
  await allowed(verified,session.id_token);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM siri_links WHERE uid=? AND kind='active' AND expires>?").bind(u.localId,now).first();
  if(count.n>=5)fail(409,'Desvincula un dispositivo antes de añadir otro.');
  const id=random(16),code=random(16),expires=now+10*60*1000;
  const cipher=await seal(env,id,session.refresh_token||b.refresh_token);
  const label=typeof b.label==='string'?b.label.trim().slice(0,40):'Mi iPhone';
  await db.batch([
   db.prepare("DELETE FROM siri_links WHERE (uid=? AND kind='pending') OR expires<=?").bind(u.localId,now),
   db.prepare("INSERT INTO siri_links(id,uid,kind,secret_hash,cipher,created,expires,label) VALUES(?,?,'pending',?,?,?,?,?)").bind(id,u.localId,await hash(code),cipher,now,expires,label||'Mi iPhone')
  ]);
  return json(200,'Código listo. Cópialo en el atajo; vence en diez minutos.',{id,code,expires});
 }
 // Native Shortcuts endpoints: no cookies, no browser origin, only scoped credentials.
 if(request.headers.has('Origin'))fail(403,'Esta acción se ejecuta desde Atajos.');
 if(path==='/v1/pair/redeem') {
  const b=await body(request),code=String(b.code||'').trim().toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(code))fail(400,'Copia el código completo desde SmartHub.');
  const credential='shs_'+random(32),secretHash=await hash(credential);
  // A single atomic UPDATE consumes the one-time code, including concurrent redemption.
  const link=await db.prepare("UPDATE siri_links SET kind='active',secret_hash=?,expires=? WHERE secret_hash=? AND kind='pending' AND expires>? RETURNING id").bind(secretHash,now+180*86400000,await hash(code),now).first();
  if(!link)fail(401,'El código venció o ya se utilizó. Genera otro en SmartHub.');
  return json(200,'SmartHub conectado. No se envió ninguna orden.',{credential,link_id:link.id});
 }
 if(!['/v1/verify','/v1/open'].includes(path))return json(404,'Ruta no disponible.');
 const credential=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!/^shs_[a-f0-9]{64}$/.test(credential))fail(401,'Vuelve a conectar Siri desde SmartHub.');
 const secretHash=await hash(credential);
 const link=await db.prepare("SELECT * FROM siri_links WHERE secret_hash=? AND kind='active' AND expires>?").bind(secretHash,now).first();
 if(!link)fail(401,'La vinculación venció o fue eliminada. Conecta Siri desde SmartHub.');
 const b=await body(request);
 if(path==='/v1/open'&&b.accion!=='abrir')fail(400,'Falta la orden explícita de apertura.');
 const refresh=await unseal(env,link.id,link.cipher);
 const internal=random(32);
 return legacyWorker.fetch(new Request('https://internal.invalid'+(path==='/v1/open'?'/abrir':'/verificar'),{method:'POST',headers:{Authorization:'Bearer '+internal,'Content-Type':'application/json'},body:JSON.stringify({accion:'abrir'})}),{
  SIRI_TOKEN:internal,FIREBASE_REFRESH_TOKEN:refresh,__uid:link.uid,
  __saveRefresh:async next=>{if(next!==refresh)await db.prepare("UPDATE siri_links SET cipher=? WHERE id=? AND secret_hash=? AND kind='active'").bind(await seal(env,link.id,next),link.id,secretHash).run();},
  __beforeWrite:async()=>!!await db.prepare("SELECT id FROM siri_links WHERE id=? AND secret_hash=? AND kind='active' AND expires>?").bind(link.id,secretHash,Date.now()).first()
 });
}
export default {
 async fetch(request,env) {
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/v1/'))return legacyWorker.fetch(request,env);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==PWA_ORIGIN)return json(403,'Origen no permitido.');
  const cors=response=>{if(origin===PWA_ORIGIN){response.headers.set('Access-Control-Allow-Origin',PWA_ORIGIN);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');}return response;};
  if(request.method==='OPTIONS')return cors(new Response(null,{status:204}));
  try{return cors(await handleV1(request,env,path));}
  catch(e){return cors(json(e.status||503,e.status?e.message:'No se pudo completar la conexión. Inténtalo nuevamente desde SmartHub.'));}
 }
};
