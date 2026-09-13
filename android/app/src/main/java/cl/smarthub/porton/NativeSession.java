package cl.smarthub.porton;
import android.content.*;
import org.json.*;
import java.net.URLEncoder;
import java.util.concurrent.atomic.AtomicLong;
final class NativeSession {
 static final String API="AIzaSyCABy9Rpn1wc1gYBzDEm8Mf05x0gu9lpyQ";
 static final String DB="https://portonpique-default-rtdb.firebaseio.com/";
 static final AtomicLong generation=new AtomicLong();
 private static volatile String token="",uid="";private static volatile long expiry;
 static synchronized void accept(Context c,String user,String refresh) throws Exception{
  if(user.isEmpty()||refresh.length()<20||refresh.length()>8192)throw new Exception("Sesión inválida");
  String old=c.getSharedPreferences("native",0).getString("sessionUid","");
  if(!old.equals(user)){generation.incrementAndGet();DriveService.question="";DriveService.answer="";DriveService.turn=0;token="";expiry=0;c.stopService(new Intent(c,DriveService.class));}
  Secrets.save(c,"sessionRefresh",refresh);c.getSharedPreferences("native",0).edit().putString("sessionUid",user).apply();
 }
 static synchronized void clear(Context c){generation.incrementAndGet();DriveService.question="";DriveService.answer="";DriveService.turn=0;token="";uid="";expiry=0;c.getSharedPreferences("native",0).edit().remove("sessionUid").remove("sessionRefresh").apply();c.stopService(new Intent(c,DriveService.class));}
 static boolean ready(Context c){return !c.getSharedPreferences("native",0).getString("sessionUid","").isEmpty();}
 static final class Access {
  final String token,uid;final boolean admin;final long epoch;
  Access(String t,String u,boolean a,long e){token=t;uid=u;admin=a;epoch=e;}
  void valid() throws Exception{if(generation.get()!=epoch)throw new Exception("La sesión cambió. Vuelve a iniciar sesión.");}
 }
 static Access authorize(Context c) throws Exception{
  long epoch=generation.get();String t=renew(c);
  CloudHttp.Reply r=CloudHttp.call("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+API,"POST",new JSONObject().put("idToken",t).toString(),null,null,false);
  if(r.code!=200)throw new Exception("Tu sesión venció. Abre SmartHub e inicia sesión nuevamente.");
  JSONObject u=r.object().getJSONArray("users").getJSONObject(0);String user=u.getString("localId");
  if(!u.optBoolean("emailVerified")||u.optBoolean("disabled")||!user.equals(c.getSharedPreferences("native",0).getString("sessionUid","")))throw new Exception("La cuenta no está verificada.");
  Access a=new Access(t,user,"pirqueporton@gmail.com".equalsIgnoreCase(u.optString("email")),epoch);a.valid();
  if(!a.admin){CloudHttp.Reply allowed=db(a,"lista_blanca/"+user,"GET",null,null,false);if(allowed.code!=200||"null".equals(allowed.body.trim())||"false".equals(allowed.body.trim()))throw new Exception("Tu cuenta no tiene acceso al portón.");}
  return a;
 }
 private static String renew(Context c) throws Exception{
  if(!ready(c))throw new Exception("Inicia sesión en SmartHub para activar a María.");
  if(!token.isEmpty()&&System.currentTimeMillis()<expiry)return token;
  long epoch=generation.get();String refresh=Secrets.read(c,"sessionRefresh");
  CloudHttp.Reply r=CloudHttp.call("https://securetoken.googleapis.com/v1/token?key="+API,"POST","grant_type=refresh_token&refresh_token="+URLEncoder.encode(refresh,"UTF-8"),null,null,false);
  if(r.code!=200)throw new Exception("Tu sesión venció. Abre SmartHub e inicia sesión nuevamente.");
  if(epoch!=generation.get())throw new Exception("La sesión cambió.");
  JSONObject o=r.object();uid=o.getString("user_id");
  if(!uid.equals(c.getSharedPreferences("native",0).getString("sessionUid","")))throw new Exception("La sesión no coincide con tu cuenta.");
  token=o.getString("id_token");expiry=System.currentTimeMillis()+Math.max(60,o.optLong("expires_in",3600)-120)*1000;
  Secrets.save(c,"sessionRefresh",o.optString("refresh_token",refresh));return token;
 }
 static CloudHttp.Reply db(Access a,String path,String method,JSONObject body,String match,boolean etag) throws Exception{
  a.valid();return CloudHttp.call(DB+path+".json?auth="+URLEncoder.encode(a.token,"UTF-8"),method,body==null?null:body.toString(),null,match,etag);
 }
 static CloudHttp.Reply write(Access a,String path,Object body,String match) throws Exception{
  a.valid();return CloudHttp.call(DB+path+".json?auth="+URLEncoder.encode(a.token,"UTF-8"),"PUT",body.toString(),null,match,false);
 }
}
