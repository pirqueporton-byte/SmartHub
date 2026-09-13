# SmartHub Android · primera prueba

APK nativa para Android 8 o posterior, con modo conducción y Vosk local en español. No usa Bixby ni una API de reconocimiento de pago. El APK generado en GitHub Actions está firmado con una clave de depuración temporal: es una prueba, no una distribución definitiva. Una compilación futura podría requerir desinstalar esta versión; eso elimina la configuración local.

## Instalación y conexión

1. Descarga el artefacto SmartHub-Android-prueba del flujo Android APK de prueba. Descomprime e instala app-debug.apk. Autoriza la instalación desde esa fuente cuando Android lo solicite.
2. En Conexión del portón, escribe la URL base del Worker que configuraste para Siri, sin `/abrir`, y su `SIRI_TOKEN`. No pegues estas claves en GitHub ni en el chat. La clave se cifra con Android Keystore; no se incluye en el APK ni en copias de seguridad.
3. Guarda y pulsa Verificar sin abrir. Esta llamada POST usa `/verificar` y no mueve el portón.
4. Mantén encendido Prueba sin mover el portón. Activa el modo conducción con el teléfono desbloqueado y concede permisos de micrófono/notificación. La preparación inicial del modelo puede tardar.
5. Después del aviso, bloquea la pantalla y di «abre el portón». Debe responder sobre la conexión sin abrir. El reconocimiento es local; la consulta al portón necesita internet.
6. Solo después de esa prueba, desactiva Prueba sin mover el portón y reactiva conducción para habilitar órdenes reales. Una orden final reconocida con confianza suficiente genera un solo POST `/abrir`; no hay reintentos automáticos. Revisa físicamente cualquier resultado incierto.

## Comportamiento

- Notificación persistente con Detener. También acepta «terminar modo conducción».
- Sesión de hasta dos horas. Después de detenerla, reiniciar el teléfono, forzar cierre o una interrupción del micrófono, abre la app y actívala nuevamente.
- El micrófono y el procesamiento local consumen batería. No equivale a la escucha de bajo consumo integrada del asistente del fabricante.
- Conserva SmartHub mediante una pestaña segura del navegador (Custom Tab), no WebView. Google no permite su autenticación dentro de un navegador embebido controlado por la app. La interfaz y los módulos web se mantienen; la pantalla nativa añade conducción y conexión.
- No es una copia de María IA: en segundo plano reconoce únicamente abrir portón y terminar conducción. Nombre/voz de la PWA no configuran este servicio.
- No borres datos de Chrome para instalarla. El inicio de sesión web sigue siendo el de SmartHub. La autorización del comando nativo es la del Worker enlazado a Siri, independiente de la sesión web.
- No hace reconocimiento del dueño de la voz. Mientras se activa conducción puede responder a otra persona que pronuncie la frase.
- APK pendiente de validación real de micrófono, llamadas, Bluetooth, pantalla bloqueada y ahorro de batería del Note 20. Compilar con éxito no verifica hardware.

## Compilación

Java 17, Android SDK 35, Gradle 8.11.1. GitHub Actions descarga el modelo español `vosk-model-small-es-0.42` desde el proveedor y genera el APK y las pruebas unitarias. Modelo y Vosk bajo Apache 2.0; JNA LGPL 2.1 / Apache 2.0. Fuentes: https://alphacephei.com/vosk/models y https://github.com/alphacep/vosk-android-demo .


## Versión 0.2 integrada

La pantalla inicial contiene la PWA en WebView y un botón Conducción que abre los controles nativos dentro de la misma APK. El inicio de sesión utiliza Credential Manager y entrega el ID token Google únicamente al marco principal de SmartHub mediante WebMessageListener restringido al origen. La web conserva sus comprobaciones de autorización y configuración Firebase; no se migra ninguna cuenta. No se permite navegación principal fuera de /SmartHub/.

El cliente web OAuth proviene del google-services.json del proyecto 556068512549. Registra en Firebase la SHA-1 de FIREBASE-SHA.txt incluida junto a la APK. Los builds de prueba todavía usan una firma debug nueva por ejecución: una siguiente compilación puede requerir registrar su nueva huella y reinstalar. Para distribución estable hay que configurar firma privada persistente en secretos de CI; nunca publicar el keystore.

La conexión Worker y la escucha local conservan su configuración anterior. Esta versión aún requiere configurar esa conexión en Conducción; el acceso Google web no reemplaza el token del Worker. Las funciones de voz web dependen del soporte de WebView; el modo conducción usa el micrófono nativo. Validar acceso Google, navegación, cerrar sesión y escucha bloqueada en dispositivo real antes de distribuir.


## Versión 0.3 · María integrada

La barra nativa se elimina. El micrófono y el engranaje del chat abren un panel de voz adaptado al tema; la vista de usuario incluye un acceso dentro de su tarjeta. El acceso Google sincroniza su refresh token exclusivamente por el puente de origen/marco principal y lo cifra con AndroidKeyStore. No se requiere SIRI_TOKEN ni configurar Workers en la APK. Al cerrar sesión se borra esa sesión nativa y se detiene el servicio. El Worker de María conserva la validación de Firebase y ALLOWED_EMAILS; el cliente identifica el origen de la interfaz SmartHub embebida. No se modifica Cloudflare.

Vosk reconoce localmente el nombre elegido y mantiene conversación por 60 segundos desde el final de la respuesta. La IA, el contexto y las herramientas son compartidos entre el chat de la APK y el servicio nativo. El motor Android implementa consultar riego/portón/clima, abrir portón, controlar riego, preparar cambios de programación (confirmación exacta “confirmar cambio”, vigente un minuto, ETag) y seleccionar un módulo para el próximo primer plano. Las cuentas no administradoras quedan limitadas al portón, más consultas de clima si el Worker autoriza la cuenta. La apertura exacta “abre el portón” se resuelve sin IA.

El portón se lee sin caché, con hora HTTP del servidor y heartbeat de hasta 35 segundos. Un fallo de consulta no se etiqueta como offline. Se usa PUT condicional conservando el resto del estado, un margen de diez segundos entre comandos y ninguna repetición automática tras un envío incierto. El sistema confirma envío de orden, no apertura física: no hay sensor de posición confirmado en esta integración.

Al invocar a María hay respuesta/tono y notificación temporal de escucha. El sistema operativo decide si muestra aviso emergente sobre la pantalla bloqueada; no se usa permiso de superposición ni intent de pantalla completa. La notificación pública no incluye el contenido de la conversación. El micrófono debe activarse con app visible/desbloqueada, funciona como servicio foreground por hasta dos horas y no se reactiva solo tras reinicio/force-stop. La batería sigue consumiéndose durante escucha. La voz no autentica la identidad del hablante.

Las voces disponibles son las del motor TTS instalado. Se pueden preescuchar y guardar por perfil/cuenta en este dispositivo; Android no publica un género fiable para todas. Algunas necesitan internet. No se promete síntesis neural gratuita ni voces idénticas entre dispositivos.

Pruebas automáticas: resolución de clases Google, coincidencia del nombre, heartbeat con reloj del servidor, bloqueo de escritura offline/incierta, ETag/preservación de estado, cambio de sesión, ausencia de reintentos y restricción de riego para cuentas regulares. Todas las pruebas de comandos usan transporte simulado: no accionan equipos. Requiere prueba real de Google, consultas y micrófono bloqueado en Note 20/iOS no aplica (esta APK solo Android). La firma de CI sigue siendo debug de prueba; registrar la SHA de esta compilación en Firebase.
