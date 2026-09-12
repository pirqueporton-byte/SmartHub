package cl.smarthub.porton;
import android.app.*;
import android.content.*;
/** Local diagnostics: no exception messages, tokens, user details or network logs. */
public class CrashReport extends Application {
 public static String describe(Throwable error){
  StringBuilder report=new StringBuilder("SmartHub 0.2.1\n");
  for(int cause=0;error!=null&&cause<4;cause++,error=error.getCause()){
   report.append(error.getClass().getName()).append("\n");
   StackTraceElement[] stack=error.getStackTrace();
   for(int i=0;i<Math.min(6,stack.length);i++)report.append(stack[i].getClassName()).append(".").append(stack[i].getMethodName()).append(":").append(stack[i].getLineNumber()).append("\n");
  }
  return report.toString();
 }
 @Override public void onCreate(){
  super.onCreate();
  Thread.UncaughtExceptionHandler original=Thread.getDefaultUncaughtExceptionHandler();
  Thread.setDefaultUncaughtExceptionHandler((thread,error)->{
   try{getSharedPreferences("diagnostics",0).edit().putString("lastCrash",describe(error)).commit();}catch(Exception ignored){}
   if(original!=null)original.uncaughtException(thread,error);else android.os.Process.killProcess(android.os.Process.myPid());
  });
 }
 public static void showPrevious(Activity activity){
  android.content.SharedPreferences prefs=activity.getSharedPreferences("diagnostics",0);
  String report=prefs.getString("lastCrash",null);if(report==null)return;
  new AlertDialog.Builder(activity).setTitle("Detalle del cierre anterior").setMessage(report)
   .setNeutralButton("Copiar",(d,w)->((ClipboardManager)activity.getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Diagnóstico SmartHub",report)))
   .setPositiveButton("Cerrar",(d,w)->prefs.edit().remove("lastCrash").apply()).show();
 }
}
