package cl.smarthub.porton;

import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.Base64;

/** Bounded transfer; never accepts a path or remote URL from JavaScript. */
final class FirmwareBuffer {
 final String name;
 private final int size;
 private final String hash;
 private final ByteArrayOutputStream bytes;
 FirmwareBuffer(String name, int size, String hash) {
  if(!name.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,110}\\.bin") || size<1 || size>2031616 || !hash.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Firmware inválido.");
  this.name=name;this.size=size;this.hash=hash;bytes=new ByteArrayOutputStream(size);
 }
 void append(int offset,String encoded) {
  if(offset!=bytes.size() || encoded.length()>16384)throw new IllegalArgumentException("Transferencia desordenada.");
  byte[] chunk=Base64.getDecoder().decode(encoded);
  if(chunk.length==0 || bytes.size()+chunk.length>size)throw new IllegalArgumentException("Tamaño inválido.");
  bytes.write(chunk,0,chunk.length);
 }
 byte[] finish() throws Exception {
  byte[] result=bytes.toByteArray();
  if(result.length!=size || (result[0]&255)!=0xe9)throw new IllegalArgumentException("Firmware incompleto.");
  StringBuilder actual=new StringBuilder();
  for(byte b:MessageDigest.getInstance("SHA-256").digest(result))actual.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
  if(!hash.equals(actual.toString()))throw new IllegalArgumentException("El SHA-256 no coincide.");
  return result;
 }
}
