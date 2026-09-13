package cl.smarthub.porton;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import org.json.*;
final class CloudHttp {
 interface Transport {Reply call(String url,String method,String body,String bearer,String match,boolean etag)throws Exception;}
 static Transport testTransport;
 static final class Reply {
  int code;String body,etag;long now;
  JSONObject object() throws JSONException{return new JSONObject(body);}
 }
 static Reply call(String url,String method,String body,String bearer,String match,boolean etag) throws Exception{
  if(testTransport!=null)return testTransport.call(url,method,body,bearer,match,etag);
  HttpsURLConnection c=(HttpsURLConnection)new URL(url).openConnection();
  c.setConnectTimeout(10000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setRequestMethod(method);
  c.setRequestProperty("Cache-Control","no-cache");
  if(url.equals("https://smarthub-maria-ai.pirqueporton.workers.dev/chat"))c.setRequestProperty("Origin","https://pirqueporton-byte.github.io");
  if(bearer!=null)c.setRequestProperty("Authorization","Bearer "+bearer);
  if(etag)c.setRequestProperty("X-Firebase-ETag","true");
  if(match!=null)c.setRequestProperty("If-Match",match);
  try{
   if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type",url.startsWith("https://securetoken.googleapis.com/")?"application/x-www-form-urlencoded":"application/json");try(var out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
   Reply r=new Reply();r.code=c.getResponseCode();r.etag=c.getHeaderField("ETag");
   try{r.now=ZonedDateTime.parse(c.getHeaderField("Date"),DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli();}catch(Exception ignored){}
   java.io.InputStream in=r.code<400?c.getInputStream():c.getErrorStream();if(in==null)throw new java.io.IOException("Sin respuesta");
   try(in){var bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>1024*1024)throw new java.io.IOException("Respuesta demasiado grande");bytes.write(buffer,0,n);}r.body=bytes.toString("UTF-8");}
   if(r.code>=300&&r.code<400)throw new java.io.IOException("Redirección bloqueada");return r;
  }finally{c.disconnect();}
 }
}
