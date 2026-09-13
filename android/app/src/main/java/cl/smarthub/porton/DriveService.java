package cl.smarthub.porton;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import android.media.*;
import org.json.*;
import org.vosk.*;
import org.vosk.android.*;
public class DriveService extends Service implements RecognitionListener {
 public static volatile String status="Micrófono apagado",phase="off";
 public static volatile boolean active=false;
 private static DriveService current;
 public static volatile String question="",answer="";public static volatile long turn;
 private long speechSequence;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private Model model;private Recognizer recognizer;private SpeechService speech;
 private PowerManager.WakeLock wake;private boolean dead,busy,starting;private long conversationUntil,lastHeard;private String previous="";
 private static final String CHANNEL="maria-listening",ATTENTION="maria-ready";
 String name(){return getSharedPreferences("native",0).getString("assistantName","María");}
 @Override public void onCreate(){super.onCreate();current=this;
  NotificationManager m=getSystemService(NotificationManager.class);
  m.createNotificationChannel(new NotificationChannel(CHANNEL,"Escucha de María",NotificationManager.IMPORTANCE_LOW));
  NotificationChannel attention=new NotificationChannel(ATTENTION,"María te escuchó",NotificationManager.IMPORTANCE_HIGH);attention.setSound(null,null);attention.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);m.createNotificationChannel(attention);
  NativeSpeech.get(this);
 }
 private PendingIntent app(){return PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 private Notification notification(){
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,DriveService.class).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_gate).setContentTitle(name()+" · escucha activa").setContentText(status).setContentIntent(app()).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC).addAction(new Notification.Action.Builder(null,"Apagar micrófono",stop).build()).build();
 }
 private void update(String state,String text){phase=state;status=text;if(!dead)getSystemService(NotificationManager.class).notify(14,notification());}
 private void cue(boolean announce){
  ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,60);tone.startTone(ToneGenerator.TONE_PROP_BEEP,100);handler.postDelayed(tone::release,250);
  if(announce)getSystemService(NotificationManager.class).notify(15,new Notification.Builder(this,ATTENTION).setSmallIcon(R.drawable.ic_gate).setContentTitle(name()+" · te escucho").setContentText("Puedes continuar hablando").setContentIntent(app()).setVisibility(Notification.VISIBILITY_PUBLIC).setTimeoutAfter(4000).setAutoCancel(true).build());
 }
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&"STOP".equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
  if(starting)return START_NOT_STICKY;starting=true;active=true;phase="starting";status="Preparando el micrófono…";
  if(Build.VERSION.SDK_INT>=29)startForeground(14,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(14,notification());
  if(!NativeSession.ready(this)){update("error","Inicia sesión en SmartHub para activar la voz");stopSelf();return START_NOT_STICKY;}
  wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"SmartHub:maria");wake.acquire(2*60*60*1000L);
  handler.postDelayed(()->{say("Terminé la escucha después de dos horas. Puedes activarla otra vez desde SmartHub.",false,true);},2*60*60*1000L);
  StorageService.unpack(this,"model-es","model",m->{if(dead){m.close();return;}model=m;try{
   recognizer=new Recognizer(model,16000f);recognizer.setWords(true);speech=new SpeechService(recognizer,16000f);speech.startListening(this);
   say("Soy "+name()+". Puedes bloquear el teléfono y decir mi nombre para hablar conmigo.",false,false);
  }catch(Exception e){update("error","No pude iniciar el micrófono");stopSelf();}},e->{update("error","No pude preparar el reconocimiento de voz");stopSelf();});
  return START_NOT_STICKY;
 }
 static void speakFromApp(Context context,String text,Runnable done){
  if(current!=null&&!current.dead){DriveService service=current;long sequence=++service.speechSequence;service.busy=true;if(service.speech!=null)service.speech.setPause(true);service.update("speaking","Respondiendo…");
   NativeSpeech.get(context).say(text,()->{if(!service.dead&&sequence==service.speechSequence){service.busy=false;if(service.speech!=null){service.speech.reset();service.speech.setPause(false);}service.update("listening","Di "+service.name()+" para comenzar");}done.run();});
  }else NativeSpeech.get(context).say(text,done);
 }
 private void say(String text,boolean follow,boolean stopAfter){
  if(dead)return;long sequence=++speechSequence;busy=true;if(speech!=null)speech.setPause(true);update("speaking","Respondiendo…");
  NativeSpeech.get(this).say(text,()->handler.postDelayed(()->{
   if(dead||sequence!=speechSequence)return;if(stopAfter){stopSelf();return;}
   if(follow)conversationUntil=SystemClock.elapsedRealtime()+60000;else conversationUntil=0;
   busy=false;if(speech!=null){speech.reset();speech.setPause(false);}
   update(follow?"ready":"listening",follow?"Te escucho · continúa sin repetir mi nombre":"Di "+name()+" para comenzar");if(follow){cue(true);handler.postDelayed(()->{if(!dead&&!busy&&SystemClock.elapsedRealtime()>=conversationUntil)update("listening","Di "+name()+" para comenzar");},60000);}
  },400));
 }
 private void receive(String json){
  if(dead||busy)return;
  try{JSONObject data=new JSONObject(json);String original=data.optString("text"),text=VoiceRules.clean(original);if(text.isEmpty())return;
   JSONArray words=data.optJSONArray("result");if(words==null||words.length()==0)return;double sum=0;for(int i=0;i<words.length();i++)sum+=words.getJSONObject(i).optDouble("conf");if(sum/words.length()<.78)return;
   long now=SystemClock.elapsedRealtime();if(text.equals(previous)&&now-lastHeard<3000)return;previous=text;lastHeard=now;
   boolean called=VoiceRules.invoked(text,name()),follow=now<conversationUntil;
   if(called)text=VoiceRules.strip(text,name());
   if(!called&&!follow&&!VoiceRules.open(text)&&!VoiceRules.stop(text))return;
   if(VoiceRules.stop(text)){say("Apagué el micrófono.",false,true);return;}
   if(VoiceRules.end(text)){say("De acuerdo.",false,false);return;}
   if(text.isEmpty()){say("Sí, te escucho.",true,false);return;}
   busy=true;if(speech!=null)speech.setPause(true);cue(false);update("thinking","Consultando SmartHub…");
   question=text;MariaEngine.get(this).ask(text,result->{if(!dead){answer=result;turn=System.currentTimeMillis();say(result,true,false);}});
  }catch(JSONException ignored){}
 }
 @Override public void onResult(String s){handler.post(()->receive(s));}
 @Override public void onFinalResult(String s){}
 @Override public void onPartialResult(String s){}
 @Override public void onError(Exception e){handler.post(()->{update("error","Micrófono interrumpido. Actívalo desde SmartHub.");stopSelf();});}
 @Override public void onTimeout(){stopSelf();}
 @Override public IBinder onBind(Intent i){return null;}
 @Override public void onDestroy(){dead=true;active=false;current=null;handler.removeCallbacksAndMessages(null);
  if(speech!=null){speech.stop();speech.shutdown();}if(recognizer!=null)recognizer.close();if(model!=null)model.close();
  NativeSpeech.get(this).cancel();if(wake!=null&&wake.isHeld())wake.release();if(!phase.equals("error")){phase="off";status="Micrófono apagado";}getSystemService(NotificationManager.class).cancel(15);super.onDestroy();
 }
}
