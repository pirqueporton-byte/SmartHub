// ============================================================
// MARÍA IA · CHAT FLOTANTE PARA SMART HUB
// Usa la misma instancia window.MariaAI que la voz, por lo que comparte
// contexto conversacional y las mismas herramientas seguras.
// ============================================================
(() => {
  'use strict';

  if (window.__MARIA_CHAT_LOADED__) return;
  window.__MARIA_CHAT_LOADED__ = true;

  const esc = (s='') => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function instalarEstilos() {
    if (document.getElementById('maria-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'maria-chat-styles';
    style.textContent = `
      :root{
        --maria-bg:rgba(255,255,255,.96);
        --maria-panel:#ffffff;
        --maria-text:#111827;
        --maria-muted:#6b7280;
        --maria-border:rgba(15,23,42,.10);
        --maria-soft:#f3f5f7;
        --maria-accent:#111827;
        --maria-accent-text:#ffffff;
        --maria-user:#111827;
        --maria-user-text:#ffffff;
        --maria-shadow:0 24px 70px rgba(15,23,42,.20);
      }
      body[data-theme="dark"]{
        --maria-bg:rgba(28,31,38,.97);
        --maria-panel:#1c1f26;
        --maria-text:#f4f6f8;
        --maria-muted:#a5abb5;
        --maria-border:rgba(255,255,255,.10);
        --maria-soft:#252932;
        --maria-accent:#f4f6f8;
        --maria-accent-text:#13161b;
        --maria-user:#f4f6f8;
        --maria-user-text:#13161b;
        --maria-shadow:0 24px 70px rgba(0,0,0,.42);
      }
      body[data-theme="grey"]{
        --maria-bg:rgba(41,42,45,.97);
        --maria-panel:#292a2d;
        --maria-text:#e8eaed;
        --maria-muted:#aeb3ba;
        --maria-border:rgba(255,255,255,.11);
        --maria-soft:#343538;
        --maria-accent:#e8eaed;
        --maria-accent-text:#202124;
        --maria-user:#e8eaed;
        --maria-user-text:#202124;
      }

      #maria-chat-launcher{
        position:fixed;right:18px;bottom:66px;z-index:100001;
        width:50px;height:50px;border:0;border-radius:18px;
        display:grid;place-items:center;cursor:pointer;
        color:var(--maria-accent-text);background:var(--maria-accent);
        box-shadow:0 10px 28px rgba(15,23,42,.23);
        transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
      }
      #maria-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(15,23,42,.28)}
      #maria-chat-launcher:active{transform:scale(.96)}
      #maria-chat-launcher svg{width:23px;height:23px}
      #maria-chat-launcher .maria-badge{
        position:absolute;right:-2px;top:-2px;width:12px;height:12px;border-radius:50%;
        background:#35c56f;border:2px solid var(--maria-panel);
      }

      #maria-chat-panel{
        position:fixed;right:18px;bottom:126px;z-index:100002;
        width:min(390px,calc(100vw - 24px));height:min(620px,calc(100dvh - 160px));
        min-height:420px;display:none;flex-direction:column;overflow:hidden;
        border:1px solid var(--maria-border);border-radius:24px;
        background:var(--maria-bg);color:var(--maria-text);
        box-shadow:var(--maria-shadow);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
        transform-origin:bottom right;
      }
      #maria-chat-panel.open{display:flex;animation:mariaChatIn .18s ease-out}
      @keyframes mariaChatIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}

      .maria-chat-head{display:flex;align-items:center;gap:11px;padding:15px 15px 13px;border-bottom:1px solid var(--maria-border)}
      .maria-chat-mark{width:38px;height:38px;border-radius:14px;background:var(--maria-accent);color:var(--maria-accent-text);display:grid;place-items:center;flex:0 0 auto}
      .maria-chat-mark svg{width:20px;height:20px}
      .maria-chat-title{min-width:0;flex:1}
      .maria-chat-title strong{display:block;font-size:14px;line-height:1.2;letter-spacing:-.01em}
      .maria-chat-status{display:flex;align-items:center;gap:6px;margin-top:3px;color:var(--maria-muted);font-size:11px;font-weight:600}
      .maria-chat-status-dot{width:7px;height:7px;border-radius:50%;background:#35c56f}
      .maria-chat-head-actions{display:flex;gap:4px}
      .maria-chat-icon-btn{width:34px;height:34px;border:0;border-radius:11px;background:transparent;color:var(--maria-muted);display:grid;place-items:center;cursor:pointer}
      .maria-chat-icon-btn:hover{background:var(--maria-soft);color:var(--maria-text)}
      .maria-chat-icon-btn svg{width:18px;height:18px}

      .maria-chat-body{flex:1;overflow-y:auto;padding:15px;scroll-behavior:smooth}
      .maria-chat-welcome{padding:8px 2px 10px}
      .maria-chat-welcome h3{font-size:18px;margin:0 0 6px;letter-spacing:-.02em}
      .maria-chat-welcome p{font-size:12.5px;line-height:1.5;color:var(--maria-muted);margin:0}
      .maria-chat-suggestions{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 5px}
      .maria-chat-chip{border:1px solid var(--maria-border);background:var(--maria-soft);color:var(--maria-text);border-radius:999px;padding:8px 10px;font:600 11px/1.2 inherit;cursor:pointer}
      .maria-chat-chip:hover{filter:brightness(.98)}

      .maria-msg-row{display:flex;margin:11px 0}
      .maria-msg-row.user{justify-content:flex-end}
      .maria-msg{max-width:86%;padding:10px 12px;border-radius:16px;font-size:13px;line-height:1.48;white-space:pre-wrap;word-break:break-word}
      .maria-msg-row.assistant .maria-msg{background:var(--maria-soft);border:1px solid var(--maria-border);border-bottom-left-radius:6px}
      .maria-msg-row.user .maria-msg{background:var(--maria-user);color:var(--maria-user-text);border-bottom-right-radius:6px}
      .maria-msg-tools{display:flex;justify-content:flex-start;margin-top:5px}
      .maria-speak-btn{border:0;background:transparent;color:var(--maria-muted);padding:3px 5px;cursor:pointer;border-radius:7px;display:flex;align-items:center;gap:4px;font:600 10px/1 inherit}
      .maria-speak-btn:hover{background:var(--maria-soft);color:var(--maria-text)}
      .maria-speak-btn svg{width:13px;height:13px}

      .maria-typing{display:inline-flex;align-items:center;gap:4px;min-width:52px}
      .maria-typing i{width:6px;height:6px;border-radius:50%;background:var(--maria-muted);animation:mariaTyping 1.1s infinite ease-in-out}
      .maria-typing i:nth-child(2){animation-delay:.14s}.maria-typing i:nth-child(3){animation-delay:.28s}
      @keyframes mariaTyping{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-3px);opacity:1}}

      .maria-chat-foot{padding:10px;border-top:1px solid var(--maria-border);background:var(--maria-panel)}
      .maria-chat-compose{display:flex;align-items:flex-end;gap:7px;border:1px solid var(--maria-border);background:var(--maria-soft);border-radius:17px;padding:7px 7px 7px 11px}
      #maria-chat-input{flex:1;resize:none;min-height:35px;max-height:105px;border:0;outline:0;background:transparent;color:var(--maria-text);font:500 13px/1.45 inherit;padding:8px 2px}
      #maria-chat-input::placeholder{color:var(--maria-muted)}
      #maria-chat-send{width:36px;height:36px;flex:0 0 auto;border:0;border-radius:12px;background:var(--maria-accent);color:var(--maria-accent-text);display:grid;place-items:center;cursor:pointer}
      #maria-chat-send:disabled{opacity:.45;cursor:not-allowed}
      #maria-chat-send svg{width:17px;height:17px}
      .maria-chat-note{text-align:center;color:var(--maria-muted);font-size:9.5px;margin-top:6px}

      @media(max-width:700px){
        #maria-chat-launcher{right:12px;bottom:58px;width:48px;height:48px;border-radius:17px}
        #maria-chat-panel{right:8px;left:8px;bottom:116px;width:auto;height:min(610px,calc(100dvh - 132px));border-radius:22px}
      }
      @media(max-height:590px){#maria-chat-panel{top:8px;bottom:8px;height:auto;min-height:0}}
    `;
    document.head.appendChild(style);
  }

  function iconSparkles() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2L12 3Z"/><path d="M18.5 12.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="M5.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>`;
  }

  function crearUI() {
    if (document.getElementById('maria-chat-launcher')) return;
    instalarEstilos();

    const launcher = document.createElement('button');
    launcher.id = 'maria-chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Abrir chat con María IA');
    launcher.innerHTML = `${iconSparkles()}<span class="maria-badge"></span>`;

    const panel = document.createElement('section');
    panel.id = 'maria-chat-panel';
    panel.setAttribute('aria-label', 'Chat con María IA');
    panel.innerHTML = `
      <div class="maria-chat-head">
        <div class="maria-chat-mark">${iconSparkles()}</div>
        <div class="maria-chat-title">
          <strong>María IA</strong>
          <div class="maria-chat-status"><span class="maria-chat-status-dot"></span><span id="maria-chat-status-text">Disponible para ayudarte</span></div>
        </div>
        <div class="maria-chat-head-actions">
          <button class="maria-chat-icon-btn" id="assistant-settings-open" type="button" title="Nombre y voz" aria-label="Configurar nombre y voz">⚙</button>
          <button class="maria-chat-icon-btn" id="maria-chat-clear" type="button" title="Nueva conversación" aria-label="Nueva conversación">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button class="maria-chat-icon-btn" id="maria-chat-close" type="button" title="Cerrar" aria-label="Cerrar chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
          </button>
        </div>
      </div>
      <div class="maria-chat-body" id="maria-chat-body"></div>
      <div class="maria-chat-foot">
        <div class="maria-chat-compose">
          <textarea id="maria-chat-input" rows="1" autocomplete="off" placeholder="Pregúntale algo a María…"></textarea>
          <button id="maria-chat-send" type="button" aria-label="Enviar mensaje">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </button>
        </div>
        <div class="maria-chat-note">María puede consultar y controlar los módulos permitidos de SmartHub.</div>
      </div>`;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    panel.querySelector('#assistant-settings-open').onclick = () => window.AssistantSettings.open();
    const body = panel.querySelector('#maria-chat-body');
    const input = panel.querySelector('#maria-chat-input');
    const send = panel.querySelector('#maria-chat-send');
    const status = panel.querySelector('#maria-chat-status-text');
    let busy = false;

    function bienvenida() {
      body.innerHTML = `
        <div class="maria-chat-welcome">
          <h3>Hola, soy María.</h3>
          <p>Pregúntame con lenguaje normal. Puedo revisar el riego, el portón, el clima y ejecutar las acciones habilitadas en SmartHub.</p>
          <div class="maria-chat-suggestions">
            <button class="maria-chat-chip" type="button">¿Qué se riega mañana?</button>
            <button class="maria-chat-chip" type="button">¿Falta programar algún sector?</button>
            <button class="maria-chat-chip" type="button">¿Cómo estará el clima en Pirque?</button>
          </div>
        </div>`;
      window.AssistantSettings.refresh();
      body.querySelectorAll('.maria-chat-chip').forEach(btn => btn.addEventListener('click', () => enviar(btn.textContent)));
    }

    function scrollBottom() { body.scrollTop = body.scrollHeight; }

    function addMessage(role, text) {
      const row = document.createElement('div');
      row.className = `maria-msg-row ${role}`;
      const bubble = document.createElement('div');
      bubble.className = 'maria-msg';
      bubble.textContent = text;
      row.appendChild(bubble);
      body.appendChild(row);

      if (role === 'assistant' && 'speechSynthesis' in window) {
        const tools = document.createElement('div');
        tools.className = 'maria-msg-tools';
        const speak = document.createElement('button');
        speak.className = 'maria-speak-btn';
        speak.type = 'button';
        speak.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg> Escuchar`;
        speak.addEventListener('click', () => {
          try {
            if (window.hablarRespuesta) window.hablarRespuesta(text, { seguir: false });
          } catch (_) {}
        });
        tools.appendChild(speak);
        bubble.appendChild(tools);
      }
      scrollBottom();
      return row;
    }

    function addTyping() {
      const row = document.createElement('div');
      row.className = 'maria-msg-row assistant';
      row.id = 'maria-chat-typing';
      row.innerHTML = `<div class="maria-msg"><span class="maria-typing"><i></i><i></i><i></i></span></div>`;
      body.appendChild(row); scrollBottom();
    }

    function removeTyping() { document.getElementById('maria-chat-typing')?.remove(); }

    async function enviar(textoForzado) {
      const texto = String(textoForzado ?? input.value).trim();
      if (!texto || busy) return;

      if (!window.MariaAI || typeof window.MariaAI.procesar !== 'function') {
        addMessage('assistant', 'María IA no está disponible en esta página. Revisa maria-config.js y maria-ai.js.');
        return;
      }

      input.value = '';
      input.style.height = 'auto';
      if (body.querySelector('.maria-chat-welcome')) body.innerHTML = '';
      addMessage('user', texto);
      busy = true; send.disabled = true; input.disabled = true;
      status.textContent = 'Pensando…'; addTyping();

      try {
        const respuesta = await window.MariaAI.procesar(texto);
        removeTyping();
        addMessage('assistant', respuesta || 'Listo.');
        status.textContent = 'Disponible para ayudarte';
      } catch (err) {
        removeTyping();
        const msg = err?.message || String(err) || 'Ocurrió un error al consultar a María.';
        addMessage('assistant', `No pude completar la consulta: ${msg}`);
        status.textContent = 'Hubo un problema';
        console.error('María chat:', err);
      } finally {
        busy = false; send.disabled = false; input.disabled = false; input.focus();
      }
    }

    launcher.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) setTimeout(() => input.focus(), 80);
    });
    panel.querySelector('#maria-chat-close').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#maria-chat-clear').addEventListener('click', () => {
      if (busy) return;
      window.MariaAI?.limpiarContexto?.();
      bienvenida(); status.textContent = 'Nueva conversación'; input.focus();
    });
    send.addEventListener('click', () => enviar());
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 105) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });

    bienvenida();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', crearUI);
  else crearUI();
})();
