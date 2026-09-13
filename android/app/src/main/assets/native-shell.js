(() => {
 'use strict';
 if(window.SmartHubNative || !window.SmartHubAndroid || !window.firebase)return;
 let serial=0,voices=[],user=null,lastTurn=0,lastStatus={active:false,status:'Micrófono apagado'};
 const pending=new Map();
 function rpc(type,data={}){return new Promise((resolve,reject)=>{const id=String(++serial);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('La consulta está tardando. No repitas una orden sin revisar su resultado.'));},180000);pending.set(id,{resolve,reject,timer});SmartHubAndroid.postMessage(JSON.stringify({id,type,...data}));});}
 SmartHubAndroid.onmessage=event=>{
  const data=JSON.parse(event.data);
  if(data.token){firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(data.token)).catch(()=>window.showError?.('No se pudo completar el acceso con Google.'));return;}
  if(!data.id){if(data.error)window.showError?.(data.error);return;}
  const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.value);
 };
 window.iniciarSesion=()=>{window.mostrarCarga?.(true);SmartHubAndroid.postMessage('google-login');};
 const fallback={name:'María',profile:'female',voices:{}};
 function settings(){return window.AssistantSettings?.get?.()||{...fallback,...JSON.parse(localStorage.getItem('smarthub:assistant:v1:'+(user?.uid||'device'))||'{}')};}
 function notify(text){const el=document.querySelector('#native-message');if(el)el.textContent=text;}
 function syncSettings(){const s=settings();return rpc('settings',{name:s.name,voice:s.voices?.[s.profile]||'',theme:localStorage.getItem('riegoTheme')||'dark'}).catch(()=>{});}
 window.SmartHubNative={rpc};
 class Utterance{constructor(text=''){this.text=text;this.lang='es-CL';this.rate=1;this.pitch=1;}}
 const synthesis={getVoices:()=>voices,speaking:false,pending:false,paused:false,resume(){},cancel(){rpc('cancelSpeech').catch(()=>{});this.speaking=false;},speak(u){this.speaking=true;u.onstart?.();rpc('speak',{text:u.text}).then(()=>u.onend?.()).catch(()=>u.onerror?.()).finally(()=>{this.speaking=false;});},addEventListener(type,fn){window.addEventListener('native-'+type,fn);},removeEventListener(type,fn){window.removeEventListener('native-'+type,fn);}};
 try{Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synthesis});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});}catch(_){}
 window.hablarRespuesta=async text=>{await syncSettings();return rpc('speak',{text:String(text)});};
 window.procesarComandoVoz=async text=>{const answer=await rpc('ask',{text});await window.hablarRespuesta(answer);return answer;};
 if(window.MariaAI){MariaAI.procesar=text=>rpc('ask',{text:String(text)});MariaAI.limpiarContexto=()=>rpc('clear').catch(()=>{});}
 const style=document.createElement('style');style.textContent=`
 #maria-chat-launcher[data-native-phase=ready]{box-shadow:0 0 0 6px #57b9ef33;animation:native-pulse 1s infinite}
 #maria-chat-launcher[data-native-phase=speaking]{box-shadow:0 0 0 5px #ac8cf433}
 #native-maria-modal{position:fixed;inset:0;z-index:200010;background:rgba(0,0,0,.48);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box}
 #native-maria-modal[hidden]{display:none}
 .native-sheet{box-sizing:border-box;width:min(100%,460px);max-height:90dvh;overflow:auto;background:var(--surface,#1e2128);color:var(--text-main,#f3f4f6);border:1px solid var(--border,#343844);border-radius:26px;padding:24px;font-family:inherit;font-size:14px;line-height:1.5;box-shadow:0 20px 70px #0004}
 .native-sheet *{box-sizing:border-box}.native-sheet h2{margin:0;font-size:23px}.native-sheet p{color:var(--text-muted,#9ca3af);margin:8px 0 18px}
 .native-sheet label{display:block;margin-top:16px;font-size:13px}.native-sheet input,.native-sheet select{font:inherit;width:100%;padding:12px;border-radius:12px;margin-top:6px;background:var(--bg,#121418);color:inherit;border:1px solid var(--border,#343844)}
 .native-sheet button{font:inherit;cursor:pointer;border:1px solid var(--border,#343844);border-radius:12px;padding:11px 15px;background:var(--bg,#121418);color:inherit}
 .native-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.native-sheet .native-enable{width:100%;background:#157e75;color:white;border:0;margin:10px 0}.native-sheet .native-status{padding:14px;border-radius:16px;background:var(--bg,#121418);margin:18px 0}
 .native-sheet small{display:block;color:var(--text-muted,#9ca3af);font-size:12px;line-height:1.5}#native-message{font-size:13px;color:var(--text-muted,#9ca3af);margin-top:8px}
 #native-inline{display:flex;align-items:center;gap:9px;padding:10px 14px;margin:14px auto 0;border:1px solid var(--border,#343844);border-radius:999px;background:var(--surface,#1e2128);color:var(--text-main,#f3f4f6);font:inherit;cursor:pointer}
 .native-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#83909a;margin-right:6px}.native-dot[data-on=true]{background:#31bf95}.native-dot[data-phase=ready]{background:#57b9ef;animation:native-pulse 1s infinite}@keyframes native-pulse{50%{box-shadow:0 0 0 6px #57b9ef22}}
 `;document.head.appendChild(style);
 const modal=document.createElement('div');modal.id='native-maria-modal';modal.hidden=true;modal.innerHTML=`<section class="native-sheet" role="dialog" aria-modal="true" aria-labelledby="native-title"><div class="native-row"><h2 id="native-title">Tu asistente</h2><button id="native-close" aria-label="Cerrar">✕</button></div><p>La misma voz dentro y fuera de SmartHub.</p><div class="native-status"><strong id="native-state">Micrófono apagado</strong><button type="button" class="native-enable" id="native-toggle">Activar escucha</button><small>Actívala con la app abierta. Luego puedes bloquear el teléfono y decir el nombre de tu asistente. Sigue escuchando hasta que la apagues o se cumplan dos horas.</small></div><label>Nombre<input id="native-name" maxlength="30" autocomplete="off"></label><label>Perfil de voz<select id="native-profile"><option value="female">Femenina</option><option value="male">Masculina</option></select></label><label>Voz de este teléfono<select id="native-voice"></select></label><small>Android no informa el género de todas las voces. Escúchalas y guarda tu favorita para cada perfil.</small><div class="native-row" style="margin-top:18px"><button id="native-preview">Escuchar voz</button><button id="native-save">Guardar</button></div><p id="native-message" role="status"></p><small>Al oír su nombre, responde y emite un tono. El aviso en la pantalla bloqueada depende de las notificaciones de Android. La escucha consume batería; las consultas de IA y datos necesitan internet.</small></section>`;document.body.appendChild(modal);
 const $=id=>document.getElementById(id);
 function voiceOptions(selected){const el=$('native-voice');el.replaceChildren();el.add(new Option('Automática · español de Chile',''));voices.slice().sort((a,b)=>(a.lang==='es-CL'?-1:1)-(b.lang==='es-CL'?-1:1)).forEach(v=>el.add(new Option(v.lang+' · '+v.name+(v.localService?' · sin internet':' · requiere internet'),v.voiceURI)));el.value=selected||'';}
 function open(){if(!user)return;const s=settings();$('native-name').value=s.name;$('native-profile').value=s.profile;voiceOptions(s.voices?.[s.profile]);modal.hidden=false;$('native-close').focus();render();}
 function save(){const name=$('native-name').value.trim();if(!name){notify('Escribe un nombre para tu asistente.');return false;}const s=settings(),profile=$('native-profile').value;s.name=name;s.profile=profile;s.voices={...s.voices,[profile]:$('native-voice').value};localStorage.setItem('smarthub:assistant:v1:'+user.uid,JSON.stringify(s));window.AssistantSettings?.refresh?.();syncSettings();return true;}
 $('native-profile').onchange=()=>voiceOptions(settings().voices?.[$('native-profile').value]);
 $('native-close').onclick=()=>{modal.hidden=true;};modal.onclick=e=>{if(e.target===modal)modal.hidden=true;};modal.addEventListener('keydown',e=>{if(e.key==='Escape')modal.hidden=true;});
 $('native-save').onclick=()=>{if(save())notify('Nombre y voz guardados para tu cuenta en este teléfono.');};
 $('native-preview').onclick=async()=>{if(save())try{await window.hablarRespuesta('Hola, soy '+settings().name+'. Así sonará mi voz.');}catch(e){notify(e.message);}};
 $('native-toggle').onclick=async()=>{try{await syncSettings();await rpc('listen',{enabled:!lastStatus.active});await poll();}catch(e){notify(e.message);}};
 if(window.AssistantSettings)AssistantSettings.open=open;
 function mount(){
  if(!user)return;
  document.getElementById('maria-voice-status')?.remove();
  const header=document.querySelector('.maria-chat-head-actions');
  if(header&&!document.getElementById('native-mic')){const b=document.createElement('button');b.id='native-mic';b.type='button';b.className='maria-chat-icon-btn';b.title='Voz y escucha';b.setAttribute('aria-label','Configurar voz y escucha');b.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>';b.onclick=open;header.prepend(b);}
  if(!header&&!document.getElementById('native-inline')){const host=document.querySelector('.user-card,main,.dash-main,.main-content');if(host){const b=document.createElement('button');b.id='native-inline';b.type='button';b.onclick=open;host.appendChild(b);}}
 }
 function render(){
  $('native-state').textContent=lastStatus.status;
  $('native-toggle').textContent=lastStatus.active?'Apagar micrófono':'Activar escucha';
  const text=document.getElementById('maria-chat-status-text');if(text)text.textContent=lastStatus.active?lastStatus.status:'Voz apagada · actívala desde el micrófono';
  const b=document.getElementById('native-mic');if(b)b.style.color=lastStatus.active?'#31bf95':'';
  const launcher=document.getElementById('maria-chat-launcher');if(launcher){launcher.title=settings().name+' · '+lastStatus.status;launcher.dataset.nativePhase=lastStatus.phase;}
  const inline=document.getElementById('native-inline');if(inline){inline.replaceChildren();const dot=document.createElement('span');dot.className='native-dot';dot.dataset.on=String(lastStatus.active);dot.dataset.phase=lastStatus.phase;inline.append(dot,document.createTextNode(settings().name+' · '+(lastStatus.active?'Escucha activa':'Voz y escucha')));}
 }
 async function poll(){if(!user||document.hidden)return;try{lastStatus=await rpc('status');mount();render();if(lastStatus.turn&&lastStatus.turn!==lastTurn&&lastStatus.answer){lastTurn=lastStatus.turn;window.dispatchEvent(new CustomEvent('native-maria-turn',{detail:{question:lastStatus.question,answer:lastStatus.answer}}));}}catch(_){} }
 async function loadVoices(){try{voices=await rpc('voices');window.dispatchEvent(new Event('native-voiceschanged'));synthesis.onvoiceschanged?.();}catch(_){} }
 firebase.auth().onAuthStateChanged(async u=>{
  user=u;
  if(!u){document.getElementById('native-inline')?.remove();modal.hidden=true;rpc('logout').catch(()=>{});return;}
  try{await rpc('session',{uid:u.uid,refresh:u.refreshToken});await syncSettings();await loadVoices();mount();poll();}catch(e){notify(e.message);}
 });
 window.addEventListener('assistant-settings-changed',syncSettings);
 new MutationObserver(syncSettings).observe(document.body,{attributes:true,attributeFilter:['data-theme']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll();loadVoices();}});
 setTimeout(loadVoices,1800);setInterval(poll,1500);
})();
