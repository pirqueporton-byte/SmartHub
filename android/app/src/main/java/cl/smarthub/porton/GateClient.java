package cl.smarthub.porton;
import android.content.Context;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.io.InputStream;
import org.json.JSONObject;
final class GateClient {
 static String request(Context context,boolean verify) throws Exception {
  String base=context.getSharedPreferences("native",0).getString("endpoint","");
  if(!Commands.validEndpoint(base))return "Configura la dirección de conexión en SmartHub.";
  String token=Secrets.read(context);
  HttpsURLConnection c=(HttpsURLConnection)new URL(base.replaceAll("/$","")+(verify?"/verificar":"/abrir")).openConnection();
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setRequestMethod("POST");c.setDoOutput(true);
  c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Authorization","Bearer "+token);
  try {
   try(var out=c.getOutputStream()){out.write((verify?"{}":"{\"accion\":\"abrir\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8));}
   int code=c.getResponseCode();InputStream in=code<400?c.getInputStream():c.getErrorStream();
   if(in==null)return "La conexión no devolvió una respuesta válida.";
   try(in){java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buf=new byte[1024];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>8192)throw new java.io.IOException();bytes.write(buf,0,n);}String body=new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);return new JSONObject(body).optString("mensaje","No pude confirmar el resultado.");}
  } finally {c.disconnect();}
 }
}
