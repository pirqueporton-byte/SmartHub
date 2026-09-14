(() => {
 'use strict';
 const endpoint='https://smarthub-siri.pirqueporton.workers.dev';
 const el=id=>document.getElementById(id);
 try{const theme=localStorage.getItem('riegoTheme');if(['dark','grey'].includes(theme))document.body.dataset.theme=theme;}catch(_){}
 firebase.initializeApp({apiKey:'AIzaSyCABy9Rpn1wc1gYBzDEm8Mf05x0gu9lpyQ',authDomain:'portonpique.firebaseapp.com',projectId:'portonpique'});
 const auth=firebase.auth();let user=null,epoch=0,busy=false,pair=null,pendingRevoke=null;
 const status=message=>{el('status').textContent=message;};
 function clearCode(){pair=null;el('code').value='';el('pair').hidden=true;}
 async function api(path,data,withAuth=true){
  const who=user,version=epoch,headers={};
  if(withAuth){if(!who)throw Error('Inicia sesión en SmartHub.');headers.Authorization='Bearer '+await who.getIdToken();}
  if(data!==undefined)headers['Content-Type']='application/json';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const r=await fetch(endpoint+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   const result=await r.json();
   if(version!==epoch)throw Error('La sesión cambió.');
   if(!r.ok)throw Error(result.mensaje||'No se pudo conectar con Siri.');return result;
  }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('No se pudo contactar al servicio de Siri. Tu acceso habitual a SmartHub sigue disponible.');throw e;}
  finally{clearTimeout(timer);}
 }
 async function action(fn){if(busy)return;busy=true;for(const id of ['generate','check','retry','confirm-revoke'])el(id).disabled=true;
  try{await fn();}catch(e){status(e.message);}
  finally{busy=false;for(const id of ['generate','check','retry','confirm-revoke'])el(id).disabled=false;}
 }
 function renderLinks(links){
  el('links').replaceChildren();el('devices').hidden=!links.length;
  for(const link of links){
   const row=document.createElement('div');row.className='link-row';
   const name=document.createElement('strong');name.textContent=link.label;
   const info=document.createElement('p');info.className='muted';info.textContent='Vinculado el '+new Date(link.created).toLocaleDateString('es-CL')+' · Renovar antes del '+new Date(link.expires).toLocaleDateString('es-CL');
   const button=document.createElement('button');button.className='secondary';button.textContent='Desvincular';
   button.onclick=()=>{pendingRevoke=link.id;el('revoke-dialog').showModal();};row.append(name,info,button);el('links').append(row);
  }
 }
 async function check(){
  const r=await api('/v1/status',{});renderLinks(r.links);
  if(pair&&r.links.some(x=>x.id===pair.id)){clearCode();status('Siri vinculado. Ya puedes usar el atajo «Abre el portón».');}
  else status(pair?'Aún no recibimos la vinculación. Pega el código en el atajo y vuelve a comprobar.':r.mensaje);
 }
 async function load(){
  el('setup').hidden=true;el('retry').hidden=false;
  const config=await api('/v1/config',undefined,false);
  if(config.ready&&/^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i.test(config.shortcut_url)){
   el('install').href=config.shortcut_url;el('setup').hidden=false;
  }else status('La conexión con Siri está en preparación. Aún no necesitas generar códigos.');
  if(user){try{await check();if(!config.ready)status('La conexión con Siri está en preparación. Tus vinculaciones existentes aparecen abajo.');}catch(e){if(config.ready)throw e;}}
 }
 el('login').onclick=()=>action(async()=>{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());});
 el('generate').onclick=()=>action(async()=>{
  if(!user)return;clearCode();
  const r=await api('/v1/pair/start',{label:el('label').value,refresh_token:user.refreshToken});
  pair={id:r.id,expires:r.expires};el('code').value=r.code;el('pair').hidden=false;status(r.mensaje);tick();
 });
 el('copy').onclick=async()=>{if(!el('code').value)return;try{await navigator.clipboard.writeText(el('code').value);el('copy').textContent='Código copiado';}catch(_){el('code').focus();el('code').select();status('Mantén pulsado el código para copiarlo.');}};
 el('check').onclick=()=>action(check);el('retry').onclick=()=>action(load);
 el('cancel-revoke').onclick=()=>el('revoke-dialog').close();
 el('confirm-revoke').onclick=()=>action(async()=>{const id=pendingRevoke;el('revoke-dialog').close();if(!id)return;await api('/v1/revoke',{id});await check();status('Vinculación eliminada. Ese atajo ya no puede enviar órdenes.');});
 function tick(){if(!pair)return;const seconds=Math.ceil((pair.expires-Date.now())/1000);if(seconds<=0){clearCode();status('El código venció. Genera otro si aún no vinculaste el atajo.');}else el('expires').textContent='Vence en '+Math.ceil(seconds/60)+' min. No compartas este código con otras personas.';}
 setInterval(tick,1000);
 auth.onAuthStateChanged(next=>{
  epoch++;user=next;clearCode();renderLinks([]);el('setup').hidden=true;el('revoke-dialog').close();pendingRevoke=null;
  el('login').hidden=!!next;el('admin-help').hidden=next?.email!=='pirqueporton@gmail.com';
  el('back').href=next?(next.email==='pirqueporton@gmail.com'?'admin_porton.html':'usuario.html'):'index.html';
  if(!next){status('Inicia sesión con la misma cuenta que utilizas para abrir el portón.');el('retry').hidden=true;return;}
  load().catch(e=>status(e.message));
 });
 window.addEventListener('pagehide',()=>{clearCode();el('copy').textContent='Copiar código';});
})();
