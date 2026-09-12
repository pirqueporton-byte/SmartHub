const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=1000, utterance, timers=[], messages=[];
const label={textContent:''},ui={dataset:{},querySelector:()=>label};
const document={hidden:false,getElementById:()=>ui,addEventListener(){}};
class Recognition {start(){this.onstart?.();this.onaudiostart?.();}abort(){this.onend?.();}}
const window={addEventListener(){},AssistantSettings:{name:()=> 'María',display:s=>s,strip:s=>s.replace(/maría/ig,''),invoked:s=>/maría/i.test(s),apply(){}},SpeechRecognition:Recognition,
 speechSynthesis:{cancel(){},resume(){},speak(u){utterance=u;}},MariaAI:{disponible:()=>true,procesar:async t=>{messages.push(t);return '¿Cuántos minutos?';}}};
const ctx={window,document,console,Date:{now:()=>now},SpeechSynthesisUtterance:class{constructor(t){this.text=t;}},setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cancelled=true;}};
let src=fs.readFileSync(__dirname+'/../voz.js','utf8');
src=src.replace('  window.iniciarAsistenteMaria = iniciarAsistenteMaria;', '  window.testVoice={MARIA,hablarRespuesta,ahoraConversando,abrirConversacion,cerrarConversacion};\n  window.iniciarAsistenteMaria = iniciarAsistenteMaria;');
vm.runInNewContext(src,ctx);
const v=window.testVoice;
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
(async()=>{
 window.iniciarAsistenteMaria();v.MARIA.recognition.start();
 await v.hablarRespuesta('¿Cuántos minutos?',{contexto:{tipo:'ia'}});
 utterance.onend();
 assert.equal(v.MARIA.pendingConversationMs,60000);
 assert.equal(v.MARIA.ui.dataset.state,'conectando');
 now+=65000; // Slow mobile microphone restart must not consume reply window.
 v.MARIA.recognition.start();
 assert(v.ahoraConversando());assert.equal(v.MARIA.ui.dataset.state,'conversando');
 assert.equal(v.MARIA.conversationUntil,now+60000);
 const result=t=>({results:[[{transcript:t}]]});
 v.MARIA.recognition.onresult(result('diez minutos'));
 v.MARIA.recognition.onresult(result('veinte minutos')); // Concurrent result ignored.
 await tick();
 assert.deepEqual(messages,['diez minutos']);assert(utterance.text.includes('minutos'));
 utterance.onend();v.MARIA.recognition.start();
 now+=61000;
 v.MARIA.recognition.onresult(result('treinta minutos'));await tick();assert.equal(messages.length,1);
 v.MARIA.recognition.onresult(result('María otra pregunta'));await tick();assert.equal(messages.length,2);
 utterance.onend();v.MARIA.recognition.start();
 v.MARIA.recognition.onresult(result('gracias'));await tick();utterance.onend();v.MARIA.recognition.start();
 assert(!v.ahoraConversando());
 console.log('PASS: reply without wake name, full window after delayed microphone startup, concurrent result exclusion, timeout, new invocation and explicit conversation end. No device writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
