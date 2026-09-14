package cl.smarthub.porton;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.*;
import androidx.core.graphics.drawable.IconCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

final class GateCarScreen extends Screen {
 // One queue across screen recreation. No retry, polling, microphone or background timer.
 private static final ExecutorService IO=Executors.newSingleThreadExecutor();
 private final CarGateController controller;
 GateCarScreen(CarContext context){
  super(context);
  Handler main=new Handler(Looper.getMainLooper());
  controller=new CarGateController((open,epoch)->{
   if(!NativeSession.ready(context))return new CarGateController.Result(false,
    "Inicia sesión en SmartHub desde el teléfono cuando estés estacionado.");
   if(epoch!=NativeSession.generation.get())throw new Exception("Session changed");
   NativeSession.Access access=NativeSession.authorize(context);
   if(access.epoch!=epoch)throw new Exception("Session changed");
   JSONObject reply=new NativeTools(context).gate(access,open);
   return new CarGateController.Result(reply.optBoolean("conectado")&&reply.optBoolean("verificado"),
    reply.optString("mensaje"));
  },IO,main::post,NativeSession.generation::get,this::invalidate);
  getLifecycle().addObserver(new DefaultLifecycleObserver(){
   @Override public void onStart(@NonNull LifecycleOwner owner){controller.start();}
   @Override public void onStop(@NonNull LifecycleOwner owner){controller.stop();}
  });
 }
 @NonNull @Override public Template onGetTemplate(){
  CarIcon gate=new CarIcon.Builder(IconCompat.createWithResource(getCarContext(),R.drawable.ic_gate)).build();
  Pane.Builder pane=new Pane.Builder().addRow(new Row.Builder().setTitle("Portón")
   .addText(controller.message).setImage(gate).build());
  if(controller.canOpen && !controller.busy) pane.addAction(new Action.Builder()
   .setTitle("Abrir portón")
   .setBackgroundColor(CarColor.createCustom(0xFF157E75,0xFF157E75))
   .setOnClickListener(controller::open).build());
  if(!controller.busy)pane.addAction(new Action.Builder().setTitle("Actualizar")
   .setOnClickListener(controller::refresh).build());
  return new PaneTemplate.Builder(pane.build()).setTitle("SmartHub")
   .setHeaderAction(Action.APP_ICON).build();
 }
}
