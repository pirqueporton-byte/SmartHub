package cl.smarthub.porton;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.*;
import java.util.concurrent.Executors;
final class MariaEngine {
 interface Done {void done(String answer);}
 private static MariaEngine instance;
 static synchronized MariaEngine get(Context c){if(instance==null)instance=new MariaEngine(c);return instance;}
 final Context context;final NativeTools tools;final java.util.concurrent.ExecutorService queue=Executors.newSingleThreadExecutor();
 private JSONArray history=new JSONArray();private long historyEpoch=-1;
 private MariaEngine(Context c){context=c.getApplicationContext();tools=new NativeTools(context);}
 void clear(){queue.execute(()->{history=new JSONArray();tools.pending=null;});}
 void ask(String input,Done callback){
  queue.execute(()->{String answer;long epoch=NativeSession.generation.get();
   try{if(input==null||input.trim().isEmpty()||input.length()>4000)throw new Exception("Dime una pregunta más breve.");answer=process(input.trim());}
   catch(java.io.IOException e){history=new JSONArray();answer="No pude conectar con SmartHub. No puedo confirmar el estado de los equipos.";}
   catch(Exception e){history=new JSONArray();answer=e.getMessage()==null?"No pude completar la consulta.":e.getMessage();}
   if(NativeSession.generation.get()!=epoch)answer="La sesión cambió. Abre SmartHub para continuar.";
   String result=answer;new Handler(Looper.getMainLooper()).post(()->callback.done(result));
  });
 }
 private String process(String text)throws Exception{
  NativeSession.Access a=NativeSession.authorize(context);tools.mutationAttempted=false;
  if(historyEpoch!=a.epoch){historyEpoch=a.epoch;history=new JSONArray();tools.pending=null;}
  String clean=VoiceRules.clean(text);
  if(clean.equals("confirmar cambio"))return tools.confirm(a);
  if(clean.equals("cancelar cambio")){tools.pending=null;return "Cancelé el cambio pendiente.";}
  if(VoiceRules.open(clean))return tools.gate(a,true).getString("mensaje");
  if(clean.equals("estado del porton")||clean.equals("esta conectado el porton")||clean.equals("el porton esta en linea"))return tools.gate(a,false).getString("mensaje");
  String name=context.getSharedPreferences("native",0).getString("assistantName","María");
  history.put(new JSONObject().put("role","user").put("content","[Tu nombre es "+name+". Responde en español de Chile, breve para voz. No digas que una acción se completó si una herramienta no lo confirmó. Si falta el tiempo de riego, pregúntalo. Los cambios de programación requieren que el usuario diga confirmar cambio.]\n"+text));
  for(int round=0;round<5;round++){
   a.valid();CloudHttp.Reply r=CloudHttp.call("https://smarthub-maria-ai.pirqueporton.workers.dev/chat","POST",new JSONObject().put("messages",history).toString(),a.token,null,false);
   if(r.code==401||r.code==403)throw new Exception("Tu cuenta no tiene acceso a esta función de María. Puedes pedir abrir el portón si tienes permiso.");
   if(r.code!=200)throw new Exception("María no pudo responder ahora. Inténtalo más tarde.");
   JSONArray content=r.object().getJSONArray("content");history.put(new JSONObject().put("role","assistant").put("content",content));JSONArray results=new JSONArray();StringBuilder words=new StringBuilder();
   for(int i=0;i<content.length();i++){
    JSONObject block=content.getJSONObject(i);String type=block.optString("type");if(type.equals("text")){words.append(block.optString("text")).append(' ');continue;}if(!type.equals("tool_use"))continue;
    JSONObject result=new JSONObject().put("type","tool_result").put("tool_use_id",block.getString("id"));
    try{String tool=block.getString("name");JSONObject args=block.optJSONObject("input");result.put("content",tools.call(tool,args==null?new JSONObject():args,a).toString());}
    catch(Exception e){result.put("is_error",true).put("content",e instanceof java.io.IOException?"No pude verificar la respuesta del sistema.":String.valueOf(e.getMessage()));}
    results.put(result);
   }
   if(results.length()==0){trim();String out=words.toString().trim();return out.isEmpty()?"No recibí una respuesta. Pregúntame nuevamente.":out;}
   history.put(new JSONObject().put("role","user").put("content",results));
  }
  history=new JSONArray();throw new Exception("Necesité demasiados pasos. Dime una acción a la vez.");
 }
 private void trim()throws JSONException{
  if(history.length()<=12)return;int start=history.length()-12;
  while(start<history.length()-1){JSONObject m=history.getJSONObject(start);if(m.optString("role").equals("user")&&m.opt("content") instanceof String)break;start++;}
  JSONArray next=new JSONArray();for(int i=start;i<history.length();i++)next.put(history.get(i));history=next;
 }
}
