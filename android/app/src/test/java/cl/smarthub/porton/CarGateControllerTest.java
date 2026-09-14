package cl.smarthub.porton;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayDeque;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicLong;

public class CarGateControllerTest {
 static class Queue implements Executor{
  ArrayDeque<Runnable> tasks=new ArrayDeque<>();
  public void execute(Runnable r){tasks.add(r);}
  void run(){tasks.remove().run();}
 }
 @Test public void startAndRefreshOnlyReadAndDoubleTapSendsOnce(){
  Queue worker=new Queue();int[] reads={0},writes={0};
  CarGateController c=new CarGateController((open,e)->{
   if(open)writes[0]++;else reads[0]++;
   return new CarGateController.Result(true,"ok");
  },worker,Runnable::run,()->0,()->{});
  c.start();c.open();worker.run();
  assertEquals(1,reads[0]);assertEquals(0,writes[0]);
  c.open();c.open();worker.run();
  assertEquals(1,writes[0]);assertFalse(c.canOpen);
  c.refresh();worker.run();assertEquals(2,reads[0]);assertEquals(1,writes[0]);
 }
 @Test public void offlineAndErrorsNeverAllowOpeningOrRetry(){
  Queue worker=new Queue();int[] calls={0};
  CarGateController c=new CarGateController((open,e)->{
   assertFalse(open);calls[0]++;throw new Exception("offline");
  },worker,Runnable::run,()->0,()->{});
  c.start();worker.run();assertFalse(c.canOpen);assertTrue(worker.tasks.isEmpty());
  assertEquals(1,calls[0]);
 }
 @Test public void stoppedScreenAndChangedAccountDiscardOnlineReply(){
  Queue worker=new Queue();AtomicLong epoch=new AtomicLong();
  CarGateController c=new CarGateController((open,e)->new CarGateController.Result(true,"ok"),
   worker,Runnable::run,epoch::get,()->{});
  c.start();c.stop();worker.run();assertFalse(c.canOpen);
  c.start();epoch.incrementAndGet();worker.run();assertFalse(c.canOpen);
 }
 @Test public void commandTimeoutDoesNotRetry(){
  Queue worker=new Queue();int[] writes={0};
  CarGateController c=new CarGateController((open,e)->{
   if(open){writes[0]++;throw new Exception("timeout");}
   return new CarGateController.Result(true,"online");
  },worker,Runnable::run,()->0,()->{});
  c.start();worker.run();c.open();worker.run();
  assertFalse(c.canOpen);assertEquals(1,writes[0]);assertTrue(worker.tasks.isEmpty());
 }
}
