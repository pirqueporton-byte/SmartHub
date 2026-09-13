package cl.smarthub.porton;
import java.text.Normalizer;
import java.util.Locale;
final class VoiceRules {
 static String clean(String s){return Normalizer.normalize(s==null?"":s,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]"," ").replaceAll("\\s+"," ").trim();}
 static boolean invoked(String text,String name){String n=clean(name);return !n.isEmpty()&&(" "+clean(text)+" ").contains(" "+n+" ");}
 static String strip(String text,String name){return (" "+clean(text)+" ").replace(" "+clean(name)+" "," ").trim();}
 static boolean open(String t){t=clean(t);return t.equals("abre el porton")||t.equals("abre porton")||t.equals("abrir el porton");}
 static boolean stop(String t){t=clean(t);return t.equals("terminar modo conduccion")||t.equals("desactivar escucha")||t.equals("deja de escuchar");}
 static boolean end(String t){t=clean(t);return t.equals("gracias")||t.equals("eso es todo")||t.equals("terminar conversacion");}
 static long millis(long stamp){return stamp>0&&stamp<10000000000L?stamp*1000:stamp;}
 // 0 = online, 1 = stale/missing heartbeat, 2 = cannot establish trustworthy timing.
 static int connection(long heartbeat,long serverNow){long ts=millis(heartbeat);if(serverNow<=0||ts>serverNow+5000)return 2;return ts>0&&serverNow-ts<=35000?0:1;}
 static boolean recent(long timestamp,long now){return timestamp>0&&now-timestamp<10000;}
}
