package cl.smarthub.porton;
import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.text.InputType;
import android.widget.*;
import android.graphics.Color;
import androidx.browser.customtabs.CustomTabsIntent;
public class MainActivity extends Activity {
 TextView status;Switch test;EditText endpoint,token;
 final Handler handler=new Handler();
 final Runnable refresh=new Runnable(){public void run(){status.setText(DriveService.status);handler.postDelayed(this,1000);}};
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
  ScrollView scroll=new ScrollView(this);LinearLayout box=new LinearLayout(this);box.setOrientation(1);box.setPadding(32,48,32,32);scroll.addView(box);setContentView(scroll);
  TextView title=new TextView(this);title.setText("SmartHub");title.setTextSize(30);title.setTextColor(Color.rgb(21,126,117));box.addView(title);
  label(box,"Portón · Android de prueba");button(box,"Abrir mi SmartHub",()->new CustomTabsIntent.Builder().setShowTitle(false).build().launchUrl(this,Uri.parse("https://pirqueporton-byte.github.io/SmartHub/")));
  label(box,"Modo conducción");status=label(box,DriveService.status);
  label(box,"Actívalo con el teléfono desbloqueado. Después del aviso puedes bloquearlo y decir: «abre el portón». Para terminar: «terminar modo conducción». La escucha consume batería mientras está activa.");
  test=new Switch(this);test.setText("Prueba sin mover el portón");test.setChecked(getSharedPreferences("native",0).getBoolean("test",true));box.addView(test);
  test.setOnCheckedChangeListener((b,on)->{stopService(new Intent(this,DriveService.class));getSharedPreferences("native",0).edit().putBoolean("test",on).apply();});
  button(box,"Activar modo conducción",this::startDrive);button(box,"Detener escucha",()->stopService(new Intent(this,DriveService.class)));
  button(box,"Abrir portón ahora",()->new AlertDialog.Builder(this).setMessage("¿Enviar la orden de apertura al portón?").setNegativeButton("Cancelar",null).setPositiveButton("Abrir",(d,w)->request(false)).show());
  label(box,"Conexión del portón");label(box,"Usa la dirección del Worker del atajo de Siri (sin /abrir) y su SIRI_TOKEN. La clave queda cifrada en este teléfono. No es la clave de Anthropic.");
  endpoint=new EditText(this);endpoint.setSingleLine();endpoint.setHint("https://tu-worker.workers.dev");endpoint.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);endpoint.setText(getSharedPreferences("native",0).getString("endpoint",""));box.addView(endpoint);
  token=new EditText(this);token.setSingleLine();token.setHint("SIRI_TOKEN · dejar vacío conserva la clave");token.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);box.addView(token);
  button(box,"Guardar conexión",this::save);button(box,"Verificar sin abrir",()->request(true));
 }
 TextView label(LinearLayout b,String t){TextView v=new TextView(this);v.setText(t);v.setTextSize(16);v.setPadding(0,14,0,14);b.addView(v);return v;}
 void button(LinearLayout b,String t,Runnable r){Button v=new Button(this);v.setText(t);b.addView(v);v.setOnClickListener(w->r.run());}
 void save(){try{String url=endpoint.getText().toString().trim(),key=token.getText().toString().trim();if(!Commands.validEndpoint(url))throw new Exception("Ingresa la dirección https del Worker, sin /abrir ni parámetros.");if(!key.isEmpty()){if(!key.matches("[a-fA-F0-9]{64}"))throw new Exception("La clave debe tener 64 caracteres hexadecimales.");Secrets.save(this,key);}else Secrets.read(this);getSharedPreferences("native",0).edit().putString("endpoint",url).apply();stopService(new Intent(this,DriveService.class));token.setText("");Toast.makeText(this,"Conexión guardada",Toast.LENGTH_SHORT).show();}catch(Exception e){new AlertDialog.Builder(this).setMessage(e.getMessage()==null?"Guarda una clave válida antes de continuar.":e.getMessage()).setPositiveButton("Aceptar",null).show();}}
 void request(boolean verify){status.setText("Consultando…");new Thread(()->{String result;try{result=GateClient.request(this,verify);}catch(Exception e){result=verify?"No pude verificar la conexión.":"No pude confirmar la apertura. Revisa antes de repetirla.";}String message=result;runOnUiThread(()->new AlertDialog.Builder(this).setMessage(message).setPositiveButton("Aceptar",null).show());}).start();}
 void startDrive(){try{Secrets.read(this);if(!Commands.validEndpoint(getSharedPreferences("native",0).getString("endpoint","")))throw new Exception();}catch(Exception e){new AlertDialog.Builder(this).setMessage("Primero guarda y verifica la conexión del portón.").setPositiveButton("Aceptar",null).show();return;}
  java.util.ArrayList<String> needed=new java.util.ArrayList<>();if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.RECORD_AUDIO);if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.POST_NOTIFICATIONS);
  if(!needed.isEmpty()){requestPermissions(needed.toArray(new String[0]),1);return;}startForegroundService(new Intent(this,DriveService.class));
 }
 @Override public void onRequestPermissionsResult(int r,String[] p,int[] g){super.onRequestPermissionsResult(r,p,g);Toast.makeText(this,"Con permisos concedidos, vuelve a pulsar Activar modo conducción.",Toast.LENGTH_LONG).show();}
 @Override public void onResume(){super.onResume();handler.post(refresh);}
 @Override public void onPause(){handler.removeCallbacks(refresh);super.onPause();}
}
