# María IA — SmartHub Final

Esta carpeta ya está preparada para que **SmartHub siga alojado gratis en GitHub Pages**, pero María use Claude sin exponer la API key.

## Qué se agregó

- `maria-config.js`: URL pública del Worker (sin secretos).
- `maria-ai.js`: conversación con María y herramientas seguras de SmartHub.
- `voz.js`: conserva comandos críticos locales y deriva el resto a IA.
- `cloudflare-worker/`: backend mínimo que guarda la API key de Anthropic y valida la sesión Firebase.

## Arquitectura

`Micrófono -> voz.js -> maria-ai.js -> Cloudflare Worker -> Claude`

Cuando Claude necesita información o una acción:

`Claude -> tool_use -> maria-ai.js -> Firebase/Open-Meteo/SmartHub -> resultado -> Claude -> respuesta hablada`

La API key de Anthropic **nunca se descarga al navegador**.

---

## 1. Crear el Worker en Cloudflare

Necesitas Node.js instalado una sola vez para desplegarlo.

Abre una terminal dentro de:

```text
cloudflare-worker
```

Ejecuta:

```bash
npm install
npx wrangler login
```

Luego guarda tu API key de Anthropic como **Secret**:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Cloudflare te pedirá pegar el valor. La clave no queda dentro del proyecto ni de GitHub.

Despliega:

```bash
npm run deploy
```

Cloudflare mostrará una URL similar a:

```text
https://smarthub-maria-ai.TU-SUBDOMINIO.workers.dev
```

## 2. Poner la URL del Worker en la PWA

Abre `maria-config.js` y cambia:

```javascript
endpoint: 'https://REEMPLAZAR-CON-TU-WORKER.workers.dev/chat'
```

por tu URL real agregando `/chat`, por ejemplo:

```javascript
endpoint: 'https://smarthub-maria-ai.TU-SUBDOMINIO.workers.dev/chat'
```

Luego sube los archivos de SmartHub a GitHub Pages como haces normalmente.

## 3. Seguridad ya incorporada

El Worker acepta solicitudes solamente desde:

```text
https://pirqueporton-byte.github.io
```

Y además exige un **Firebase ID token válido** y permite actualmente solo el correo:

```text
pirqueporton@gmail.com
```

Por eso copiar la URL del Worker no basta para gastar tu saldo de Anthropic.

Si el dominio o correo cambian, edita `cloudflare-worker/wrangler.jsonc`.

## 4. Modelo de IA

Está configurado inicialmente con:

```text
claude-sonnet-5
```

Puedes cambiar `ANTHROPIC_MODEL` en `wrangler.jsonc` si prefieres otro modelo disponible en tu cuenta.

## 5. Qué puede hacer María IA ahora

### Consultar riego

Ejemplos naturales, sin frases exactas:

- “María, ¿cómo está organizado el riego esta semana?”
- “¿Hay algún sector que se me haya olvidado programar?”
- “¿Qué día estoy regando más tiempo?”
- “¿Hay sectores que choquen por horario?”
- “¿Cuánto riego total tengo programado para el fin de semana?”
- “¿Qué se riega mañana?”
- “¿Y de esos cuál dura más?”

### Combinar riego + clima

- “María, revisa el riego de mañana y dime si tiene sentido considerando el clima de Pirque.”
- “¿Va a llover alguno de los días que tengo más riego?”
- “Compara el clima de Pirque con Santiago.”

### Portón

- “¿Está conectado el portón?”
- “Abre el portón.”

La apertura sigue disponible también como comando local rápido.

### Riego físico

- “Riega el sector delantero por 15 minutos.”
- “Pausa el riego.”
- “Continúa.”
- “Detén todo el riego.”

Los comandos críticos simples permanecen locales, por lo que no dependen de Claude.

### Cambiar programación

Ejemplo:

- “Cambia el sector 3 para que riegue martes y viernes a las 7:30 durante 12 minutos.”

Antes de escribir en Firebase, SmartHub muestra una ventana de confirmación con el cambio propuesto.

## 6. Cómo agregar módulos futuros

Para estanque, luces, cámaras, cortinas, bombas, sensores, etc., no necesitas crear cientos de comandos de voz. Se agrega una nueva herramienta a `maria-ai.js` y se describe en `cloudflare-worker/src/index.js`.

Claude decide cuándo usarla según lo que diga el usuario.

## Importante

No pongas `ANTHROPIC_API_KEY` en `maria-config.js`, `maria-ai.js`, HTML, Firebase ni ningún archivo que publiques en GitHub Pages. Solo debe existir como **Cloudflare Worker Secret**.

## Chat flotante de María

La integración incluye `maria-chat.js`. Se carga en `admin_inicio.html`, `admin_porton.html` y `admin_riego.html` y muestra un botón flotante de IA. El chat usa exactamente `window.MariaAI.procesar(...)`, por lo que comparte contexto y herramientas con la voz.

No requiere ninguna API key adicional. La API key de Anthropic permanece exclusivamente en el Secret `ANTHROPIC_API_KEY` del Cloudflare Worker.
