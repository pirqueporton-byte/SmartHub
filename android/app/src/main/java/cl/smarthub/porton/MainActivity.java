package cl.smarthub.porton;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import androidx.credentials.*;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.webkit.*;
import com.google.android.libraries.identity.googleid.*;
import org.json.JSONObject;
import java.util.Collections;

/** Hosts the existing SmartHub pages. Google account selection is always native. */
public class MainActivity extends Activity {
 private static final String ORIGIN="https://pirqueporton-byte.github.io";
 private static final String HOME=ORIGIN+"/SmartHub/";
 private WebView web;
 private TextView state;
 private CancellationSignal loginCancellation;
 private boolean loggingIn;
 private long navigation;
 private ValueCallback<Uri[]> files;
 private boolean resumed,pendingStart;
 private FirmwareBuffer firmwareBuffer;
 private byte[] firmwareBytes;
 private JavaScriptReplyProxy firmwareReply;
 private String firmwareReplyId;
 private boolean savingFirmware;
 private void cancelFirmware(){
  firmwareBuffer=null;firmwareBytes=null;
  if(firmwareReply!=null)answer(firmwareReply,firmwareReplyId,false,"Guardado cancelado.");
  firmwareReply=null;firmwareReplyId=null;
 }
 private LinearLayout root;
 static boolean trusted(String url){
  if(url==null)return false;
  Uri u=Uri.parse(url);
  return "https".equals(u.getScheme())&&"pirqueporton-byte.github.io".equals(u.getHost())
    &&u.getPort()==-1&&u.getUserInfo()==null&&u.getPath()!=null&&u.getPath().startsWith("/SmartHub/");
 }
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
  setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
  root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(android.graphics.Color.rgb(18,20,24));
  root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  state=new TextView(this);state.setPadding(24,16,24,16);state.setTextColor(android.graphics.Color.WHITE);state.setBackgroundColor(android.graphics.Color.rgb(40,44,50));state.setVisibility(android.view.View.GONE);root.addView(state);
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  NativeSpeech.get(this);
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
   state.setVisibility(android.view.View.VISIBLE);state.setText("Actualiza Android System WebView para usar SmartHub");return;
  }
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptCookie(true);
  WebViewCompat.addWebMessageListener(web,"SmartHubAndroid",Collections.singleton(ORIGIN),(view,message,origin,main,reply)->{
   if(!main||!ORIGIN.equals(origin.toString())||!trusted(view.getUrl()))return;
   if("google-login".equals(message.getData()))googleLogin(reply);
   else nativeMessage(message.getData(),reply);
  });
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
    if(!request.isForMainFrame())return false;
    if(trusted(request.getUrl().toString()))return false;
    state.setText("Enlace externo: abre SmartHub desde tu navegador para visitarlo");return true;
   }
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){navigation++;cancelFirmware();state.setVisibility(android.view.View.GONE);}
   @Override public void onPageFinished(WebView v,String url){
    if(!trusted(url))return;
    state.setVisibility(android.view.View.GONE);
    // Inject no credentials into a URL, history, preferences or logs. The reply belongs to the requesting frame.
    try(java.io.InputStream in=getAssets().open("native-shell.js")){
     java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);
     v.evaluateJavascript(bytes.toString("UTF-8"),null);
    }catch(Exception e){state.setVisibility(android.view.View.VISIBLE);state.setText("No pude preparar el asistente. Vuelve a abrir SmartHub.");}

   }
   @Override public void onReceivedError(WebView v,WebResourceRequest req,WebResourceError err){if(req.isForMainFrame()){state.setVisibility(android.view.View.VISIBLE);state.setText("Sin conexión · toca para reintentar");state.setOnClickListener(w->web.loadUrl(HOME));}}
   @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();state.setVisibility(android.view.View.VISIBLE);state.setText("No se pudo verificar la conexión segura");}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){
    if(!trusted(url)){result.cancel();return true;}
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmar",(d,w)->result.confirm()).setNegativeButton("Cancelar",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
   }
   @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){
    if(!trusted(url)){result.cancel();return true;}
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Aceptar",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
   }

   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
    if(!trusted(v.getUrl()))return false;
    if(files!=null)files.onReceiveValue(null);files=callback;
    try{startActivityForResult(params.createIntent(),51);}catch(ActivityNotFoundException e){files.onReceiveValue(null);files=null;}
    return true;
   }
  });
  web.loadUrl(HOME);
  CrashReport.showPrevious(this);
 }
 private void answer(JavaScriptReplyProxy reply,String id,Object value,String error){
  runOnUiThread(()->{try{org.json.JSONObject out=new org.json.JSONObject().put("id",id);if(error!=null)out.put("error",error);else out.put("value",value);reply.postMessage(out.toString());}catch(Exception ignored){}});
 }
 private void nativeMessage(String raw,JavaScriptReplyProxy reply){
  if(raw==null||raw.length()>24000)return;String id="";
  try{
   org.json.JSONObject data=new org.json.JSONObject(raw);id=data.optString("id");if(!id.matches("[0-9]{1,12}"))return;final String key=id;
   if(data.optString("type").startsWith("firmware-")) {
    try { firmwareMessage(data,reply,id); }
    catch(Exception e){cancelFirmware();answer(reply,id,null,"No se pudo guardar el firmware. Vuelve a descargarlo.");}
    return;
   }
   switch(data.optString("type")){
    case "session":NativeSession.accept(this,data.getString("uid"),data.getString("refresh"));answer(reply,id,true,null);break;
    case "logout":NativeSession.clear(this);MariaEngine.get(this).clear();answer(reply,id,true,null);break;
    case "status":{
     String next=getSharedPreferences("native",0).getString("nextPage","");
     if(resumed&&!next.isEmpty()){getSharedPreferences("native",0).edit().remove("nextPage").apply();if(java.util.Arrays.asList("admin_riego.html","admin_porton.html","admin_inicio.html").contains(next))web.loadUrl(HOME+next);}
     answer(reply,id,new org.json.JSONObject().put("active",DriveService.active).put("phase",DriveService.phase).put("status",DriveService.status).put("session",NativeSession.ready(this)).put("question",DriveService.question).put("answer",DriveService.answer).put("turn",DriveService.turn),null);break;
    }
    case "settings":{
     String name=data.optString("name","María").trim();if(name.isEmpty()||name.length()>30)throw new Exception();
     String voice=data.optString("voice");if(voice.length()>200)throw new Exception();
     getSharedPreferences("native",0).edit().putString("assistantName",name).putString("assistantVoice",voice).apply();
     boolean light="light".equals(data.optString("theme"));root.setBackgroundColor(light?android.graphics.Color.rgb(245,247,250):"grey".equals(data.optString("theme"))?android.graphics.Color.rgb(32,33,36):android.graphics.Color.rgb(18,20,24));
     getWindow().getDecorView().setSystemUiVisibility(light?android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0);
     answer(reply,id,true,null);break;
    }
    case "listen":if(data.optBoolean("enabled"))startListening();else stopService(new Intent(this,DriveService.class));answer(reply,id,true,null);break;
    case "voices":answer(reply,id,NativeSpeech.get(this).voices(),null);break;
    case "ask":MariaEngine.get(this).ask(data.getString("text"),text->answer(reply,key,text,null));break;
    case "clear":MariaEngine.get(this).clear();answer(reply,id,true,null);break;
    case "speak":{
     String text=data.getString("text");if(text.length()>8000)throw new Exception();
     DriveService.speakFromApp(this,text,()->answer(reply,key,true,null));break;
    }
    case "cancelSpeech":NativeSpeech.get(this).cancel();answer(reply,id,true,null);break;
    default:answer(reply,id,null,"Función no disponible.");
   }
  }catch(Exception e){answer(reply,id,null,"No pude preparar la función. Vuelve a iniciar sesión si el problema continúa.");}
 }
 private void firmwareMessage(JSONObject data,JavaScriptReplyProxy reply,String id) throws Exception {
  if(!trusted(web.getUrl()) || !"/SmartHub/admin_firmware.html".equals(Uri.parse(web.getUrl()).getPath()))throw new Exception();
  switch(data.getString("type")){
   case "firmware-capabilities":answer(reply,id,true,null);return;
   case "firmware-begin":
    if(savingFirmware || firmwareReply!=null){answer(reply,id,null,"Termina el guardado anterior.");return;}
    firmwareBuffer=new FirmwareBuffer(data.getString("name"),data.getInt("size"),data.getString("sha256"));
    answer(reply,id,true,null);return;
   case "firmware-chunk":
    if(firmwareBuffer==null || firmwareReply!=null)throw new Exception();
    firmwareBuffer.append(data.getInt("offset"),data.getString("base64"));answer(reply,id,true,null);return;
   case "firmware-save":
    if(firmwareBuffer==null || firmwareReply!=null || savingFirmware)throw new Exception();
    firmwareBytes=firmwareBuffer.finish();firmwareReply=reply;firmwareReplyId=id;
    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,firmwareBuffer.name);
    startActivityForResult(intent,52);return;
   default:throw new Exception();
  }
 }
 private void saveFirmwareResult(int result,Intent data){
  if(firmwareReply==null)return;
  if(result!=RESULT_OK || data==null || data.getData()==null){cancelFirmware();return;}
  final Uri uri=data.getData();final byte[] bytes=firmwareBytes;final JavaScriptReplyProxy reply=firmwareReply;final String id=firmwareReplyId;
  firmwareReply=null;firmwareReplyId=null;firmwareBytes=null;firmwareBuffer=null;savingFirmware=true;
  new Thread(()->{
   String error=null;
   try(java.io.OutputStream out=getContentResolver().openOutputStream(uri,"w")){
    if(out==null || bytes==null)throw new java.io.IOException();out.write(bytes);out.flush();
   }catch(Exception e){error="No se pudo guardar el archivo. Revisa el espacio disponible y vuelve a intentarlo.";try{android.provider.DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}}
   final String failure=error;
   runOnUiThread(()->{savingFirmware=false;if(isDestroyed())return;answer(reply,id,failure==null,failure);Toast.makeText(this,failure==null?"Firmware guardado correctamente":failure,Toast.LENGTH_LONG).show();});
  },"firmware-save").start();
 }
 private void startListening(){
  if(!resumed||getSystemService(KeyguardManager.class).isKeyguardLocked())return;
  if(!NativeSession.ready(this)){new AlertDialog.Builder(this).setMessage("Primero inicia sesión con Google en SmartHub.").setPositiveButton("Aceptar",null).show();return;}
  java.util.ArrayList<String> permissions=new java.util.ArrayList<>();
  if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED)permissions.add(android.Manifest.permission.RECORD_AUDIO);
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)permissions.add(android.Manifest.permission.POST_NOTIFICATIONS);
  if(!permissions.isEmpty()){pendingStart=true;requestPermissions(permissions.toArray(new String[0]),11);return;}
  try{startForegroundService(new Intent(this,DriveService.class));}catch(RuntimeException e){new AlertDialog.Builder(this).setMessage("No pude activar el micrófono. Mantén SmartHub abierto y vuelve a intentarlo.").setPositiveButton("Aceptar",null).show();}
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){
  super.onRequestPermissionsResult(request,permissions,grants);
  if(request==11&&pendingStart){pendingStart=false;if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED){if(resumed)try{startForegroundService(new Intent(this,DriveService.class));}catch(RuntimeException ignored){}}else new AlertDialog.Builder(this).setMessage("María necesita permiso de micrófono para escucharte.").setPositiveButton("Aceptar",null).show();}
 }
 @Override public void onResume(){super.onResume();resumed=true;}
 @Override public void onPause(){resumed=false;super.onPause();}
 private void googleLogin(JavaScriptReplyProxy reply){
  if(loggingIn)return;loggingIn=true;final long page=navigation;
  try {
  loginCancellation=new CancellationSignal();
  GetSignInWithGoogleOption option=new GetSignInWithGoogleOption.Builder(getString(R.string.default_web_client_id)).build();
  GetCredentialRequest request=new GetCredentialRequest.Builder().addCredentialOption(option).build();
  CredentialManager.create(this).getCredentialAsync(this,request,loginCancellation,command -> new Handler(Looper.getMainLooper()).post(command),new CredentialManagerCallback<GetCredentialResponse,GetCredentialException>(){
   @Override public void onResult(GetCredentialResponse result){
    loggingIn=false;if(isFinishing()||page!=navigation||!trusted(web.getUrl()))return;
    try{
     Credential credential=result.getCredential();
     if(!(credential instanceof CustomCredential)||!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType()))throw new IllegalArgumentException();
     String token=GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
     reply.postMessage(new JSONObject().put("token",token).toString());
    }catch(Exception e){fail(reply,"No se pudo obtener la cuenta Google.");}
   }
   @Override public void onError(GetCredentialException error){loggingIn=false;if(!isFinishing()&&page==navigation)fail(reply,"No se completó el acceso con Google. Si se repite, revisa la huella SHA-1 de esta APK en Firebase.");}
  });
  } catch (RuntimeException | LinkageError error) {
   loggingIn=false;
   fail(reply,"No se pudo abrir Google. Código: "+error.getClass().getSimpleName());
   new AlertDialog.Builder(this).setTitle("Acceso Google").setMessage(CrashReport.describe(error)).setPositiveButton("Aceptar",null).show();
  }
 }
 private void fail(JavaScriptReplyProxy reply,String message){try{reply.postMessage(new JSONObject().put("error",message).toString());}catch(Exception ignored){}}
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==52){saveFirmwareResult(result,data);return;}
  if(request==51&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}
 }
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){cancelFirmware();if(loginCancellation!=null)loginCancellation.cancel();if(web!=null)web.destroy();super.onDestroy();}
}
