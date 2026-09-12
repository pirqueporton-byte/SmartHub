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
