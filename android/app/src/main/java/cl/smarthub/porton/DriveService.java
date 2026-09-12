package cl.smarthub.porton;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import android.speech.tts.*;
import android.media.*;
import org.json.*;
import org.vosk.*;
import org.vosk.android.*;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
public class DriveService extends Service implements RecognitionListener {
 public static volatile String status="Escucha detenida";
 private final Handler handler=new Handler(Looper.getMainLooper());
 private final AtomicBoolean busy=new AtomicBoolean(false);
 private Model model;private Recognizer recognizer;private SpeechService speech;
 private TextToSpeech tts;private boolean ttsReady=false,dead=false,starting=false;
 private PowerManager.WakeLock wake;private long lastRequest=0;
 private static final String CHANNEL="driving";
 @Override public void onCreate(){super.onCreate();
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Modo conducción",NotificationManager.IMPORTANCE_LOW));
  tts=new TextToSpeech(this,result->{ttsReady=result==TextToSpeech.SUCCESS;if(ttsReady)tts.setLanguage(new Locale("es","CL"));});
  tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){resumeAfterSpeech();}public void onError(String id){resumeAfterSpeech();}});
 }
 private Notification notification(){
  PendingIntent app=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,DriveService.class).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(cl.smarthub.porton.R.drawable.ic_gate).setContentTitle("SmartHub · modo conducción").setContentText(status).setContentIntent(app).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC).addAction(new Notification.Action.Builder(null,"Detener",stop).build()).build();
 }
 private void update(String text){status=text;if(!dead)getSystemService(NotificationManager.class).notify(14,notification());}
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&"STOP".equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
  if(starting)return START_NOT_STICKY;starting=true;
  status="Preparando reconocimiento local…";
  if(Build.VERSION.SDK_INT>=29)startForeground(14,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(14,notification());
  wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"SmartHub:driving");wake.acquire(2*60*60*1000L);
  handler.postDelayed(()->{update("Sesión terminada tras dos horas. Actívala de nuevo desde la app.");stopSelf();},2*60*60*1000L);
  StorageService.unpack(this,"model-es","model",m->{if(dead){m.close();return;}model=m;try{
   recognizer=new Recognizer(model,16000f);recognizer.setWords(true);
   speech=new SpeechService(recognizer,16000f);speech.startListening(this);
   update("Escuchando: «abre el portón»");say("Modo conducción activo. Puedes bloquear el teléfono y decir abre el portón.");
  }catch(Exception e){update("No pude iniciar el micrófono. Reabre SmartHub.");stopSelf();}},e->{update("No pude preparar la voz. Reabre SmartHub.");stopSelf();});
  return START_NOT_STICKY;
 }
 private void say(String text){
  if(dead)return;if(speech!=null)speech.setPause(true);
  if(ttsReady){tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"response");handler.removeCallbacks(resume);handler.postDelayed(resume,20000);}
  else{ToneGenerator tone=new ToneGenerator(AudioManager.STREAM_MUSIC,70);tone.startTone(ToneGenerator.TONE_PROP_ACK,200);handler.postDelayed(tone::release,400);handler.postDelayed(resume,500);}
 }
 private final Runnable resume=()->{if(!dead){if(speech!=null)speech.setPause(false);busy.set(false);}};
 private void resumeAfterSpeech(){handler.post(()->{handler.removeCallbacks(resume);handler.postDelayed(resume,450);});}
 private void receive(String json){
  if(dead||busy.get())return;
  try{JSONObject data=new JSONObject(json);String text=data.optString("text");
   if(Commands.stop(text)){stopSelf();return;}
   if(!Commands.open(text))return;
   JSONArray words=data.optJSONArray("result");if(words==null||words.length()<2)return;
   for(int i=0;i<words.length();i++)if(words.getJSONObject(i).optDouble("conf",0)<.8)return;
   long now=SystemClock.elapsedRealtime();if(now-lastRequest<10000||!busy.compareAndSet(false,true))return;lastRequest=now;
   if(speech!=null)speech.setPause(true);
   boolean verify=getSharedPreferences("native",0).getBoolean("test",true);
   update(verify?"Verificando sin abrir…":"Enviando orden de apertura…");
   new Thread(()->{String result;try{result=GateClient.request(this,verify);}catch(Exception e){result=verify?"No pude verificar la conexión. No envié ninguna orden.":"No pude confirmar el envío. Revisa el portón antes de repetir la orden.";}String answer=result;handler.post(()->{if(dead)return;update(answer);say(answer);});},"gate-request").start();
  }catch(JSONException ignored){}
 }
 @Override public void onResult(String s){receive(s);}
 @Override public void onFinalResult(String s){/* Never act on a service shutdown transcript. */}
 @Override public void onPartialResult(String s){}
 @Override public void onError(Exception e){update("Micrófono interrumpido. Abre SmartHub para reactivarlo.");stopSelf();}
 @Override public void onTimeout(){stopSelf();}
 @Override public IBinder onBind(Intent i){return null;}
 @Override public void onDestroy(){dead=true;handler.removeCallbacksAndMessages(null);
  if(speech!=null){speech.stop();speech.shutdown();}if(recognizer!=null)recognizer.close();if(model!=null)model.close();
  if(tts!=null){tts.stop();tts.shutdown();}if(wake!=null&&wake.isHeld())wake.release();status="Escucha detenida";super.onDestroy();
 }
}
