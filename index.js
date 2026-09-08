const TOOLS = [
  {
    name: 'consultar_riego',
    description: 'Consulta la programación completa y el estado actual del sistema de riego. Úsala para preguntas sobre días, sectores, horarios, duración, sectores sin programar, conflictos, próximo riego, riego activo, cobertura semanal y análisis/recomendaciones.',
    input_schema: { type:'object', properties:{}, additionalProperties:false }
  },
  {
    name: 'consultar_porton',
    description: 'Consulta si el controlador del portón está conectado y su estado conocido. Úsala antes de afirmar algo sobre el estado real del portón.',
    input_schema: { type:'object', properties:{}, additionalProperties:false }
  },
  {
    name: 'consultar_clima',
    description: 'Consulta clima y pronóstico real con Open-Meteo. Pirque corresponde a la comuna/terreno y Santiago a la ciudad. Puede consultarse más de un lugar si la pregunta lo requiere.',
    input_schema: {
      type:'object',
      properties:{
        lugar:{ type:'string', enum:['pirque','santiago','comuna','ciudad'] },
        dias:{ type:'integer', minimum:1, maximum:7 }
      }, required:['lugar'], additionalProperties:false
    }
  },
  {
    name: 'abrir_porton',
    description: 'Abre físicamente el portón. Úsala SOLO cuando el usuario pida de forma explícita abrir el portón, acceso, entrada o reja. Nunca la uses por inferencia, sugerencia o como parte de una explicación.',
    input_schema: { type:'object', properties:{}, additionalProperties:false }
  },
  {
    name: 'controlar_riego',
    description: 'Ejecuta acciones físicas del riego: detener, pausar, continuar o iniciar manualmente un sector. Para manual identifica válvula/sector y duración. Úsala SOLO si el usuario pide explícitamente ejecutar la acción.',
    input_schema: {
      type:'object',
      properties:{
        accion:{ type:'string', enum:['detener','pausar','continuar','manual'] },
        valvula:{ type:'integer', minimum:1, maximum:8 },
        sector:{ type:'string' },
        minutos:{ type:'integer', minimum:1, maximum:120 }
      }, required:['accion'], additionalProperties:false
    }
  },
  {
    name: 'actualizar_programacion_riego',
    description: 'Cambia días, hora o duración de un sector. Úsala solamente si el usuario pide explícitamente modificar/programar un sector. El navegador solicitará confirmación humana antes de guardar.',
    input_schema: {
      type:'object',
      properties:{
        valvula:{ type:'integer', minimum:1, maximum:8 },
        sector:{ type:'string' },
        dias:{ type:'array', items:{ type:'string', enum:['0','1','2','3','4','5','6'] } },
        hora:{ type:'string', pattern:'^([01]\\d|2[0-3]):[0-5]\\d$' },
        duracion_min:{ type:'integer', minimum:1, maximum:120 }
      }, additionalProperties:false
    }
  },
  {
    name: 'navegar_modulo',
    description: 'Abre una pantalla de SmartHub cuando el usuario pide ir o abrir un módulo.',
    input_schema: {
      type:'object', properties:{ modulo:{ type:'string', enum:['inicio','riego','porton'] } }, required:['modulo'], additionalProperties:false
    }
  }
];

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || (env.ALLOW_LOCALHOST === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

async function validarFirebase(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return { ok:false, error:'Falta autenticación.' };
  const idToken = auth.slice(7).trim();
  if (!idToken) return { ok:false, error:'Token vacío.' };

  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idToken })
  });
  if (!r.ok) return { ok:false, error:'Sesión Firebase inválida o vencida.' };
  const data = await r.json();
  const user = data.users?.[0];
  if (!user?.email) return { ok:false, error:'Usuario Firebase no válido.' };
  const allowed = String(env.ALLOWED_EMAILS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email).toLowerCase())) return { ok:false, error:'Usuario sin permiso para María IA.' };
  return { ok:true, user:{ email:user.email, uid:user.localId } };
}

function limpiarMensajes(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-16).map(m => ({ role:m.role, content:m.content })).filter(m => ['user','assistant'].includes(m.role));
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
    if (request.method !== 'POST') return Response.json({ error:'Método no permitido.' }, { status:405, headers:cors });

    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
    const originOk = allowed.includes(origin) || (env.ALLOW_LOCALHOST === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    if (!originOk) return Response.json({ error:'Origen no permitido.' }, { status:403, headers:cors });

    try {
      const auth = await validarFirebase(request, env);
      if (!auth.ok) return Response.json({ error:auth.error }, { status:401, headers:cors });

      const body = await request.json();
      const messages = limpiarMensajes(body.messages);
      if (!messages.length) return Response.json({ error:'No hay mensaje para procesar.' }, { status:400, headers:cors });
      if (JSON.stringify(messages).length > 90000) return Response.json({ error:'Conversación demasiado grande.' }, { status:413, headers:cors });

      const fecha = new Intl.DateTimeFormat('es-CL', { timeZone:'America/Santiago', dateStyle:'full', timeStyle:'short' }).format(new Date());
      const system = `Eres María, el asistente inteligente de SmartHub, una PWA doméstica ubicada en Pirque, Chile. Fecha y hora local: ${fecha}.

Tu función es conversar naturalmente en español de Chile y ayudar con los módulos reales de SmartHub. Actualmente tienes herramientas para riego, portón, clima y navegación.

REGLAS IMPORTANTES:
- No inventes estados, programaciones, clima ni resultados. Si una respuesta depende de datos reales, usa la herramienta correspondiente.
- Entiende lenguaje natural y contexto; el usuario no debe memorizar comandos exactos.
- Para riego puedes analizar programación, detectar sectores incompletos, días sin riego, solapamientos, carga semanal, diferencias de duración y combinar esos datos con clima cuando sea útil.
- Los códigos de día del riego son 0 domingo, 1 lunes, 2 martes, 3 miércoles, 4 jueves, 5 viernes, 6 sábado.
- Puedes hacer varias llamadas de herramientas para responder una sola pregunta.
- Acciones físicas o cambios: solo ejecuta una herramienta de escritura si el usuario lo pidió explícitamente. Nunca conviertas una pregunta, hipótesis o recomendación en una acción.
- Para modificar programación usa actualizar_programacion_riego; el navegador pedirá confirmación final.
- Si el usuario pide abrir el portón de forma explícita puedes usar abrir_porton.
- Sé breve y natural al hablar: normalmente 1 a 4 frases. Evita listas largas salvo que sean necesarias.
- Si algo todavía no existe como herramienta, dilo claramente y explica qué módulo faltaría integrar, sin fingir que lo hiciste.
- Cuando compares Pirque con “la ciudad”, interpreta ciudad como Santiago.`;

      const ai = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version':'2023-06-01'
        },
        body:JSON.stringify({
          model: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
          max_tokens: 700,
          system,
          tools: TOOLS,
          messages
        })
      });

      const result = await ai.json();
      if (!ai.ok) {
        console.error('Anthropic error', result);
        return Response.json({ error:result?.error?.message || 'Error consultando Claude.' }, { status:502, headers:cors });
      }
      return Response.json({ content:result.content, stop_reason:result.stop_reason, usage:result.usage }, { headers:cors });
    } catch (err) {
      console.error(err);
      return Response.json({ error:'Error interno de María IA.' }, { status:500, headers:cors });
    }
  }
};
