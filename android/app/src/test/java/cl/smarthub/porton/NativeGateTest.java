package cl.smarthub.porton;
import org.junit.*;
import static org.junit.Assert.*;
import org.json.*;
public class NativeGateTest {
 final long now=1800000000000L;
 NativeSession.Access access(){return new NativeSession.Access("test-token","test-user",true,NativeSession.generation.get());}
 CloudHttp.Reply reply(String body,long time,String etag)throws Exception{CloudHttp.Reply r=new CloudHttp.Reply();r.code=200;r.body=body;r.now=time;r.etag=etag;return r;}
 @After public void reset(){CloudHttp.testTransport=null;}
 @Test public void offlineNeverWrites()throws Exception{
  CloudHttp.testTransport=(u,m,b,t,e,g)->{assertEquals("GET",m);return reply("{\"ultima_conexion\":1799999900000}",now,"etag");};
  assertFalse(new NativeTools(null).gate(access(),true).getBoolean("ok"));
 }
 @Test public void unknownTimeNeverWrites()throws Exception{
  CloudHttp.testTransport=(u,m,b,t,e,g)->{assertEquals("GET",m);return reply("{\"ultima_conexion\":1800000000000}",0,"etag");};
  assertFalse(new NativeTools(null).gate(access(),true).getBoolean("ok"));
 }
 @Test public void writePreservesStateAndUsesEtagExactlyOnce()throws Exception{
  int[] writes={0};CloudHttp.testTransport=(u,m,b,t,e,g)->{
   if(m.equals("GET"))return reply("{\"ultima_conexion\":1800000000000,\"sensor\":\"closed\"}",now,"v1");
   writes[0]++;assertEquals("PUT",m);assertEquals("v1",e);JSONObject data=new JSONObject(b);assertEquals("closed",data.getString("sensor"));assertEquals("timestamp",data.getJSONObject("timestamp").getString(".sv"));return reply(b,now,"v2");
  };
  assertTrue(new NativeTools(null).gate(access(),true).getBoolean("ok"));assertEquals(1,writes[0]);
 }
 @Test public void writeTimeoutIsNotRetriedOrClaimedSuccessful()throws Exception{
  int[] writes={0};CloudHttp.testTransport=(u,m,b,t,e,g)->{if(m.equals("GET"))return reply("{\"ultima_conexion\":1800000000000}",now,"v1");writes[0]++;throw new java.io.IOException();};
  try{new NativeTools(null).gate(access(),true);fail();}catch(Exception e){assertTrue(e.getMessage().contains("No pude confirmar"));}assertEquals(1,writes[0]);
 }
 @Test public void accountChangeCancelsBeforeWrite()throws Exception{
  CloudHttp.testTransport=(u,m,b,t,e,g)->{assertEquals("GET",m);NativeSession.generation.incrementAndGet();return reply("{\"ultima_conexion\":1800000000000}",now,"v1");};
  try{new NativeTools(null).gate(access(),true);fail();}catch(Exception expected){}
 }
 @Test public void regularUserCannotControlIrrigation()throws Exception{
  CloudHttp.testTransport=(u,m,b,t,e,g)->{throw new AssertionError("No network expected");};
  try{new NativeTools(null).call("controlar_riego",new JSONObject(),new NativeSession.Access("test","u",false,NativeSession.generation.get()));fail();}catch(Exception e){assertTrue(e.getMessage().contains("solo tiene acceso"));}
 }
}
