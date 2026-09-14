# Activación inicial de Siri para la PWA

Esta versión cambia la configuración del HTML. No requiere instalar ni actualizar la APK.

## Qué está preparado y qué falta

La página `siri.html` gestiona códigos temporales, muestra dispositivos vinculados y permite desvincularlos. El Worker incluye la API nueva y conserva `/abrir` y `/verificar` para los atajos antiguos. Hasta completar Cloudflare y publicar el enlace del atajo, la página muestra **En preparación**; no entrega códigos inutilizables.

El enlace de iCloud debe crearlo el propietario desde Atajos en un iPhone o Mac. No existe todavía un enlace compartido para este proyecto. Un archivo de texto o un enlace inventado no sustituye ese paso. La prueba con el iPhone bloqueado también está pendiente.

## 1. Cloudflare, una sola vez y desde el navegador

1. En **Storage & databases → D1**, crea la base `smarthub-siri-links` en tu cuenta actual. En la consola SQL de esa base, ejecuta el contenido de [schema.sql](schema.sql). La estructura se puede volver a ejecutar sin borrar vinculaciones.
2. Abre el Worker existente **smarthub-siri**. En **Bindings → Add binding → D1 database**, usa el nombre de variable **SIRI_DB** y elige esa base.
3. En **Settings → Variables and Secrets**, añade un secreto **SIRI_ENCRYPTION_KEY**: una clave aleatoria de 64 caracteres hexadecimales (32 bytes), creada con un generador criptográfico o gestor de contraseñas. No uses una contraseña escrita a mano. No la pegues en el chat ni en GitHub. Guarda una copia segura: cambiarla invalida las sesiones cifradas anteriores.
4. En **Edit code**, reemplaza el código por [worker.mjs](worker.mjs) y despliega. Es un único archivo sin importaciones locales. Conserva los secretos `SIRI_TOKEN` y `FIREBASE_REFRESH_TOKEN` si aún utilizas el atajo antiguo; la nueva vinculación no los necesita.
5. Cuando tengas el atajo del apartado siguiente, crea la variable de texto **SIRI_SHORTCUT_URL** con su enlace `https://www.icloud.com/shortcuts/…`. Guarda y despliega.
6. Abre la PWA → **Conectar con Siri**. Pulsa **Volver a comprobar**. Debe mostrar **Añadir atajo** y **Generar código**.

No es necesario cambiar las reglas de Firebase ni hacer pública su base. Los datos de las sesiones se cifran antes de guardarse en D1; los códigos y credenciales se guardan como hashes. Cada petición de apertura vuelve a verificar la cuenta y sus permisos en Firebase. Cada vinculación dura 180 días y después requiere volver a vincularse.

