package cl.smarthub.porton;
import org.junit.Test;
import static org.junit.Assert.*;
import java.security.MessageDigest;
import java.util.Base64;
public class FirmwareBufferTest {
 private String hash(byte[] data)throws Exception{StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))s.append(String.format("%02x",b&255));return s.toString();}
 @Test public void preservesAllBytesAcrossChunks()throws Exception{
  byte[] a=new byte[]{(byte)0xe9,1,2,3};FirmwareBuffer b=new FirmwareBuffer("riego-1.5.0.bin",4,hash(a));
  b.append(0,Base64.getEncoder().encodeToString(new byte[]{a[0],a[1]}));b.append(2,Base64.getEncoder().encodeToString(new byte[]{a[2],a[3]}));assertArrayEquals(a,b.finish());
 }
 @Test public void rejectsInvalidTransfers()throws Exception{
  byte[] a=new byte[]{(byte)0xe9,1,2,3};String h=hash(a);
  assertThrows(IllegalArgumentException.class,()->new FirmwareBuffer("../a.bin",4,h));
  assertThrows(IllegalArgumentException.class,()->new FirmwareBuffer("a.bin",2031617,h));
  FirmwareBuffer b=new FirmwareBuffer("a.bin",4,h);
  assertThrows(IllegalArgumentException.class,()->b.append(1,"6Q=="));
  assertThrows(IllegalArgumentException.class,()->b.append(0,"6QECAwQ="));
  assertThrows(IllegalArgumentException.class,()->b.finish());
  b.append(0,"6QECAA==");assertThrows(IllegalArgumentException.class,()->b.finish());
 }
}
