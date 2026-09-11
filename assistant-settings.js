/* Personalización local por cuenta y dispositivo. */
(() => {
  'use strict';
  const normalize = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const key = () => 'smarthub:assistant:v1:' + (window.firebase?.auth?.().currentUser?.uid || 'device');
  function get() {
    try { return { name:'María', profile:'female', voices:{}, ...JSON.parse(localStorage.getItem(key()) || '{}') }; }
    catch (_) { return { name:'María', profile:'female', voices:{} }; }
  }
  const name = () => get().name;
  const display = text => String(text).replace(/María/g, name());
  function pattern() {
    const escaped = normalize(name()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9])', 'i');
  }
  const invoked = text => pattern().test(normalize(text));
  const strip = text => normalize(text).replace(pattern(), '$1');
  function gender(v) {
    const n = normalize(v.name);
    if (/\b(female|femenina|monica|paulina|sabina|angelica|catalina|elvira|dalia|paloma|helena|laura|lucia|penelope|mia)\b/.test(n)) return 'female';
    if (/\b(male|masculina|jorge|diego|juan|pablo|carlos|raul|alvaro|alonso|tomas|rodrigo|andres|miguel|enrique)\b/.test(n)) return 'male';
    return 'unknown';
  }
  function voices() { return (window.speechSynthesis?.getVoices() || []).filter(v => /^es(?:[-_]|$)/i.test(v.lang)); }
  function ranked(profile) {
    return voices().slice().sort((a,b) => score(b)-score(a));
    function score(v) {
      return (gender(v) === profile ? 100 : gender(v) === 'unknown' ? 0 : -100) +
        (/^es[-_]CL$/i.test(v.lang) ? 40 : !/^es[-_]ES$/i.test(v.lang) ? 30 : 0) +
        (/natural|enhanced|premium|neural/i.test(v.name) ? 10 : 0);
    }
  }
  function apply(utterance, settings=get()) {
    const list = ranked(settings.profile);
    const voice = list.find(v => v.voiceURI === settings.voices?.[settings.profile]) || list[0];
    utterance.lang = voice?.lang || 'es-CL';
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.pitch = 1;
  }
  function refresh() {
    const set = (selector, text) => { const el=document.querySelector(selector); if(el) el.textContent=text; };
    set('.maria-chat-title strong', name()+' IA');
    set('.maria-chat-welcome h3', 'Hola, soy '+name()+'.');
    set('.maria-chat-note', name()+' puede consultar y controlar los módulos permitidos de SmartHub.');
    const input=document.getElementById('maria-chat-input');
    if(input) input.placeholder='Pregúntale algo a '+name()+'…';
    for(const [id,prefix] of [['maria-chat-launcher','Abrir chat con '],['maria-chat-panel','Chat con ']]) {
      document.getElementById(id)?.setAttribute('aria-label',prefix+name());
    }
    window.dispatchEvent(new Event('assistant-settings-changed'));
  }
  function open() {
    if(document.getElementById('assistant-preferences')) return;
    const saved=get();
    const dialog=document.createElement('dialog');
    dialog.id='assistant-preferences';
    dialog.setAttribute('aria-labelledby','assistant-preferences-title');
    dialog.innerHTML=`<form><h2 id="assistant-preferences-title">Tu asistente</h2>
      <label>Nombre<input id="assistant-name" required maxlength="24" autocomplete="off"></label>
      <p>Usa este nombre para llamar al asistente mientras el micrófono está activo.</p>
      <label>Perfil de voz<select id="assistant-profile"><option value="female">Femenina</option><option value="male">Masculina</option></select></label>
      <label>Voz en español<select id="assistant-voice"></select></label>
      <p id="assistant-voice-note">Las voces dependen del celular. Las de Latinoamérica tienen prioridad. Si el sistema no indica el género, escucha la muestra y guarda la que prefieras para este perfil.</p>
      <button type="button" id="assistant-preview">Escuchar muestra</button>
      <p id="assistant-save-status" role="status"></p>
      <div class="assistant-preferences-actions"><button type="button" id="assistant-cancel">Cancelar</button><button type="submit">Guardar</button></div>
      <p>Se guarda para tu cuenta en este dispositivo.</p></form>`;
    const style=document.createElement('style');
    style.textContent=`#assistant-preferences{box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:85dvh;overflow:auto;border:1px solid var(--border,#ddd);border-radius:22px;padding:24px;background:var(--surface,#fff);color:var(--text-main,#17202b);font:14px system-ui;z-index:100001}#assistant-preferences::backdrop{background:#0009}#assistant-preferences h2{margin:0 0 20px}#assistant-preferences label{display:block;font-weight:600;margin:16px 0 8px}#assistant-preferences input,#assistant-preferences select{box-sizing:border-box;display:block;width:100%;min-height:44px;margin-top:8px;padding:10px;border:1px solid #8888;border-radius:10px;background:var(--surface,#fff);color:inherit;font:inherit}#assistant-preferences p{font-size:12px;line-height:1.5;opacity:.8}#assistant-preferences button{min-height:44px;padding:10px 16px;border:1px solid #8888;border-radius:10px;background:var(--bg,#eef1f5);color:inherit;font:inherit;cursor:pointer}.assistant-preferences-actions{display:flex;justify-content:flex-end;gap:10px}`;
    dialog.appendChild(style);document.body.appendChild(dialog);
    const input=dialog.querySelector('#assistant-name'), profile=dialog.querySelector('#assistant-profile'), select=dialog.querySelector('#assistant-voice');
    const choices={...saved.voices};
    input.value=saved.name;profile.value=saved.profile;
    function populate() {
      const list=ranked(profile.value);
      select.replaceChildren(new Option('Automática · priorizar español latino',''));
      for(const v of list) select.add(new Option(`${v.name} · ${v.lang}${gender(v)==='unknown'?' · escuchar para elegir':''}`,v.voiceURI));
      select.value=choices[profile.value] || '';
      if(select.selectedIndex<0) select.value='';
      dialog.querySelector('#assistant-preview').disabled=!window.speechSynthesis;
      if(!list.length) dialog.querySelector('#assistant-voice-note').textContent='El navegador aún no ofrece voces en español. Puedes guardar el nombre; la voz usará la opción del sistema hasta que haya voces disponibles.';
    }
    profile.onchange=populate;
    select.onchange=()=>{choices[profile.value]=select.value;};
    window.speechSynthesis?.addEventListener('voiceschanged',populate);
    dialog.addEventListener('close',()=>{window.speechSynthesis?.removeEventListener('voiceschanged',populate);dialog.remove();},{once:true});
    dialog.querySelector('#assistant-cancel').onclick=()=>dialog.close();
    dialog.querySelector('#assistant-preview').onclick=()=>{
      const text=`Hola, soy ${input.value.trim() || saved.name}. Así suena mi voz. ¿En qué te puedo ayudar?`;
      window.hablarRespuesta?.(text,{seguir:false,voiceSettings:{profile:profile.value,voices:choices}});
    };
    dialog.querySelector('form').onsubmit=e=>{
      e.preventDefault();
      const n=input.value.trim().replace(/\s+/g,' ');
      if(!/^[\p{L} ]{2,24}$/u.test(n)){input.setCustomValidity('Usa entre 2 y 24 letras y espacios.');input.reportValidity();return;}
      try {localStorage.setItem(key(),JSON.stringify({name:n,profile:profile.value,voices:choices}));}
      catch(_){dialog.querySelector('#assistant-save-status').textContent='No se pudo guardar. Revisa el almacenamiento del navegador.';return;}
      window.MariaAI?.limpiarContexto();refresh();dialog.close();
    };
    input.oninput=()=>input.setCustomValidity('');
    populate();dialog.showModal();
  }
  window.AssistantSettings={get,name,display,invoked,strip,apply,open,refresh};
  window.addEventListener('storage',refresh);
  document.addEventListener('DOMContentLoaded',()=>{
    refresh();
    try {window.firebase?.auth?.().onAuthStateChanged(refresh);} catch(_) {}
  });
})();
