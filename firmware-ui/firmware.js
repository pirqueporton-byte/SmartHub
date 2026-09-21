/* Compilador y solicitud OTA autenticada; nunca envía firmware directamente al ESP32. */
'use strict';
const $=id=>document.getElementById(id);
const themes=['dark','grey','light'];
function aplicarTema(t){document.body.dataset.theme=t;localStorage.setItem('riegoTheme',t);}
function ciclarTema(){aplicarTema(themes[(themes.indexOf(document.body.dataset.theme)+1)%themes.length]);}
aplicarTema(localStorage.getItem('riegoTheme')||'dark');
const app=firebase.initializeApp({apiKey:'AIzaSyCABy9Rpn1wc1gYBzDEm8Mf05x0gu9lpyQ',authDomain:'portonpirque.firebaseapp.com',databaseURL:'https://portonpique-default-rtdb.firebaseio.com/',projectId:'portonpique'});
const auth=app.auth(),db=app.database();
function cerrarSesion(){auth.signOut().then(()=>location.href='index.html');}
const API=(window.SMARTHUB_FIRMWARE?.apiUrl||'').replace(/\/$/,'');
const phases={queued:'Preparando compilador…',preparing:'Preparando compilador…',installing_core:'Instalando ESP32 Core…',compiling:'Compilando…',generating:'Generando firmware…',checking_size:'Verificando tamaño…',hashing:'Calculando SHA-256…',success:'✓ Compilación correcta',failed:'Falló la compilación'};
let state={},firebaseConnected=false,clockOffset=0,current=null,pollTimer=null,busy=false,manifest=null,listenerInstalled=false;
function status(message,error=false){$('build-status').textContent=message;$('build-status').dataset.error=error;}
function canCompile(){return !!auth.currentUser && !!API && /^https:\/\//.test(API) && !!$('source').files[0] && !busy;}
function setBusy(value){busy=value;$('compile').disabled=!canCompile();$('source').disabled=value;$('progress').hidden=!value;renderOta();}
async function request(path,options={},type='json'){
 if(!API||!/^https:\/\//.test(API))throw new Error('Falta configurar la URL HTTPS del compilador.');
 if(!auth.currentUser)throw new Error('Inicia sesión en SmartHub.');
 const token=await auth.currentUser.getIdToken();
 const r=await fetch(API+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(path.endsWith('/install')?60000:30000)});
 if(!r.ok){let error;try{error=(await r.json()).error;}catch{}throw Object.assign(new Error(error||`El servicio respondió ${r.status}.`),{status:r.status});}
 return type==='blob'?r.blob():type==='text'?r.text():r.json();
}
function renderState(){
 let seen=Number(state.ultima_conexion);if(seen>0&&seen<1e11)seen*=1000;
 const age=Date.now()+clockOffset-seen,valid=Number.isFinite(seen)&&seen>0,online=firebaseConnected&&valid&&age>=-5000&&age<30000;
 $('online').textContent=!firebaseConnected?'Sin conexión al estado':online?'En línea':'Sin señal reciente';$('online').dataset.online=online;
 $('lastSeen').textContent=valid?age<0?'Hace unos segundos':age<60000?`Hace ${Math.floor(age/1000)} segundos`:new Date(seen).toLocaleString('es-CL'):'Sin datos';
 const yn=v=>typeof v==='boolean'?(v?'Conectado':'Desconectado'):'Sin datos';
 $('firmware').textContent=state.firmware||'Sin datos';$('wifi').textContent=yn(state.wifi);$('firebase').textContent=state.firebase===undefined?(online?'Heartbeat recibido':'Sin datos'):yn(state.firebase);
 $('rssi').textContent=typeof state.rssi==='number'?`${state.rssi} dBm`:'Sin datos';$('rollback').textContent=state.rollback||'Sin datos';$('ip').textContent=state.ip||'Sin datos';
 $('activity').textContent=state.pausa?'Pausado':state.regando?'Regando':typeof state.regando==='boolean'?'Inactivo':'Sin datos';
 $('uptime').textContent=typeof state.uptime==='number'?`${Math.floor(state.uptime/60000)} minutos`:'Sin datos';$('heap').textContent=typeof state.freeHeap==='number'?`${Math.round(state.freeHeap/1024)} KB`:'Sin datos';
 $('diagnostic-note').textContent=state.firmware?(online?'Diagnóstico recibido del dispositivo.':'El diagnóstico corresponde a la última conexión; no confirma el estado actual.'):'El firmware 1.5.0 original publica actividad y última conexión. Los demás campos requieren la ampliación de diagnóstico incluida.';
 const ip=String(state.ip||''),octets=ip.split('.');const safe=octets.length===4&&octets.every(n=>/^\d{1,3}$/.test(n)&&Number(n)<=255)&&ip!=='0.0.0.0';
 $('local-ota').hidden=!safe;if(safe)$('local-ota').href=`http://${ip}/actualizar`;
 $('device-setup').hidden=!safe;if(safe)$('device-setup').href=`http://${ip}/smarthub`;renderOta();
}
async function history(){try{const jobs=await request('/builds');$('history').replaceChildren();for(const j of jobs){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=`${j.version} · ${phases[j.status]||j.status}`;b.onclick=()=>{if(!busy){autoInstall=false;watch(j.id);}};li.append(b);$('history').append(li);}}catch(e){$('service-note').textContent=e.message;}}
async function watch(id){
 clearTimeout(pollTimer);current=id;manifest=null;$('result').hidden=true;$('logs').hidden=true;setBusy(true);
 async function poll(){if(current!==id||!auth.currentUser)return;
  try{const job=await request('/builds/'+id);status(phases[job.status]||job.status,job.status==='failed');
   if(job.status==='success'||job.status==='failed'){
    setBusy(false);manifest=job.manifest;
    if(job.status==='success'&&manifest){$('built-version').textContent=manifest.version;$('size').textContent=`${(manifest.size/1048576).toFixed(2)} MiB · ${manifest.size.toLocaleString('es-CL')} bytes`;$('sha').textContent=manifest.sha256;$('result').hidden=false;}
    if(job.error)status(job.error,true);
    try{$('log').textContent=await request('/builds/'+id+'/log',{},'text');$('logs').hidden=false;}catch(e){$('service-note').textContent=e.message;}
    await history();if(autoInstall && job.status==='success'){autoInstall=false;await installBuild(false);}else autoInstall=false;return;
   }
  }catch(e){if([401,403,404,410].includes(e.status)){autoInstall=false;setBusy(false);status(e.message,true);return;}status(`${e.message} Reintentando consulta…`,true);}
  pollTimer=setTimeout(poll,5000);
 }
 await poll();
}
$('source').onchange=()=>{$('filename').textContent=$('source').files[0]?.name||'Ningún archivo seleccionado';$('compile').disabled=!canCompile();renderOta();};
$('compile-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;autoInstall=e.submitter?.id==='compile-install';if(autoInstall&&(!otaReady()||!confirm('¿Compilar y solicitar la instalación de este archivo en Riego? Se instalará sólo cuando esté completamente inactivo.'))){autoInstall=false;return;}const file=$('source').files[0];
 if(!file||!file.name.toLowerCase().endsWith('.ino')||file.size>262144){autoInstall=false;status('Selecciona un .ino de hasta 256 KB.',true);return;}
 $('result').hidden=true;$('logs').hidden=true;setBusy(true);status('Subiendo fuente…');
 try{const j=await request('/builds',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Firmware-Device':'riego','X-Firmware-Filename':encodeURIComponent(file.name)},body:file});await watch(j.id);}
 catch(e){autoInstall=false;setBusy(false);status(e.message,true);await history();}
};
$('download').onclick=async()=>{
 $('download').disabled=true;
 try{
  const m=manifest;if(!m)throw new Error('Falta manifiesto.');
  const native=!!window.SmartHubAndroid;
  if(native){
   if(!window.SmartHubNative?.rpc)throw new Error('Espera a que la app termine de cargar y vuelve a intentarlo.');
   try{await SmartHubNative.rpc('firmware-capabilities');}catch{throw new Error('Actualiza la APK a 0.4.1 o posterior para guardar archivos. Mientras tanto, descarga desde la PWA.');}
  }
  status('Descargando y verificando el firmware…');
  const archive=await request('/builds/'+current+'/artifact',{},'blob');
  const blob=await firmwareFromArtifact(archive,m),name=`${m.version}.bin`;
  if(native){
   const bytes=new Uint8Array(await blob.arrayBuffer());
   await SmartHubNative.rpc('firmware-begin',{name,size:bytes.length,sha256:m.sha256});
   for(let offset=0;offset<bytes.length;offset+=12288){
    const base64=btoa(String.fromCharCode(...bytes.subarray(offset,offset+12288)));
    await SmartHubNative.rpc('firmware-chunk',{offset,base64});
   }
   status('Elige dónde guardar el archivo en Android…');
   await SmartHubNative.rpc('firmware-save');
   status('✓ Firmware guardado correctamente.');
  }else{
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status('Archivo enviado al navegador. Revisa Descargas.');
  }
 }catch(e){status(e.message,true);}finally{$('download').disabled=false;}
};
auth.onAuthStateChanged(async user=>{
 if(!user){clearTimeout(pollTimer);location.href='index.html';return;}
 if(user.email!=='pirqueporton@gmail.com'){clearTimeout(pollTimer);current=null;$('maintenance').hidden=true;$('access').hidden=false;$('access').textContent='Esta sección requiere una cuenta administradora.';return;}
 $('access').hidden=true;$('maintenance').hidden=false;
 if(!listenerInstalled){listenerInstalled=true;db.ref('.info/connected').on('value',s=>{firebaseConnected=s.val()===true;renderState();});db.ref('.info/serverTimeOffset').on('value',s=>{clockOffset=s.val()||0;});db.ref('modulo_riego/estado_riego').on('value',s=>{state=s.val()||{};renderState();},()=>{$('diagnostic-note').textContent='Firebase no permite leer el estado del riego.';});setInterval(renderState,1000);}
 if(!API){$('service-note').textContent='El administrador debe configurar la URL del compilador antes del primer uso.';return;}
 try{const jobs=await request('/builds');await history();const running=jobs.find(j=>!['success','failed'].includes(j.status));if(running)await watch(running.id);}catch(e){$('service-note').textContent=e.message;}
 $('compile').disabled=!canCompile();
});

let otaEnabled=false,otaJob=null,otaSending=false,autoInstall=false,otaTimer=null,otaError='';
const otaLabels={pending:'Pendiente: esperando un momento seguro',downloading:'Descargando firmware',verifying:'Verificando SHA-256',installing:'Instalando firmware',rebooting:'Reiniciando y validando',success:'✓ Firmware confirmado',failed:'La actualización falló',rollback:'Se recuperó el firmware anterior'};
function otaReady(){
 let seen=Number(state.ultima_conexion);if(seen>0&&seen<1e11)seen*=1000;
 return otaEnabled && firebaseConnected && state.otaProtocol===1 && state.otaReady===true && Date.now()+clockOffset-seen<30000 && Date.now()+clockOffset-seen>=-5000;
}
function renderOta(){
 // Called by initial auth/diagnostic callbacks only after script initialization.
 if(typeof otaEnabled==='undefined')return;
 const active=otaJob&&!['success','failed','rollback'].includes(otaJob.status)&&!otaJob.expired;
 $('compile-install').disabled=!canCompile()||!otaReady()||!!active||otaSending;
 $('install').disabled=!manifest||manifest.otaProtocol!==1||!otaReady()||!!active||otaSending||busy;
 $('ota-readiness').textContent=state.otaProtocol!==1?'Primero instala por OTA local el firmware con soporte de actualización remota.':state.otaReady!==true?'Configura la cuenta del ESP32 desde su conexión local.':!otaEnabled?'ESP32 identificado. Falta habilitar la instalación remota en Cloudflare.':!otaReady()?'Esperando una conexión reciente del ESP32.':'Riego preparado para recibir actualizaciones.';
 if(manifest && manifest.otaProtocol!==1 && otaReady())$('ota-readiness').textContent='Este archivo se puede descargar, pero no incluye el soporte OTA remota requerido para instalarlo desde aquí.';
 if(otaError){$('ota-status').textContent=otaError;return;}
 if(!otaJob)return;
 let stateName=otaJob.status,progress=otaJob.progress;
 if(active&&state.otaRequestId===otaJob.id&&['downloading','verifying','installing'].includes(state.otaStatus)){stateName=state.otaStatus;progress=state.otaProgress||progress;}
 $('ota-status').textContent=otaJob.expired?'La solicitud caducó; puedes volver a solicitarla.':otaLabels[stateName]||stateName;
 $('ota-progress').hidden=!active;$('ota-progress').value=Math.max(0,Math.min(100,progress||0));
 $('ota-detail').textContent=otaJob.message||'El resultado final se confirma después del reinicio y del control de rollback.';
}
async function refreshOta(){
 clearTimeout(otaTimer);if(!auth.currentUser||auth.currentUser.email!=='pirqueporton@gmail.com')return;
 try {const c=await request('/ota/capabilities');otaEnabled=c.enabled===true;if(otaEnabled)otaJob=await request('/ota/latest');renderOta();}
 catch(e){$('ota-detail').textContent=e.message;}
 otaTimer=setTimeout(refreshOta,otaJob&&!['success','failed','rollback'].includes(otaJob.status)?5000:30000);
}
async function installBuild(ask=true){
 if(otaSending||!manifest)return;
 if(!otaReady()){otaError='La compilación terminó, pero el ESP32 no tiene conexión reciente. Puedes instalarla cuando vuelva a estar disponible.';renderOta();return;}
 if(manifest.otaProtocol!==1){otaError='El archivo no incluye soporte OTA PULL; sólo se puede descargar para OTA local.';renderOta();return;}
 if(ask&&!confirm(`¿Instalar ${manifest.version} en Riego? El ESP32 esperará a estar inactivo. No desconectes su alimentación durante la instalación.`))return;
 const id=current;otaError='';otaSending=true;renderOta();$('ota-status').textContent='Verificando archivo y enviando solicitud…';
 try {await request('/builds/'+id+'/install',{method:'POST'});await refreshOta();}
 catch(e){otaError=e.message;}finally{otaSending=false;renderOta();}
}
$('install').onclick=()=>installBuild();
auth.onAuthStateChanged(user=>{if(user&&user.email==='pirqueporton@gmail.com')refreshOta();else clearTimeout(otaTimer);});
