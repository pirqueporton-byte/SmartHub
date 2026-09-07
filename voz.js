// ==========================================
// ASISTENTE DE VOZ GLOBAL: "MARÍA"
// ==========================================

let recognition = null;
let isListening = false;

function iniciarAsistenteMaria() {
    // Verificamos si el navegador de la tablet soporta reconocimiento de voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn("Este navegador no soporta control por voz nativo. Usa Google Chrome.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'es-CL'; // Español de Chile
    recognition.continuous = true; // Escucha continua en segundo plano
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const ultimaFrase = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log("María escuchó:", ultimaFrase);

        // Activación por palabra clave "maría"
        if (ultimaFrase.includes("maría") || ultimaFrase.includes("maria")) {
            procesarComandoVoz(ultimaFrase);
        }
    };

    recognition.onerror = (event) => {
        console.log("Error de voz:", event.error);
    };

    recognition.onend = () => {
        // Si se detiene por silencio, la reiniciamos automáticamente para que nunca deje de escuchar
        if (isListening) {
            try { recognition.start(); } catch(e) {}
        }
    };

    // Arrancamos el asistente de forma silenciosa
    try {
        recognition.start();
        isListening = true;
        console.log("Asistente 'María' activo y escuchando...");
    } catch (e) {
        console.log("No se pudo iniciar el reconocimiento automático:", e);
    }
}

// Procesador de intenciones por contexto flexible
function procesarComandoVoz(texto) {
    // 1. COMANDO PARA ABRIR EL PORTÓN (Contexto: abrir, reja, portón, entrada)
    if ((texto.includes("abre") || texto.includes("abrir") || texto.includes("ábreme")) && 
        (texto.includes("portón") || texto.includes("porton") || texto.includes("reja") || texto.includes("entrada"))) {
        
        if (typeof abrirPortonAnimado === 'function') {
            abrirPortonAnimado();
            hablarRespuesta("Abriendo el portón enseguida.");
        } else if (typeof abrirPorton === 'function') {
            abrirPorton();
            hablarRespuesta("Abriendo el portón.");
        } else {
            // Si está en otra página donde no está la función directa, la ejecutamos vía Firebase
            if (typeof db !== 'undefined') {
                db.ref('estado_porton').update({ comando: 'abrir_' + Date.now(), timestamp: firebase.database.ServerValue.TIMESTAMP });
                hablarRespuesta("Abriendo el portón.");
            }
        }
        return;
    }

    // 2. COMANDO PARA NAVEGAR (Contexto: ir a riego, ir a inicio)
    if (texto.includes("riego") || texto.includes("mapa")) {
        hablarRespuesta("Abriendo el módulo de riego.");
        setTimeout(() => window.location.href = 'admin_riego.html', 1500);
        return;
    }

    if (texto.includes("portón") || texto.includes("inicio")) {
        hablarRespuesta("Yendo al inicio.");
        setTimeout(() => window.location.href = 'admin_inicio.html', 1500);
        return;
    }

    // Si dice María pero no entiende la orden
    hablarRespuesta("No entendí bien esa orden.");
}

// Síntesis de voz (Para que María te responda de vuelta)
function hablarRespuesta(mensaje) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(mensaje);
        utterance.lang = 'es-CL';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// Auto-iniciar al cargar cualquier página de administrador
window.addEventListener('DOMContentLoaded', () => {
    // Pequeño retardo para asegurar que la página cargó bien
    setTimeout(iniciarAsistenteMaria, 2000);
});