package cl.smarthub.porton;
import android.content.Context;
import android.media.AudioAttributes;
import android.os.*;
import android.speech.tts.*;
import org.json.*;
import java.util.*;
final class NativeSpeech {
 private static NativeSpeech instance;
 static synchronized NativeSpeech get(Context c){if(instance==null)instance=new NativeSpeech(c.getApplicationContext());return instance;}
 final Context context;final Handler handler=new Handler(Looper.getMainLooper());TextToSpeech tts;boolean ready;Runnable finished;String pending;long serial;
 NativeSpeech(Context c){context=c;tts=new TextToSpeech(c,status->{ready=status==TextToSpeech.SUCCESS;if(ready){tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());if(pending!=null){String p=pending;pending=null;say(p,finished);}}else complete();});
  tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){handler.post(()->{if(id.equals("maria-"+serial))complete();});}public void onError(String id){onDone(id);}});
 }
 JSONArray voices(){JSONArray a=new JSONArray();if(!ready)return a;Set<Voice> voices=tts.getVoices();if(voices==null)return a;for(Voice v:voices){if(!v.getLocale().getLanguage().equals("es"))continue;try{a.put(new JSONObject().put("name",v.getName()).put("voiceURI",v.getName()).put("lang",v.getLocale().toLanguageTag()).put("localService",!v.isNetworkConnectionRequired()));}catch(Exception ignored){}}return a;}
 void say(String text,Runnable done){
  // Replacing speech must release the previous listener as well.
  Runnable old=finished;finished=null;if(old!=null)old.run();finished=done;serial++;
  if(!ready){pending=text;handler.postDelayed(()->{if(!ready){pending=null;complete();}},5000);return;}
  tts.stop();String wanted=context.getSharedPreferences("native",0).getString("assistantVoice","");Voice selected=null;
  Set<Voice> list=tts.getVoices();if(list!=null)for(Voice v:list)if(v.getName().equals(wanted)&&v.getLocale().getLanguage().equals("es"))selected=v;
  if(selected!=null)tts.setVoice(selected);else tts.setLanguage(new Locale("es","CL"));
  tts.setSpeechRate(1f);tts.setPitch(1f);
  long id=serial;if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"maria-"+id)==TextToSpeech.ERROR){complete();return;}
  handler.postDelayed(()->{if(serial==id&&finished!=null){tts.stop();complete();}},Math.min(120000,Math.max(15000,text.length()*100L)));
 }
 void cancel(){serial++;pending=null;tts.stop();complete();}
 private void complete(){Runnable done=finished;finished=null;if(done!=null)done.run();}
}
