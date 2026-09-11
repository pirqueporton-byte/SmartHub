// ============================================================
// MARÍA IA · CLIENTE SEGURO PARA SMART HUB
// ============================================================
// La API key NO vive aquí. Este archivo llama a un Cloudflare Worker.
// El Worker valida el token Firebase del usuario y recién entonces llama a Claude.
// Las herramientas se ejecutan en el navegador usando las funciones/Firebase
// que SmartHub ya utiliza. Claude nunca recibe credenciales de Firebase.
// ============================================================
(() => {
  'use strict';

  const cfg = () => window.MARIA_AI_CONFIG || {};
  const state = { messages: [] };

  function getDB() {
    try { if (typeof db !== 'undefined' && db) return db; } catch (_) {}
    return window.db || null;
  }

  function getAuth() {
    try { if (typeof auth !== 'undefined' && auth) return auth; } catch (_) {}
    return window.auth || window.firebase?.auth?.() || null;
  }

  function normalizar(s='') {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function valvulaZona(z, idx) {
    const v = Number(z?.config?.valvula);
    if (Number.isInteger(v) && v >= 1 && v <= 8) return v;
    const s = Number(z?.config?.sector);
    if (Number.isInteger(s) && s >= 0 && s <= 7) return s + 1;
    return idx + 1 <= 8 ? idx + 1 : null;
  }

  function serializarZonas(zones=[]) {
    return zones.map((z, idx) => ({
      id: z?.id ?? null,
      nombre: (z?.name || `Sector ${valvulaZona(z, idx) || idx + 1}`).trim(),
      valvula: valvulaZona(z, idx),
      dias: Array.isArray(z?.config?.dias) ? z.config.dias.map(String) : [],
      hora: z?.config?.hora || null,
      duracion_min: Number(z?.config?.duracion) || 0,
      aspersores: Number(z?.config?.aspersores) || 0,
      margen_seguridad_min: Number(z?.config?.margen_seguridad) || 0
    }));
  }

  async function leer(ruta) {
    const d = getDB();
    if (!d) throw new Error('Firebase no está disponible en esta página.');
    const snap = await d.ref(ruta).once('value');
    return snap.val();
  }

  async function toolConsultarRiego() {
    const data = await leer('modulo_riego') || {};
    return {
      sectores: serializarZonas(Array.isArray(data.zones) ? data.zones : []),
      estado_actual: data.estado_riego || {},
      ultimo_comando: data.comando || null,
      dias_codificacion: { '0':'domingo','1':'lunes','2':'martes','3':'miércoles','4':'jueves','5':'viernes','6':'sábado' },
      fecha_local: new Date().toLocaleDateString('es-CL', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
      hora_local: new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
    };
  }

  async function toolConsultarPorton() {
    const data = await leer('estado_porton') || {};
    const raw = Number(data.ultima_conexion || 0);
    const ts = raw && raw < 10000000000 ? raw * 1000 : raw;
    return {
      conectado: !!ts && (Date.now() - ts) / 1000 <= 35,
      ultima_conexion: raw || null,
      comando: data.comando || null
    };
  }

  const lugares = {
    pirque: { nombre:'Pirque', lat:-33.6357, lon:-70.5724 },
    comuna: { nombre:'Pirque', lat:-33.6357, lon:-70.5724 },
    santiago: { nombre:'Santiago', lat:-33.4489, lon:-70.6693 },
    ciudad: { nombre:'Santiago', lat:-33.4489, lon:-70.6693 }
  };

  async function toolConsultarClima(input={}) {
    const key = normalizar(input.lugar || 'pirque');
    const lugar = lugares[key] || lugares.pirque;
    const dias = Math.max(1, Math.min(7, Number(input.dias) || 3));
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lugar.lat);
    url.searchParams.set('longitude', lugar.lon);
    url.searchParams.set('timezone', 'America/Santiago');
    url.searchParams.set('forecast_days', String(dias));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max');
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo consultar Open-Meteo.');
    const data = await res.json();
    return { lugar: lugar.nombre, current: data.current || {}, daily: data.daily || {} };
  }

  async function toolAbrirPorton() {
    if (typeof window.abrirPortonAnimado === 'function') {
      window.abrirPortonAnimado();
      return { ok:true, mensaje:'Comando de apertura ejecutado.' };
    }
    if (typeof window.abrirPorton === 'function') {
      window.abrirPorton();
      return { ok:true, mensaje:'Comando de apertura ejecutado.' };
    }
    const d = getDB();
    if (!d) throw new Error('Firebase no disponible.');
    await d.ref('estado_porton').update({
      comando: 'abrir_' + Date.now(),
      timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now()
    });
    return { ok:true, mensaje:'Comando de apertura enviado.' };
  }

  async function toolControlarRiego(input={}) {
    const accion = normalizar(input.accion || '');
    const permitidas = ['detener','pausar','continuar','manual'];
    if (!permitidas.includes(accion)) throw new Error('Acción de riego no permitida.');
    const d = getDB();
    if (!d) throw new Error('Firebase no disponible.');

    if (accion !== 'manual') {
      await d.ref('modulo_riego/comando').set({ accion, timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now() });
      return { ok:true, accion };
    }

    const data = await leer('modulo_riego') || {};
    const zones = Array.isArray(data.zones) ? data.zones : [];
    let valvula = Number(input.valvula);
    if (!Number.isInteger(valvula) && input.sector) {
      const buscado = normalizar(input.sector);
      const idx = zones.findIndex((z, i) => normalizar(z?.name || `sector ${valvulaZona(z,i)}`) === buscado || normalizar(z?.name || '').includes(buscado));
      if (idx >= 0) valvula = valvulaZona(zones[idx], idx);
    }
    if (!Number.isInteger(valvula) || valvula < 1 || valvula > 8) throw new Error('No pude identificar una válvula válida entre 1 y 8.');
    const idx = zones.findIndex((z,i) => valvulaZona(z,i) === valvula);
    if (idx < 0) throw new Error(`La válvula ${valvula} no tiene un sector configurado.`);
    const minutos = Math.max(1, Math.min(120, Number(input.minutos) || Number(zones[idx]?.config?.duracion) || 10));
    await d.ref('modulo_riego/comando').set({
      accion:'manual', sector: valvula - 1, minutos,
      timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now()
    });
    return { ok:true, accion:'manual', valvula, sector: zones[idx]?.name || `Sector ${valvula}`, minutos };
  }

  async function toolActualizarProgramacion(input={}) {
    const data = await leer('modulo_riego') || {};
    const zones = Array.isArray(data.zones) ? data.zones : [];
    let idx = -1;
    const v = Number(input.valvula);
    if (Number.isInteger(v)) idx = zones.findIndex((z,i) => valvulaZona(z,i) === v);
    if (idx < 0 && input.sector) {
      const q = normalizar(input.sector);
      idx = zones.findIndex((z,i) => {
        const nombre = normalizar(z?.name || `sector ${valvulaZona(z,i)}`);
        return nombre === q || nombre.includes(q) || q.includes(nombre);
      });
    }
    if (idx < 0) throw new Error('No pude identificar el sector a modificar.');

    const actual = zones[idx];
    const nueva = JSON.parse(JSON.stringify(actual));
    nueva.config = nueva.config || {};
    if (Array.isArray(input.dias)) nueva.config.dias = input.dias.map(String).filter(x => ['0','1','2','3','4','5','6'].includes(x));
    if (input.hora != null) nueva.config.hora = String(input.hora);
    if (input.duracion_min != null) nueva.config.duracion = String(Math.max(1, Math.min(120, Number(input.duracion_min))));

    const resumen = `${nueva.name || `Sector ${valvulaZona(nueva,idx)}`}: días ${(nueva.config.dias||[]).join(', ') || 'ninguno'}, hora ${nueva.config.hora || 'sin hora'}, duración ${nueva.config.duracion || 'sin definir'} min`;
    const ok = window.confirm(`María quiere cambiar la programación de riego.\n\n${resumen}\n\n¿Confirmas este cambio?`);
    if (!ok) return { ok:false, cancelado_por_usuario:true };

    zones[idx] = nueva;
    const d = getDB();
    await d.ref('modulo_riego/zones').set(zones);
    return { ok:true, sector:nueva.name || `Sector ${valvulaZona(nueva,idx)}`, programacion:nueva.config };
  }

  async function toolNavegar(input={}) {
    const modulo = normalizar(input.modulo || '');
    const destinos = { inicio:'admin_inicio.html', riego:'admin_riego.html', porton:'admin_porton.html', portón:'admin_porton.html' };
    const destino = destinos[modulo];
    if (!destino) return { ok:false, mensaje:'Módulo no reconocido.' };
    setTimeout(() => { window.location.href = destino; }, 900);
    return { ok:true, destino };
  }

  const toolHandlers = {
    consultar_riego: toolConsultarRiego,
    consultar_porton: toolConsultarPorton,
    consultar_clima: toolConsultarClima,
    abrir_porton: toolAbrirPorton,
    controlar_riego: toolControlarRiego,
    actualizar_programacion_riego: toolActualizarProgramacion,
    navegar_modulo: toolNavegar
  };

  async function llamarWorker(messages) {
    const conf = cfg();
    if (!conf.enabled) throw new Error('María IA está desactivada.');
    if (!conf.endpoint || conf.endpoint.includes('REEMPLAZAR-CON-TU-WORKER')) {
      const e = new Error('WORKER_NO_CONFIGURADO');
      e.code = 'WORKER_NO_CONFIGURADO';
      throw e;
    }

    const a = getAuth();
    const user = a?.currentUser;
    if (!user) throw new Error('Debes iniciar sesión para usar María IA.');
    const token = await user.getIdToken();

    const res = await fetch(conf.endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
      body: JSON.stringify({ messages })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Error del asistente (${res.status}).`);
    return json;
  }

  async function procesar(texto) {
    const conf = cfg();
    state.messages.push({ role:'user', content:`[Preferencia del usuario: tu nombre es ${window.AssistantSettings.name()}. Usa ese nombre al presentarte.]\n${String(texto)}` });
    const maxHistory = Math.max(8, Number(conf.conversationMessages) || 12);

    let rounds = 0;
    while (rounds++ < (Number(conf.maxToolRounds) || 5)) {
      const response = await llamarWorker(state.messages);
      if (!Array.isArray(response.content)) throw new Error('Respuesta inválida del asistente.');

      state.messages.push({ role:'assistant', content:response.content });
      const toolUses = response.content.filter(b => b?.type === 'tool_use');
      if (!toolUses.length) {
        const textoFinal = response.content.filter(b => b?.type === 'text').map(b => b.text).join(' ').trim();
        // Podamos solo al cerrar un turno completo para no separar tool_use/tool_result.
        if (state.messages.length > maxHistory) {
          let start = Math.max(0, state.messages.length - maxHistory);
          while (start < state.messages.length - 1) {
            const m = state.messages[start];
            if (m?.role === 'user' && typeof m.content === 'string') break;
            start++;
          }
          state.messages = state.messages.slice(start);
        }
        return textoFinal || 'Listo.';
      }

      const resultados = [];
      for (const call of toolUses) {
        const fn = toolHandlers[call.name];
        try {
          const result = fn ? await fn(call.input || {}) : { ok:false, error:`Herramienta no disponible: ${call.name}` };
          resultados.push({ type:'tool_result', tool_use_id:call.id, content:JSON.stringify(result) });
        } catch (err) {
          resultados.push({ type:'tool_result', tool_use_id:call.id, is_error:true, content:String(err?.message || err) });
        }
      }
      state.messages.push({ role:'user', content:resultados });
    }
    throw new Error('María necesitó demasiados pasos para resolver la solicitud.');
  }

  function limpiarContexto() { state.messages = []; }
  function disponible() {
    const conf = cfg();
    return !!(conf.enabled && conf.endpoint && !conf.endpoint.includes('REEMPLAZAR-CON-TU-WORKER'));
  }

  window.MariaAI = { procesar, limpiarContexto, disponible };
})();
