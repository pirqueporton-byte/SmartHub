// Configuración pública de María IA.
// Después de desplegar el Cloudflare Worker, reemplaza la URL de abajo.
window.MARIA_AI_CONFIG = {
  endpoint: 'https://smarthub-maria-ai.pirqueporton.workers.dev/chat',
  enabled: true,
  maxToolRounds: 5,
  conversationMessages: 12
};
