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
 static boolean trusted(String url){
  if(url==null)return false;
  Uri u=Uri.parse(url);
  return "https".equals(u.getScheme())&&"pirqueporton-byte.github.io".equals(u.getHost())
    &&u.getPort()==-1&&u.getUserInfo()==null&&u.getPath()!=null&&u.getPath().startsWith("/SmartHub/");
 }
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);
  root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  LinearLayout bar=new LinearLayout(this);bar.setPadding(12,0,12,0);
  state=new TextView(this);state.setText("SmartHub");state.setGravity(android.view.Gravity.CENTER_VERTICAL);
  bar.addView(state,new LinearLayout.LayoutParams(0,-1,1));
  Button drive=new Button(this);drive.setText("Conducción");
  drive.setOnClickListener(v->startActivity(new Intent(this,DrivingActivity.class)));bar.addView(drive);
  root.addView(bar);web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
   state.setText("Actualiza Android System WebView para usar SmartHub");return;
  }
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptCookie(true);
  WebViewCompat.addWebMessageListener(web,"SmartHubAndroid",Collections.singleton(ORIGIN),(view,message,origin,main,reply)->{
   if(!main||!ORIGIN.equals(origin.toString())||!trusted(view.getUrl()))return;
   if("google-login".equals(message.getData()))googleLogin(reply);
  });
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
    if(!request.isForMainFrame())return false;
    if(trusted(request.getUrl().toString()))return false;
    state.setText("Enlace externo: abre SmartHub desde tu navegador para visitarlo");return true;
   }
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){navigation++;state.setText("Cargando SmartHub…");}
   @Override public void onPageFinished(WebView v,String url){
    if(!trusted(url))return;
    state.setText("SmartHub");
    // Inject no credentials into a URL, history, preferences or logs. The reply belongs to the requesting frame.
    v.evaluateJavascript("(function(){if(!window.firebase||!window.SmartHubAndroid)return;window.SmartHubAndroid.onmessage=function(e){var d=JSON.parse(e.data);if(d.token){firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(d.token)).catch(function(){if(window.showError)showError('No se pudo iniciar sesión. Revisa la configuración de Google de la APK.');});}else if(window.showError){showError(d.error);}};window.iniciarSesion=function(){if(window.mostrarCarga)mostrarCarga(true);window.SmartHubAndroid.postMessage('google-login');};})();",null);
   }
   @Override public void onReceivedError(WebView v,WebResourceRequest req,WebResourceError err){if(req.isForMainFrame()){state.setText("Sin conexión · toca para reintentar");state.setOnClickListener(w->web.loadUrl(HOME));}}
   @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();state.setText("No se pudo verificar la conexión segura");}
  });
  web.setWebChromeClient(new WebChromeClient(){
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
  if(request==51&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}
 }
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(loginCancellation!=null)loginCancellation.cancel();if(web!=null)web.destroy();super.onDestroy();}
}
