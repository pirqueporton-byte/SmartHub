# SmartHub en Android Auto

La misma APK y sesión de Google del teléfono ofrecen una pantalla IoT con el portón y la acción **Abrir portón**. Android Auto controla el diseño final: no se incrusta la PWA ni se superpone el botón sobre Waze o Maps.

- Al entrar y al pulsar Actualizar se consulta la conexión; nunca se envían órdenes automáticamente.
- Abrir portón comprueba de nuevo la autorización y el reporte reciente del dispositivo, usando el mismo backend de María y escritura condicional ETag.
- Una orden enviada no confirma apertura física: no existe sensor de posición en esta integración.
- No hay reintentos automáticos ante error. Después de una orden se debe actualizar antes de poder repetirla.
- No necesita activar el micrófono ni depende del límite de dos horas del modo de escucha.
- La sesión se configura en el teléfono, estacionado. Los hosts se validan con la lista de AndroidX.

## Prueba en un auto real

Según [Google](https://developer.android.com/training/cars/testing), las apps de Car App Library requieren instalarse desde una fuente confiable, como Google Play. La opción de orígenes desconocidos de Android Auto no habilita estas apps. El ZIP/APK de GitHub por sí solo no habilita la pantalla del auto.

1. En Play Console, crear la ficha de la app con el paquete cl.smarthub.porton y usar **Compartir aplicaciones de forma interna**, o una pista de pruebas interna.
2. Subir el APK de prueba generado en GitHub Actions siguiendo las condiciones de la consola.
3. En Compartir aplicaciones de forma interna, consultar el certificado de prueba: Google vuelve a firmar la app. Registrar su SHA-1 en la app Android del proyecto Firebase **portonpique**. No confundirlo con FIREBASE-SHA.txt, que corresponde a la instalación directa del APK de GitHub.
4. En el teléfono habilitar Compartir aplicaciones de forma interna en Play Store y abrir el enlace de instalación generado por Play Console. Si hay conflicto de firmas con la instalación directa, desinstalar esa copia primero e iniciar sesión otra vez.
5. Iniciar sesión en SmartHub, conectar Android Auto y abrir SmartHub en el lanzador del auto.
6. Primero comprobar visualmente el estado sin pulsar Abrir portón. Probar la apertura solo con supervisión del propietario.

[Instrucciones de Google para compartir internamente y certificados](https://support.google.com/googleplay/android-developer/answer/9844679).

Para publicar al público se requiere completar los requisitos y la revisión de Android Auto. La compilación y las pruebas unitarias no sustituyen las pruebas en un vehículo o en el Desktop Head Unit. Esta versión todavía necesita esa validación.

## Validación automatizada

CarGateControllerTest verifica lectura al entrar, doble pulsación, sesión cambiada, pantalla detenida y ausencia de reintentos. NativeGateTest verifica la conexión, ETag, permisos y las escrituras con transporte simulado; no se controla ningún dispositivo real.