D1 está incluido en Workers Free dentro de sus límites. En el plan Free, alcanzar el límite interrumpe las consultas; no es necesario contratar un plan de pago para esta prueba. [Precios oficiales](https://developers.cloudflare.com/d1/platform/pricing/).

## 2. Crear el atajo compartido una sola vez

Desde Atajos en un iPhone o Mac, crea **Abre el portón**. Los nombres de las acciones pueden variar con la versión/idioma. Debe tener estos dos caminos. Después lo compartirás por iCloud para que los demás solo lo añadan.

### Leer la vinculación guardada

1. **Obtener archivo de la carpeta**: carpeta Atajos de iCloud Drive, ruta `SmartHub-Siri.json`. Desactiva el selector de documentos y el error si el archivo no existe. La primera vez no habrá archivo.
2. **Si** el archivo tiene algún valor: obtener el diccionario del archivo y su campo `credential`. Si no existe, seguir el camino de vinculación.

### Primera ejecución: vincular, sin abrir

3. **Solicitar entrada**, tipo Texto: «Pega el código que generaste en SmartHub → Conectar con Siri».
4. **Obtener contenido de URL**: `https://smarthub-siri.pirqueporton.workers.dev/v1/pair/redeem`, método **POST**, cuerpo **JSON**, campo de texto `code` = entrada anterior. No añadir cabecera Authorization aquí.
5. Obtener el diccionario de la respuesta. **Si `ok` es verdadero**, guardar la respuesta como `SmartHub-Siri.json` en la misma carpeta de Atajos, con **Preguntar dónde guardar** desactivado y **Sobrescribir** activado. Se recomienda usar **Obtener texto de la entrada** y **Definir nombre** antes de **Guardar archivo** para conservar JSON válido.
6. Obtener únicamente el campo `mensaje` de la respuesta y usar **Leer texto**. No leer ni mostrar toda la respuesta: contiene la credencial privada del iPhone.
7. **Detener este atajo** tanto si la vinculación funcionó como si falló. Nunca continuar a la apertura en esta ejecución. Si falló, no guardar ningún archivo.

### Ejecuciones posteriores: abrir

8. Si ya existe `credential`, **Obtener contenido de URL**: `https://smarthub-siri.pirqueporton.workers.dev/v1/open`, método **POST**. Cabecera `Authorization`: texto `Bearer ` seguido de la variable `credential`. Cuerpo **JSON**: campo de texto `accion` = `abrir`.
9. Obtener únicamente el campo `mensaje` y usar **Leer texto**. No añadir reintentos, repeticiones ni acciones Abrir app/Abrir URL. Una respuesta incierta debe revisarse antes de pedir otra apertura.

Para comprobar el transporte sin abrir durante el desarrollo, sustituye temporalmente `/v1/open` por `/v1/verify`. Esa ruta nunca escribe órdenes. Solo vuelve a `/v1/open` cuando estés preparado para probar una apertura real con supervisión del propietario.

Si necesitas volver a vincular ese iPhone, elimina `SmartHub-Siri.json` desde Archivos (y desvincula el acceso antiguo desde la PWA). Al siguiente uso, el atajo pedirá un nuevo código. La disponibilidad del archivo y la ejecución con la pantalla bloqueada deben comprobarse en el iPhone real; no se garantiza que todas las acciones funcionen bloqueadas.

### Compartir y conectar el botón de la PWA

10. Comprueba que el atajo no contiene códigos ni credenciales literales. Debe obtenerlos del código introducido o del archivo privado. Comparte el atajo → **Copiar enlace de iCloud**. El archivo privado no se comparte con el atajo. No adjuntes ese archivo ni pegues credenciales en el enlace.
11. Pega el enlace en `SIRI_SHORTCUT_URL` de Cloudflare. El botón **Añadir atajo** de todos los usuarios apuntará a esa plantilla.

[Compartir atajos (Apple)](https://support.apple.com/guide/shortcuts/share-shortcuts-apdf01f8c054/ios) · [Siri y bloqueo (Apple)](https://support.apple.com/guide/shortcuts/run-shortcuts-with-siri-apd07c25bb38/ios).

## Validación antes de invitar a otros

- Cuenta autorizada: generar código, consumirlo una vez y comprobar que aparece el iPhone en la PWA. No debe abrirse el portón al vincular.
- Reutilizar el mismo código debe fallar. Los códigos caducan a los diez minutos; generar otro cancela el pendiente anterior de esa cuenta.
- Desvincular desde la PWA debe impedir solicitudes futuras de ese atajo. Una orden que ya se envió al controlador no se puede retirar.
- Comprobar `/v1/verify`, sesión vencida, controlador desconectado y uso bloqueado antes de probar la apertura real.
- La nueva versión mantiene los atajos antiguos independientes. Desvincular un iPhone nuevo no revoca un viejo atajo que siga usando el secreto global `SIRI_TOKEN`.

## Desarrollo

`node siri/worker.test.mjs` ejecuta las pruebas originales y `node siri/pairing.test.mjs` prueba la vinculación sobre SQLite real con Firebase simulado. Requiere Node 24. Ninguna prueba automatizada envía órdenes reales.
