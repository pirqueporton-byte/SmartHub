// ============================================================
// MARÍA · ASISTENTE DE VOZ CONTEXTUAL PARA SMART HUB
// ============================================================
// - Conversación natural en español de Chile.
// - Consulta Firebase para responder con datos reales del riego/portón.
// - Consulta clima de Pirque y Santiago con Open-Meteo (sin API key).
// - Permite preguntas de seguimiento sin repetir "María" durante unos segundos.
// - Mantiene comandos físicos explícitos (portón y riego manual) separados
//   de las consultas informativas para evitar activaciones accidentales.
// ============================================================

(() => {
  'use strict';

  const MARIA = {
    recognition: null,
    listening: true,
    speaking: false,
    active: false,
    starting: false,
    suspended: document.hidden,
    blocked: false,
    speechId: 0,
    speechTimer: null,
    releaseAudio: null,
    conversationUntil: 0,
    conversationMs: 18000,
    lastContext: null,
    lastTranscript: '',
    lastTranscriptAt: 0,
    weatherCache: new Map(),
    ui: null,
    restartTimer: null,

    lugares: {
      comuna: { nombre: 'Pirque', lat: -33.6357, lon: -70.5724 },
      pirque: { nombre: 'Pirque', lat: -33.6357, lon: -70.5724 },
      ciudad: { nombre: 'Santiago', lat: -33.4489, lon: -70.6693 },
      santiago: { nombre: 'Santiago', lat: -33.4489, lon: -70.6693 }
    }
  };

  const DIAS = [
    { id: '0', largo: 'domingo', corto: 'dom' },
    { id: '1', largo: 'lunes', corto: 'lun' },
    { id: '2', largo: 'martes', corto: 'mar' },
    { id: '3', largo: 'miércoles', corto: 'mié' },
    { id: '4', largo: 'jueves', corto: 'jue' },
    { id: '5', largo: 'viernes', corto: 'vie' },
    { id: '6', largo: 'sábado', corto: 'sáb' }
  ];

  function normalizar(texto = '') {
    return String(texto)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contiene(texto, palabras) {
    return palabras.some(p => texto.includes(p));
  }

  function ahoraConversando() {
    return Date.now() < MARIA.conversationUntil;
  }

  function abrirConversacion(ms = MARIA.conversationMs) {
    MARIA.conversationUntil = Date.now() + ms;
    actualizarUI('conversando');
  }

  function cerrarConversacion() {
    MARIA.conversationUntil = 0;
    actualizarUI(MARIA.listening ? 'escuchando' : 'inactivo');
  }

  function crearUI() {
    if (document.getElementById('maria-voice-status')) {
      MARIA.ui = document.getElementById('maria-voice-status');
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      #maria-voice-status{position:fixed;right:18px;bottom:18px;z-index:99999;display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:999px;background:rgba(20,24,31,.82);color:#fff;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.2);font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:.78;transition:.2s ease;pointer-events:auto;cursor:pointer}
      #maria-voice-status .maria-dot{width:8px;height:8px;border-radius:50%;background:#7f8c98;box-shadow:0 0 0 0 rgba(80,200,255,0)}
      #maria-voice-status[data-state="escuchando"] .maria-dot{background:#55d68b}
      #maria-voice-status[data-state="conversando"]{opacity:1;border-color:rgba(80,200,255,.35)}
      #maria-voice-status[data-state="conversando"] .maria-dot{background:#50c8ff;animation:mariaPulse 1.4s infinite}
      #maria-voice-status[data-state="hablando"] .maria-dot{background:#b49cff;animation:mariaPulse 1s infinite}
      #maria-voice-status[data-state="error"] .maria-dot{background:#ff6b6b}
      @keyframes mariaPulse{0%{box-shadow:0 0 0 0 rgba(80,200,255,.45)}70%{box-shadow:0 0 0 8px rgba(80,200,255,0)}100%{box-shadow:0 0 0 0 rgba(80,200,255,0)}}
      @media(max-width:700px){#maria-voice-status{right:12px;bottom:12px;padding:8px 10px;font-size:11px}}
    `;
    document.head.appendChild(style);

    const el = document.createElement('button');
    el.type = 'button';
    el.title = 'Pausar o reactivar el micrófono';
    el.addEventListener('click', () => {
      if (MARIA.listening && !MARIA.blocked && !MARIA.suspended) {
        MARIA.listening = false;
        suspenderVoz();
        MARIA.suspended = document.hidden;
        actualizarUI('inactivo', 'María · activar micrófono');
      } else {
        MARIA.blocked = false;
        MARIA.listening = true;
        MARIA.suspended = false;
        iniciarAsistenteMaria();
        reanudarReconocimiento(0);
      }
    });
    el.id = 'maria-voice-status';
    el.dataset.state = 'inactivo';
    el.innerHTML = '<span class="maria-dot"></span><span class="maria-label">María · iniciando</span>';
    document.body.appendChild(el);
    MARIA.ui = el;
  }

  function actualizarUI(estado, texto = '') {
    if (!MARIA.ui) return;
    const etiquetas = {
      inactivo: 'María · inactiva',
      escuchando: 'María · escuchando',
      conversando: 'María · te escucha',
      hablando: 'María · respondiendo',
      error: 'María · voz no disponible'
    };
    MARIA.ui.dataset.state = estado;
    const label = MARIA.ui.querySelector('.maria-label');
    if (label) label.textContent = texto || etiquetas[estado] || 'María';
  }

  // Esperar onend evita mantener la captura activa al reproducir una respuesta.
  function detenerReconocimientoTemporalmente() {
    clearTimeout(MARIA.restartTimer);
    return new Promise(resolve => {
      if (!MARIA.recognition || (!MARIA.active && !MARIA.starting)) {
        resolve();
        return;
      }
      MARIA.releaseAudio = resolve;
      try { MARIA.recognition.abort(); } catch (_) { resolve(); }
    });
  }

  function reanudarReconocimiento(delay = 350) {
    clearTimeout(MARIA.restartTimer);
    if (!MARIA.listening || MARIA.blocked || MARIA.suspended || document.hidden || MARIA.speaking) return;
    MARIA.restartTimer = setTimeout(() => {
      if (!MARIA.listening || MARIA.blocked || MARIA.suspended || document.hidden || MARIA.speaking || MARIA.active || MARIA.starting) return;
      if (!MARIA.recognition) iniciarAsistenteMaria();
      if (!MARIA.recognition) return;
      try {
        MARIA.starting = true;
        MARIA.recognition.start();
      } catch (error) {
        MARIA.starting = false;
        actualizarUI('error', 'María · toca para reactivar');
        MARIA.listening = false;
      }
    }, delay);
  }

  function suspenderVoz() {
    MARIA.suspended = true;
    MARIA.speechId++;
    clearTimeout(MARIA.restartTimer);
    clearTimeout(MARIA.speechTimer);
    MARIA.speaking = false;
    MARIA.conversationUntil = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const old = MARIA.recognition;
    MARIA.recognition = null;
    MARIA.active = MARIA.starting = false;
    if (MARIA.releaseAudio) { MARIA.releaseAudio(); MARIA.releaseAudio = null; }
    if (old) {
      old.onresult = old.onend = old.onerror = old.onstart = null;
      try { old.abort(); } catch (_) {}
    }
    actualizarUI('inactivo', 'María · en pausa');
  }

  function recuperarVoz() {
    if (document.hidden || !MARIA.suspended) return;
    MARIA.suspended = false;
    if (!MARIA.listening || MARIA.blocked) return;
    iniciarAsistenteMaria();
    reanudarReconocimiento(300);
  }

  async function hablarRespuesta(mensaje, opciones = {}) {
    const texto = String(mensaje || '').trim();
    if (!texto || document.hidden || MARIA.suspended || !('speechSynthesis' in window)) return;
    if (opciones.contexto) MARIA.lastContext = opciones.contexto;
    const id = ++MARIA.speechId;
    clearTimeout(MARIA.speechTimer);
    MARIA.speaking = true;
    window.speechSynthesis.cancel();
    actualizarUI('hablando');
    // Una captura que no termina no debe bloquear el asistente indefinidamente.
    let releaseTimeout;
    await Promise.race([
      detenerReconocimientoTemporalmente(),
      new Promise(resolve => { releaseTimeout = setTimeout(resolve, 1500); })
    ]);
    clearTimeout(releaseTimeout);
    if (id !== MARIA.speechId || document.hidden) return;
    if (MARIA.active || MARIA.starting) {
      suspenderVoz();
      actualizarUI('error', 'María · toca para reactivar');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-CL';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    const finish = (error) => {
      if (id !== MARIA.speechId) return;
      clearTimeout(MARIA.speechTimer);
      MARIA.speaking = false;
      if (opciones.seguir !== false) abrirConversacion(opciones.ms || MARIA.conversationMs);
      actualizarUI(error ? 'error' : (MARIA.listening ? 'escuchando' : 'inactivo'),
        error ? 'María · toca para reactivar' : '');
      // Deja que el móvil libere la salida antes de volver a capturar audio.
      reanudarReconocimiento(900);
    };
    utterance.onend = () => finish(false);
    utterance.onerror = () => finish(true);
    MARIA.speechTimer = setTimeout(() => {
      if (id !== MARIA.speechId) return;
      window.speechSynthesis.cancel();
      finish(true);
    }, Math.max(30000, texto.length * 150));
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    } catch (_) { finish(true); }
  }

  // Exponemos la función porque el código anterior ya la utilizaba.
  window.hablarRespuesta = hablarRespuesta;

  function getDB() {
    // `db` se declara con `const` en cada HTML, por eso no necesariamente existe como window.db.
    try { if (typeof db !== 'undefined' && db) return db; } catch (_) {}
    return (typeof window.db !== 'undefined' && window.db) ? window.db : null;
  }

  async function leerRuta(ruta) {
    const db = getDB();
    if (!db) throw new Error('Firebase todavía no está disponible');
    const snap = await db.ref(ruta).once('value');
    return snap.val();
  }

  async function obtenerRiego() {
    const data = await leerRuta('modulo_riego');
    const zones = Array.isArray(data?.zones) ? data.zones : [];
    return {
      zones,
      estado: data?.estado_riego || {},
      comando: data?.comando || null
    };
  }

  function valvulaZona(z, idx) {
    const n = Number(z?.config?.valvula);
    if (Number.isInteger(n) && n >= 1 && n <= 8) return n;
    const s = Number(z?.config?.sector);
    if (Number.isInteger(s) && s >= 0 && s <= 7) return s + 1;
    return idx + 1 <= 8 ? idx + 1 : null;
  }

  function nombreZona(z, idx) {
    return (z?.name || '').trim() || `Sector ${valvulaZona(z, idx) || idx + 1}`;
  }

  function buscarZona(zones, texto) {
    const t = normalizar(texto);

    // Primero intentamos por nombre real del sector.
    let mejor = null;
    zones.forEach((z, idx) => {
      const nombre = normalizar(nombreZona(z, idx));
      if (nombre && t.includes(nombre)) mejor = { z, idx };
    });
    if (mejor) return mejor;

    // Luego por "sector 3", "zona 3" o "válvula 3".
    const m = t.match(/(?:sector|zona|valvula|electrovalvula)\s*(?:numero\s*)?(\d{1,2})/);
    if (m) {
      const n = Number(m[1]);
      const idx = zones.findIndex((z, i) => valvulaZona(z, i) === n);
      if (idx >= 0) return { z: zones[idx], idx };
      if (n >= 1 && n <= zones.length) return { z: zones[n - 1], idx: n - 1 };
    }
    return null;
  }

  function diasZona(z) {
    return Array.isArray(z?.config?.dias) ? z.config.dias.map(String) : [];
  }

  function nombresDias(ids) {
    const ordenados = [...new Set(ids.map(String))].sort((a, b) => Number(a) - Number(b));
    if (!ordenados.length) return 'ningún día';
    return ordenados.map(id => DIAS.find(d => d.id === id)?.largo || id).join(', ');
  }

  function detectarDia(texto) {
    const t = normalizar(texto);
    const diasTxt = [
      ['domingo','0'], ['lunes','1'], ['martes','2'], ['miercoles','3'],
      ['jueves','4'], ['viernes','5'], ['sabado','6']
    ];
    for (const [nombre, id] of diasTxt) if (t.includes(nombre)) return id;

    if (t.includes('hoy')) return String(new Date().getDay());
    if (t.includes('manana')) return String((new Date().getDay() + 1) % 7);
    return null;
  }

  function resumenSector(z, idx) {
    const nombre = nombreZona(z, idx);
    const dias = diasZona(z);
    const hora = z?.config?.hora;
    const dur = Number(z?.config?.duracion);
    const asp = Number(z?.config?.aspersores);
    const v = valvulaZona(z, idx);

    let r = `${nombre}`;
    if (v) r += `, válvula ${v}`;
    if (dias.length) r += `, riega ${nombresDias(dias)}`;
    else r += ', no tiene días programados';
    if (hora) r += ` a las ${hora}`;
    if (Number.isFinite(dur) && dur > 0) r += ` durante ${dur} minutos`;
    if (Number.isFinite(asp) && asp > 0) r += `, con ${asp} aspersor${asp === 1 ? '' : 'es'}`;
    return r;
  }

  function programacionValida(z) {
    return diasZona(z).length > 0 && !!z?.config?.hora && Number(z?.config?.duracion) > 0;
  }

  async function responderRiego(texto) {
    const t = normalizar(texto);
    const { zones, estado } = await obtenerRiego();

    if (!zones.length) {
      hablarRespuesta('Todavía no hay sectores de riego creados en el sistema.', { contexto: { tipo: 'riego' } });
      return true;
    }

    // Estado actual del riego.
    if (contiene(t, ['esta regando', 'se esta regando', 'riego ahora', 'riego activo', 'estado del riego', 'que esta regando'])) {
      if (estado?.regando || estado?.pausa) {
        const sector = Number(estado.sector);
        const idx = zones.findIndex((z, i) => valvulaZona(z, i) === sector + 1);
        const nombre = idx >= 0 ? nombreZona(zones[idx], idx) : `válvula ${sector + 1}`;
        if (estado.regando) hablarRespuesta(`Sí. Ahora se está regando ${nombre}${estado.modo === 'manual' ? ' en modo manual' : ''}.`, { contexto: { tipo: 'riego', zonaIdx: idx } });
        else hablarRespuesta(`El riego está pausado en ${nombre}.`, { contexto: { tipo: 'riego', zonaIdx: idx } });
      } else {
        hablarRespuesta('Ahora mismo el riego está inactivo.', { contexto: { tipo: 'riego' } });
      }
      return true;
    }

    // Sectores que faltan configurar/programar.
    if (contiene(t, ['falta programar', 'sin programar', 'faltan sectores', 'sector falta', 'sectores faltan', 'incompleto', 'configurar algun sector'])) {
      const sinPrograma = zones.map((z, idx) => ({ z, idx })).filter(({ z }) => !programacionValida(z));
      const usadas = zones.map((z, idx) => valvulaZona(z, idx)).filter(Boolean);
      const valvulasFaltantes = Array.from({ length: 8 }, (_, i) => i + 1).filter(v => !usadas.includes(v));

      let partes = [];
      if (sinPrograma.length) partes.push(`sin programación completa están ${sinPrograma.map(x => nombreZona(x.z, x.idx)).join(', ')}`);
      else partes.push('todos los sectores creados tienen días, hora y duración');

      if (valvulasFaltantes.length) partes.push(`y no hay un sector creado para ${valvulasFaltantes.length === 1 ? 'la válvula' : 'las válvulas'} ${valvulasFaltantes.join(', ')}`);
      else partes.push('y las 8 válvulas tienen sector asignado');

      hablarRespuesta(partes.join('; ') + '.', { contexto: { tipo: 'riego' } });
      return true;
    }

    // Días de la semana sin ningún riego programado.
    if (contiene(t, ['falta algun dia', 'dias sin riego', 'dia sin riego', 'que dias faltan', 'todos los dias', 'cobertura semanal'])) {
      const cubiertos = new Set(zones.flatMap(diasZona));
      const faltantes = DIAS.filter(d => !cubiertos.has(d.id));
      if (!faltantes.length) hablarRespuesta('Hay al menos un sector programado todos los días de la semana.', { contexto: { tipo: 'riego' } });
      else hablarRespuesta(`No hay ningún riego programado ${faltantes.map(d => d.largo).join(', ')}.`, { contexto: { tipo: 'riego' } });
      return true;
    }

    // Pregunta sobre un día concreto.
    const diaId = detectarDia(t);
    if (diaId !== null && contiene(t, ['riega', 'riego', 'sectores', 'programado', 'programacion', 'que toca'])) {
      const delDia = zones.map((z, idx) => ({ z, idx })).filter(({ z }) => diasZona(z).includes(diaId));
      const diaNombre = DIAS.find(d => d.id === diaId)?.largo || 'ese día';
      if (!delDia.length) {
        hablarRespuesta(`El ${diaNombre} no hay sectores programados para regar.`, { contexto: { tipo: 'riego', diaId } });
      } else {
        const detalle = delDia
          .sort((a, b) => String(a.z?.config?.hora || '').localeCompare(String(b.z?.config?.hora || '')))
          .map(({ z, idx }) => `${nombreZona(z, idx)} a las ${z.config.hora || 'hora no definida'}, ${z.config.duracion || '?'} minutos`)
          .join('; ');
        hablarRespuesta(`El ${diaNombre} está programado: ${detalle}.`, { contexto: { tipo: 'riego', diaId } });
      }
      return true;
    }

    // Pregunta sobre un sector concreto.
    const zona = buscarZona(zones, t) || (MARIA.lastContext?.tipo === 'riego' && Number.isInteger(MARIA.lastContext.zonaIdx) && contiene(t, ['y ese', 'ese sector', 'esa zona', 'y cuanto', 'y cuando'])
      ? { z: zones[MARIA.lastContext.zonaIdx], idx: MARIA.lastContext.zonaIdx }
      : null);

    if (zona && contiene(t, ['cuando', 'dias', 'riega', 'program', 'hora', 'duracion', 'aspersor', 'valvula', 'sector', 'zona'])) {
      hablarRespuesta(resumenSector(zona.z, zona.idx) + '.', { contexto: { tipo: 'riego', zonaIdx: zona.idx } });
      return true;
    }

    // Resumen semanal completo.
    if (contiene(t, ['programacion de riego', 'programacion semanal', 'como esta programado', 'como esta el riego', 'que dias se riega', 'resumen del riego', 'riego de la semana'])) {
      const lineas = DIAS.map(d => {
        const zs = zones.map((z, idx) => ({ z, idx })).filter(({ z }) => diasZona(z).includes(d.id));
        if (!zs.length) return `${d.largo}: sin riego`;
        return `${d.largo}: ${zs.map(({ z, idx }) => `${nombreZona(z, idx)} ${z.config?.hora || ''}`.trim()).join(', ')}`;
      });
      hablarRespuesta(`La semana está así. ${lineas.join('. ')}.`, { contexto: { tipo: 'riego' }, ms: 25000 });
      return true;
    }

    // Listado de sectores.
    if (contiene(t, ['cuantos sectores', 'que sectores', 'lista de sectores', 'sectores tengo'])) {
      hablarRespuesta(`Tienes ${zones.length} sector${zones.length === 1 ? '' : 'es'}: ${zones.map((z, idx) => nombreZona(z, idx)).join(', ')}.`, { contexto: { tipo: 'riego' } });
      return true;
    }

    // Próximo riego calculado desde la programación semanal.
    if (contiene(t, ['proximo riego', 'cuando riega de nuevo', 'cuando toca regar', 'siguiente riego'])) {
      const now = new Date();
      let candidatos = [];
      for (let offset = 0; offset < 8; offset++) {
        const d = new Date(now);
        d.setDate(now.getDate() + offset);
        const dow = String(d.getDay());
        zones.forEach((z, idx) => {
          if (!diasZona(z).includes(dow) || !z?.config?.hora) return;
          const [hh, mm] = z.config.hora.split(':').map(Number);
          const fecha = new Date(d);
          fecha.setHours(hh || 0, mm || 0, 0, 0);
          if (fecha > now) candidatos.push({ fecha, z, idx });
        });
      }
      candidatos.sort((a, b) => a.fecha - b.fecha);
      if (!candidatos.length) hablarRespuesta('No encontré un próximo riego dentro de los siguientes siete días.', { contexto: { tipo: 'riego' } });
      else {
        const c = candidatos[0];
        const dia = c.fecha.toLocaleDateString('es-CL', { weekday: 'long' });
        hablarRespuesta(`El próximo riego es ${nombreZona(c.z, c.idx)}, el ${dia} a las ${c.z.config.hora}, durante ${c.z.config.duracion || '?'} minutos.`, { contexto: { tipo: 'riego', zonaIdx: c.idx } });
      }
      return true;
    }

    return false;
  }

  function weatherText(code) {
    const map = {
      0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
      45: 'con niebla', 48: 'con niebla escarchada', 51: 'con llovizna ligera', 53: 'con llovizna',
      55: 'con llovizna intensa', 61: 'con lluvia ligera', 63: 'con lluvia', 65: 'con lluvia intensa',
      71: 'con nieve ligera', 73: 'con nieve', 75: 'con nieve intensa', 80: 'con chubascos ligeros',
      81: 'con chubascos', 82: 'con chubascos fuertes', 95: 'con tormentas', 96: 'con tormentas y granizo', 99: 'con tormentas fuertes y granizo'
    };
    return map[Number(code)] || 'con condiciones variables';
  }

  function detectarLugar(texto) {
    const t = normalizar(texto);
    if (t.includes('santiago') || t.includes('ciudad')) return MARIA.lugares.ciudad;
    if (t.includes('pirque') || t.includes('comuna') || t.includes('parcela') || t.includes('casa')) return MARIA.lugares.comuna;
    if (MARIA.lastContext?.tipo === 'clima' && MARIA.lastContext.lugar) return MARIA.lastContext.lugar;
    return MARIA.lugares.comuna;
  }

  async function obtenerClima(lugar) {
    const key = `${lugar.nombre}`;
    const cache = MARIA.weatherCache.get(key);
    if (cache && Date.now() - cache.ts < 8 * 60 * 1000) return cache.data;

    const params = new URLSearchParams({
      latitude: lugar.lat,
      longitude: lugar.lon,
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
      timezone: 'America/Santiago',
      forecast_days: '4'
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) throw new Error('No se pudo consultar el clima');
    const data = await res.json();
    MARIA.weatherCache.set(key, { ts: Date.now(), data });
    return data;
  }

  async function responderClima(texto) {
    const t = normalizar(texto);
    if (!contiene(t, ['clima', 'tiempo', 'temperatura', 'llover', 'lluvia', 'frio', 'calor', 'pronostico'])) return false;

    const pideComuna = contiene(t, ['pirque', 'comuna', 'parcela', 'casa']);
    const pideCiudad = contiene(t, ['santiago', 'ciudad']);

    if (pideComuna && pideCiudad) {
      const [pirque, santiago] = await Promise.all([obtenerClima(MARIA.lugares.comuna), obtenerClima(MARIA.lugares.ciudad)]);
      const quiereManana = t.includes('manana');
      const idx = quiereManana ? 1 : 0;
      const diaLabel = quiereManana ? 'mañana' : 'hoy';
      const fraseLugar = (lugar, data) => {
        const max = Math.round(data.daily?.temperature_2m_max?.[idx]);
        const min = Math.round(data.daily?.temperature_2m_min?.[idx]);
        const rain = Math.round(data.daily?.precipitation_probability_max?.[idx] ?? 0);
        return `${lugar.nombre}: ${weatherText(data.daily?.weather_code?.[idx])}, mínima ${min}, máxima ${max} grados y ${rain} por ciento de probabilidad de lluvia`;
      };
      hablarRespuesta(`${diaLabel.charAt(0).toUpperCase() + diaLabel.slice(1)}, ${fraseLugar(MARIA.lugares.comuna, pirque)}. En ${fraseLugar(MARIA.lugares.ciudad, santiago)}.`, { contexto: { tipo: 'clima', lugar: MARIA.lugares.comuna } });
      return true;
    }

    const lugar = detectarLugar(t);
    const data = await obtenerClima(lugar);
    const quiereManana = t.includes('manana');
    const idx = quiereManana ? 1 : 0;
    const diaLabel = quiereManana ? 'mañana' : 'hoy';

    const max = Math.round(data.daily?.temperature_2m_max?.[idx]);
    const min = Math.round(data.daily?.temperature_2m_min?.[idx]);
    const rainProb = Math.round(data.daily?.precipitation_probability_max?.[idx] ?? 0);
    const rainMm = Number(data.daily?.precipitation_sum?.[idx] ?? 0);
    const code = data.daily?.weather_code?.[idx];

    let respuesta = `En ${lugar.nombre}, ${diaLabel} estará ${weatherText(code)}, con mínima de ${min} y máxima de ${max} grados. La probabilidad máxima de lluvia es ${rainProb} por ciento`;
    if (rainMm > 0) respuesta += `, con cerca de ${rainMm.toFixed(1).replace('.', ',')} milímetros esperados`;
    respuesta += '.';

    if (!quiereManana && data.current) {
      const actual = Math.round(data.current.temperature_2m);
      const sens = Math.round(data.current.apparent_temperature);
      respuesta += ` Ahora hay ${actual} grados y la sensación es de ${sens}.`;
    }

    hablarRespuesta(respuesta, { contexto: { tipo: 'clima', lugar } });
    return true;
  }

  async function responderPorton(texto) {
    const t = normalizar(texto);

    // Acción: abrir portón. Requiere verbo de acción + referencia clara al portón.
    const quiereAbrir = contiene(t, ['abre', 'abrir', 'abreme', 'abrele', 'abramos']);
    const mencionaPorton = contiene(t, ['porton', 'reja', 'entrada', 'acceso']);
    if (quiereAbrir && mencionaPorton) {
      if (typeof window.abrirPortonAnimado === 'function') {
        window.abrirPortonAnimado();
      } else if (typeof window.abrirPorton === 'function') {
        window.abrirPorton();
      } else {
        const db = getDB();
        if (!db) throw new Error('Firebase no disponible');
        await db.ref('estado_porton').update({
          comando: 'abrir_' + Date.now(),
          timestamp: (window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now())
        });
      }
      hablarRespuesta('Abriendo el portón.', { contexto: { tipo: 'porton' } });
      return true;
    }

    if (mencionaPorton && contiene(t, ['estado', 'conexion', 'conectado', 'en linea', 'funcionando'])) {
      const data = await leerRuta('estado_porton');
      const ultimo = Number(data?.ultima_conexion || 0);
      const ts = ultimo < 10000000000 ? ultimo * 1000 : ultimo;
      const online = ts > 0 && (Date.now() - ts) / 1000 <= 35;
      hablarRespuesta(online ? 'El controlador del portón está en línea.' : 'El controlador del portón aparece sin conexión.', { contexto: { tipo: 'porton' } });
      return true;
    }

    return false;
  }

  async function ejecutarRiegoManual(texto) {
    const t = normalizar(texto);
    const { zones } = await obtenerRiego();

    // Detener / pausar / continuar son acciones explícitas.
    if (contiene(t, ['deten el riego', 'detener el riego', 'para el riego', 'parar el riego', 'deten todo el riego'])) {
      const db = getDB();
      await db.ref('modulo_riego/comando').set({ accion: 'detener', timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now() });
      hablarRespuesta('Deteniendo todo el riego.', { contexto: { tipo: 'riego' } });
      return true;
    }
    if (contiene(t, ['pausa el riego', 'pausar el riego'])) {
      const db = getDB();
      await db.ref('modulo_riego/comando').set({ accion: 'pausar', timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now() });
      hablarRespuesta('Pausando el riego.', { contexto: { tipo: 'riego' } });
      return true;
    }
    if (contiene(t, ['continua el riego', 'reanuda el riego', 'seguir regando', 'continua regando'])) {
      const db = getDB();
      await db.ref('modulo_riego/comando').set({ accion: 'continuar', timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now() });
      hablarRespuesta('Continuando el riego.', { contexto: { tipo: 'riego' } });
      return true;
    }

    const accionRiego = contiene(t, ['riega ', 'regar ', 'inicia riego', 'iniciar riego', 'enciende el riego']);
    if (!accionRiego) return false;

    const zona = buscarZona(zones, t);
    if (!zona) {
      hablarRespuesta('Entendí que quieres iniciar riego, pero no pude identificar el sector. Dime, por ejemplo, riega sector 3 por diez minutos.', { contexto: { tipo: 'riego' } });
      return true;
    }

    let minutos = null;
    let m = t.match(/(?:por|durante)\s+(\d{1,3})\s*(?:minuto|minutos|min)?/);
    if (m) minutos = Number(m[1]);
    if (!minutos) {
      const palabras = { uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, quince:15, veinte:20, treinta:30, cuarenta:40, sesenta:60 };
      for (const [p, n] of Object.entries(palabras)) {
        if (t.includes(`por ${p} minuto`) || t.includes(`durante ${p} minuto`)) { minutos = n; break; }
      }
    }
    if (!minutos) minutos = Number(zona.z?.config?.duracion) || 10;
    minutos = Math.max(1, Math.min(120, minutos));

    const sector = (valvulaZona(zona.z, zona.idx) || zona.idx + 1) - 1;
    const db = getDB();
    await db.ref('modulo_riego/comando').set({
      accion: 'manual', sector, minutos,
      timestamp: window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now()
    });
    hablarRespuesta(`Iniciando ${nombreZona(zona.z, zona.idx)} por ${minutos} minutos.`, { contexto: { tipo: 'riego', zonaIdx: zona.idx } });
    return true;
  }

  function responderNavegacion(texto) {
    const t = normalizar(texto);
    if (!contiene(t, ['abre modulo', 'ir a', 'anda a', 'muestrame', 'abre la pagina', 'lleva al'])) return false;

    if (t.includes('riego')) {
      hablarRespuesta('Abriendo el módulo de riego.', { seguir: false });
      setTimeout(() => { window.location.href = 'admin_riego.html'; }, 950);
      return true;
    }
    if (t.includes('porton')) {
      hablarRespuesta('Abriendo el módulo del portón.', { seguir: false });
      setTimeout(() => { window.location.href = 'admin_porton.html'; }, 950);
      return true;
    }
    if (contiene(t, ['inicio', 'principal'])) {
      hablarRespuesta('Volviendo al inicio.', { seguir: false });
      setTimeout(() => { window.location.href = 'admin_inicio.html'; }, 950);
      return true;
    }
    return false;
  }

  function responderAyuda(texto) {
    const t = normalizar(texto);
    if (!contiene(t, ['que puedes hacer', 'que sabes hacer', 'ayuda', 'comandos', 'que te puedo preguntar'])) return false;
    hablarRespuesta('Puedes preguntarme por la programación semanal del riego, qué sectores riegan un día, qué sector falta programar, qué días están vacíos, cuándo es el próximo riego, qué está regando ahora, el clima en Pirque o Santiago, el estado del portón, y también puedes pedirme abrir el portón o iniciar, pausar, continuar y detener el riego.', { contexto: { tipo: 'ayuda' }, ms: 28000 });
    return true;
  }

  async function procesarComandoVoz(textoOriginal) {
    const t = normalizar(textoOriginal)
      .replace(/\b(maria|maría)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!t) {
      hablarRespuesta('Sí, te escucho.', { contexto: MARIA.lastContext || { tipo: 'general' } });
      return;
    }

    console.log('María procesa:', t);

    try {
      // Los comandos críticos más simples siguen locales: son rápidos y funcionan
      // incluso si el servicio de IA no está disponible.
      if (await responderPorton(t)) return;
      if (await ejecutarRiegoManual(t)) return;

      // Para todo lo demás, María IA entiende lenguaje natural y decide qué
      // herramientas consultar. Esto evita mantener cientos de frases exactas.
      if (window.MariaAI?.disponible?.()) {
        actualizarUI('hablando', 'María · pensando');
        const respuestaIA = await window.MariaAI.procesar(t);
        hablarRespuesta(respuestaIA, { contexto: { tipo: 'ia' }, ms: 28000 });
        return;
      }

      // Modo de respaldo mientras el Worker todavía no haya sido configurado.
      if (responderAyuda(t)) return;
      if (responderNavegacion(t)) return;
      if (await responderClima(t)) return;
      if (await responderRiego(t)) return;

      hablarRespuesta('La inteligencia artificial todavía no está conectada. Puedo seguir usando las funciones locales de riego, clima y portón.', { contexto: MARIA.lastContext });
    } catch (err) {
      console.error('Error procesando voz:', err);
      hablarRespuesta('Tuve un problema al consultar el sistema. Revisa la conexión e inténtalo de nuevo.', { contexto: MARIA.lastContext });
    }
  }

  window.procesarComandoVoz = procesarComandoVoz;

  function iniciarAsistenteMaria() {
    crearUI();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Este navegador no soporta reconocimiento de voz nativo. Usa Google Chrome o Edge.');
      actualizarUI('error', 'María · navegador sin voz');
      return;
    }

    if (MARIA.recognition || !MARIA.listening || document.hidden || MARIA.suspended || MARIA.blocked) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    MARIA.recognition = recognition;

    recognition.onstart = () => {
      MARIA.starting = false;
      MARIA.active = true;
      actualizarUI('escuchando');
    };
    recognition.onresult = (event) => {
      if (MARIA.speaking || MARIA.suspended || document.hidden || !MARIA.listening) return;
      const frase = event.results[event.results.length - 1][0].transcript.trim();
      const norm = normalizar(frase);
      const now = Date.now();

      // Evita procesar duplicados que algunos navegadores entregan al reiniciar.
      if (norm === MARIA.lastTranscript && now - MARIA.lastTranscriptAt < 1800) return;
      MARIA.lastTranscript = norm;
      MARIA.lastTranscriptAt = now;

      console.log('María escuchó:', frase);
      const invocada = /\b(maria|maría)\b/i.test(frase);

      if (invocada) {
        abrirConversacion();
        procesarComandoVoz(frase);
        return;
      }

      // Durante la ventana conversacional acepta preguntas de seguimiento
      // sin exigir nuevamente la palabra de activación.
      if (ahoraConversando()) {
        abrirConversacion();
        procesarComandoVoz(frase);
      }
    };

    recognition.onerror = (event) => {
      // no-speech y aborted son normales en escucha continua.
      if (!['no-speech', 'aborted'].includes(event.error)) {
        console.warn('Error de voz:', event.error);
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        MARIA.listening = false;
        MARIA.blocked = true;
        clearTimeout(MARIA.restartTimer);
        actualizarUI('error', 'María · toca para activar micrófono');
      }
    };

    recognition.onend = () => {
      MARIA.active = MARIA.starting = false;
      if (MARIA.releaseAudio) { MARIA.releaseAudio(); MARIA.releaseAudio = null; }
      if (MARIA.listening && !MARIA.speaking) reanudarReconocimiento(600);
    };

    MARIA.listening = true;
    reanudarReconocimiento(0);
  }

  window.iniciarAsistenteMaria = iniciarAsistenteMaria;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspenderVoz(); else recuperarVoz();
  });
  window.addEventListener('pagehide', suspenderVoz);
  window.addEventListener('pageshow', recuperarVoz);

  window.addEventListener('DOMContentLoaded', () => {
    crearUI();
    // Damos tiempo a que cada página inicialice Firebase y la autenticación.
    setTimeout(iniciarAsistenteMaria, 1800);
  });
})();
