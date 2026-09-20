/* Sólo consultas Firebase y peticiones autenticadas al compilador. No emite órdenes OTA. */
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
function setBusy(value){busy=value;$('compile').disabled=!canCompile();$('source').disabled=value;$('progress').hidden=!value;}
async function request(path,options={},type='json'){
 if(!API||!/^https:\/\//.test(API))throw new Error('Falta configurar la URL HTTPS del compilador.');
 if(!auth.currentUser)throw new Error('Inicia sesión en SmartHub.');
 const token=await auth.currentUser.getIdToken();
 const r=await fetch(API+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(30000)});
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
}
async function history(){try{const jobs=await request('/builds');$('history').replaceChildren();for(const j of jobs){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=`${j.version} · ${phases[j.status]||j.status}`;b.onclick=()=>{if(!busy)watch(j.id);};li.append(b);$('history').append(li);}}catch(e){$('service-note').textContent=e.message;}}
async function watch(id){
 clearTimeout(pollTimer);current=id;manifest=null;$('result').hidden=true;$('logs').hidden=true;setBusy(true);
 async function poll(){if(current!==id||!auth.currentUser)return;
  try{const job=await request('/builds/'+id);status(phases[job.status]||job.status,job.status==='failed');
   if(job.status==='success'||job.status==='failed'){
    setBusy(false);manifest=job.manifest;
    if(job.status==='success'&&manifest){$('built-version').textContent=manifest.version;$('size').textContent=`${(manifest.size/1048576).toFixed(2)} MiB · ${manifest.size.toLocaleString('es-CL')} bytes`;$('sha').textContent=manifest.sha256;$('result').hidden=false;}
    if(job.error)status(job.error,true);
    try{$('log').textContent=await request('/builds/'+id+'/log',{},'text');$('logs').hidden=false;}catch(e){$('service-note').textContent=e.message;}
    await history();return;
   }
  }catch(e){if([401,403,404,410].includes(e.status)){setBusy(false);status(e.message,true);return;}status(`${e.message} Reintentando consulta…`,true);}
  pollTimer=setTimeout(poll,5000);
 }
 await poll();
}
$('source').onchange=()=>{$('filename').textContent=$('source').files[0]?.name||'Ningún archivo seleccionado';$('compile').disabled=!canCompile();};
$('compile-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const file=$('source').files[0];
 if(!file||!file.name.toLowerCase().endsWith('.ino')||file.size>262144){status('Selecciona un .ino de hasta 256 KB.',true);return;}
 $('result').hidden=true;$('logs').hidden=true;setBusy(true);status('Subiendo fuente…');
 try{const j=await request('/builds',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Firmware-Device':'riego','X-Firmware-Filename':encodeURIComponent(file.name)},body:file});await watch(j.id);}
 catch(e){setBusy(false);status(e.message,true);await history();}
};
$('download').onclick=async()=>{
 $('download').disabled=true;
 try{const m=manifest;if(!m)throw new Error('Falta manifiesto.');const archive=await request('/builds/'+current+'/artifact',{},'blob');
 const blob=await firmwareFromArtifact(archive,m);
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${m.version}.bin`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
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
