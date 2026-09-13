package cl.smarthub.porton;
import android.content.Context;
import org.json.*;
import java.util.Locale;
final class NativeTools {
 final Context context;JSONObject pending;String pendingTag;long pendingUntil;boolean mutationAttempted;
 NativeTools(Context c){context=c==null?null:c.getApplicationContext();}
 static JSONObject ok(String text)throws JSONException{return new JSONObject().put("ok",true).put("mensaje",text);}
 static JSONObject stamp()throws JSONException{return new JSONObject().put(".sv","timestamp");}
 static void requireOK(CloudHttp.Reply r)throws Exception{if(r.code<200||r.code>=300)throw new Exception(r.code==401||r.code==403?"Tu cuenta no tiene permiso para esa acción.":"No pude confirmar la respuesta del sistema.");}
 static JSONObject object(CloudHttp.Reply r)throws Exception{requireOK(r);return "null".equals(r.body.trim())?new JSONObject():r.object();}
 JSONObject gate(NativeSession.Access a,boolean open)throws Exception{
  if(open&&mutationAttempted)return new JSONObject().put("ok",false).put("mensaje","Ya intenté enviar una orden en esta consulta. Revisa su resultado antes de repetirla.");
  CloudHttp.Reply r=NativeSession.db(a,"estado_porton","GET",null,null,true);JSONObject data=object(r);
  int connected=VoiceRules.connection(data.optLong("ultima_conexion"),r.now);
  if(!open)return new JSONObject().put("conectado",connected==0).put("verificado",connected!=2).put("mensaje",connected==0?"El portón está reportando conexión.":connected==1?"El portón no está reportando conexión.":"No pude verificar con certeza la conexión del portón.");
  if(connected==1)return new JSONObject().put("ok",false).put("mensaje","El portón no está reportando conexión. No puedo abrirlo y no envié ninguna orden.");
  if(connected!=0)return new JSONObject().put("ok",false).put("mensaje","No pude verificar la conexión del portón. No envié ninguna orden.");
  if(r.etag==null||r.etag.isEmpty())throw new Exception("No pude verificar el estado del portón. No envié la orden.");
  if(VoiceRules.recent(data.optLong("timestamp"),r.now))return new JSONObject().put("ok",false).put("mensaje","Ya se envió una orden hace unos segundos. Revisa el portón antes de repetirla.");
  data.put("comando","abrir_"+r.now).put("timestamp",stamp());
  CloudHttp.Reply sent;
  mutationAttempted=true;
  try{sent=NativeSession.write(a,"estado_porton",data,r.etag);}catch(Exception e){throw new Exception("No pude confirmar si la orden llegó al portón. Revisa antes de repetirla.");}
  if(sent.code==412)return new JSONObject().put("ok",false).put("mensaje","El estado del portón cambió. No envié otra orden; vuelve a consultar.");
  requireOK(sent);return ok("Envié la orden de apertura. No tengo un sensor que confirme que el portón se abrió.");
 }
 JSONObject call(String name,JSONObject in,NativeSession.Access a)throws Exception{
  a.valid();if(name.equals("abrir_porton"))return gate(a,true);if(name.equals("consultar_porton"))return gate(a,false);
  if(name.equals("consultar_clima"))return weather(in);
  if(!a.admin)throw new Exception("Tu cuenta solo tiene acceso al portón.");
  switch(name){
   case "consultar_riego":return irrigation(a);
   case "controlar_riego":return irrigationControl(a,in);
   case "actualizar_programacion_riego":return propose(a,in);
   case "navegar_modulo":{
    String module=VoiceRules.clean(in.optString("modulo"));String path=module.equals("riego")?"admin_riego.html":module.equals("porton")?"admin_porton.html":module.equals("inicio")?"admin_inicio.html":null;
    if(path==null)throw new Exception("Módulo no reconocido.");
    context.getSharedPreferences("native",0).edit().putString("nextPage",path).apply();return ok("El módulo quedará seleccionado al abrir SmartHub. Si el teléfono está bloqueado, debes desbloquearlo para verlo.");
   }
   default:throw new Exception("Esta función no está disponible.");
  }
 }
 JSONObject irrigation(NativeSession.Access a)throws Exception{
  JSONObject data=object(NativeSession.db(a,"modulo_riego","GET",null,null,false));JSONArray zones=data.optJSONArray("zones"),list=new JSONArray();if(zones==null)zones=new JSONArray();
  for(int i=0;i<zones.length();i++){JSONObject z=zones.optJSONObject(i);if(z==null)continue;JSONObject cfg=z.optJSONObject("config");if(cfg==null)cfg=new JSONObject();list.put(new JSONObject().put("nombre",z.optString("name")).put("valvula",valve(z,i)).put("dias",cfg.optJSONArray("dias")).put("hora",cfg.optString("hora")).put("duracion_min",cfg.optDouble("duracion",0)).put("aspersores",cfg.optInt("aspersores")).put("margen_seguridad_min",cfg.optInt("margen_seguridad")));}
  return new JSONObject().put("sectores",list).put("estado_actual",data.optJSONObject("estado_riego")).put("fecha_local",java.time.ZonedDateTime.now(java.time.ZoneId.of("America/Santiago")).toString()).put("dias_codificacion","0 domingo, 1 lunes, 2 martes, 3 miércoles, 4 jueves, 5 viernes, 6 sábado");
 }
 static int valve(JSONObject z,int i){JSONObject c=z.optJSONObject("config");if(c==null)return i+1;int v=c.optInt("valvula",0);if(v>=1&&v<=8)return v;int s=c.optInt("sector",-1);return s>=0&&s<8?s+1:i+1;}
 static int locate(JSONArray zones,JSONObject in)throws Exception{
  int v=in.optInt("valvula",0),found=-1;String sector=VoiceRules.clean(in.optString("sector"));
  for(int i=0;i<zones.length();i++){JSONObject z=zones.optJSONObject(i);if(z==null)continue;String n=VoiceRules.clean(z.optString("name"));if(v>0?valve(z,i)==v:!sector.isEmpty()&&(n.equals(sector)||n.contains(sector))){if(found>=0)throw new Exception("Hay más de un sector con ese nombre. Indica la válvula.");found=i;}}
  if(found<0)throw new Exception("No pude identificar el sector. Indica su nombre o válvula.");return found;
 }
 JSONObject irrigationControl(NativeSession.Access a,JSONObject in)throws Exception{
  String action=VoiceRules.clean(in.optString("accion"));if(!java.util.Arrays.asList("detener","pausar","continuar","manual").contains(action))throw new Exception("Acción de riego no válida.");
  JSONObject cmd=new JSONObject().put("accion",action).put("timestamp",stamp());
  if(action.equals("manual")){
   double minutes=in.optDouble("minutos",Double.NaN);if(!Double.isFinite(minutes)||minutes<1||minutes>120)throw new Exception("Dime cuántos minutos, entre uno y ciento veinte. Todavía no inicié el riego.");
   JSONObject data=object(NativeSession.db(a,"modulo_riego","GET",null,null,false));JSONArray zones=data.optJSONArray("zones");if(zones==null)throw new Exception("No hay sectores configurados.");int index=locate(zones,in),v=valve(zones.getJSONObject(index),index);if(v<1||v>8)throw new Exception("La válvula no es válida.");
   cmd.put("sector",v-1).put("minutos",minutes);
  }
  if(mutationAttempted)throw new Exception("Ya intenté enviar una orden. Revisa su resultado antes de repetirla.");mutationAttempted=true;
  try{requireOK(NativeSession.write(a,"modulo_riego/comando",cmd,null));}catch(Exception e){throw new Exception("No pude confirmar el envío de la orden de riego. Revisa su estado antes de repetirla.");}
  return ok("Orden de riego enviada: "+action+(action.equals("manual")?", por "+cmd.optDouble("minutos")+" minutos":"")+".");
 }
 JSONObject propose(NativeSession.Access a,JSONObject in)throws Exception{
  CloudHttp.Reply r=NativeSession.db(a,"modulo_riego/zones","GET",null,null,true);requireOK(r);JSONArray zones=new JSONArray(r.body);int i=locate(zones,in);JSONObject z=zones.getJSONObject(i),cfg=z.optJSONObject("config");if(cfg==null){cfg=new JSONObject();z.put("config",cfg);}
  if(in.has("hora")){String h=in.getString("hora");if(!h.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))throw new Exception("La hora debe ser válida.");cfg.put("hora",h);}
  if(in.has("duracion_min")){double m=in.getDouble("duracion_min");if(!Double.isFinite(m)||m<1||m>120)throw new Exception("La duración debe estar entre uno y ciento veinte minutos.");cfg.put("duracion",String.valueOf(m));}
  if(in.has("dias")){JSONArray days=in.getJSONArray("dias"),valid=new JSONArray();for(int j=0;j<days.length();j++){String d=String.valueOf(days.get(j));if(!d.matches("[0-6]"))throw new Exception("Día inválido.");valid.put(d);}cfg.put("dias",valid);}
  if(r.etag==null)throw new Exception("No pude preparar el cambio de programación.");
  pending=new JSONObject().put("zones",zones).put("epoch",a.epoch);pendingTag=r.etag;pendingUntil=android.os.SystemClock.elapsedRealtime()+60000;
  return new JSONObject().put("ok",false).put("pendiente_confirmacion",true).put("sector",z.optString("name")).put("programacion",cfg).put("mensaje","Cambio preparado, todavía no guardado. Para guardarlo, el usuario debe decir exactamente confirmar cambio en el próximo minuto.");
 }
 String confirm(NativeSession.Access a)throws Exception{
  JSONObject p=pending;pending=null;
  if(p==null||android.os.SystemClock.elapsedRealtime()>pendingUntil||p.optLong("epoch")!=a.epoch)throw new Exception("No hay un cambio pendiente vigente. Pídeme el cambio nuevamente.");
  if(!a.admin)throw new Exception("No tienes permiso para cambiar la programación.");
  CloudHttp.Reply r;try{r=NativeSession.write(a,"modulo_riego/zones",p.getJSONArray("zones"),pendingTag);}catch(Exception e){throw new Exception("No pude confirmar si se guardó el cambio. Revisa la programación antes de repetirlo.");}
  if(r.code==412)throw new Exception("La programación cambió desde que preparé el ajuste. Pídemelo nuevamente para revisar los datos actuales.");requireOK(r);return "Guardé el cambio de programación.";
 }
 JSONObject weather(JSONObject in)throws Exception{
  boolean city=VoiceRules.clean(in.optString("lugar")).equals("santiago");int days=Math.max(1,Math.min(7,in.optInt("dias",3)));
  String url="https://api.open-meteo.com/v1/forecast?latitude="+(city?"-33.4489":"-33.6357")+"&longitude="+(city?"-70.6693":"-70.5724")+"&timezone=America%2FSantiago&forecast_days="+days+"&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max";
  JSONObject data=object(CloudHttp.call(url,"GET",null,null,null,false));return data.put("lugar",city?"Santiago":"Pirque");
 }
}
