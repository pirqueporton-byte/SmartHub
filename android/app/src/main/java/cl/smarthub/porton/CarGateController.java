package cl.smarthub.porton;
import java.util.concurrent.Executor;
import java.util.function.LongSupplier;

/** UI-thread state. Reads never become writes; failed commands are never retried. */
final class CarGateController {
 interface Gateway { Result run(boolean open, long epoch) throws Exception; }
 static final class Result {
  final boolean online; final String message;
  Result(boolean online,String message){this.online=online;this.message=message;}
 }
 private final Gateway gateway; private final Executor worker,ui;
 private final LongSupplier epoch; private final Runnable changed;
 private volatile boolean active; private volatile long ticket; private long checkedEpoch;
 boolean busy,canOpen; String message="Consulta la conexión del portón.";
 CarGateController(Gateway gateway,Executor worker,Executor ui,LongSupplier epoch,Runnable changed){
  this.gateway=gateway;this.worker=worker;this.ui=ui;this.epoch=epoch;this.changed=changed;
 }
 void start(){active=true;refresh();}
 void stop(){active=false;ticket++;busy=false;canOpen=false;}
 void refresh(){request(false);}
 void open(){if(canOpen && checkedEpoch==epoch.getAsLong())request(true);else if(!busy)refresh();}
 private void request(boolean open){
  if(!active||busy)return;
  long current=epoch.getAsLong(),id=++ticket;
  busy=true;canOpen=false;message=open?"Enviando orden…":"Comprobando conexión…";changed.run();
  worker.execute(()->{
   if(!active||id!=ticket)return;
   Result result;
   try{if(current!=epoch.getAsLong())throw new Exception("Session changed");result=gateway.run(open,current);}
   catch(Exception e){result=new Result(false,open
    ?"No pude confirmar el resultado. Revisa el portón antes de repetir la orden."
    :"No pude verificar la conexión o tu acceso. Revisa SmartHub en el teléfono cuando estés estacionado.");}
   final Result answer=result;
   ui.execute(()->{
    if(!active||id!=ticket)return;
    busy=false;
    if(current!=epoch.getAsLong()){canOpen=false;message="La sesión cambió. Actualiza la conexión.";}
    else{checkedEpoch=current;canOpen=!open&&answer.online;message=answer.message;}
    changed.run();
   });
  });
 }
}
