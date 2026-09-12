package cl.smarthub.porton;
import java.text.Normalizer;
import java.util.Locale;
final class Commands {
 static String normalize(String s) { return Normalizer.normalize(s,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).trim().replaceAll("\\s+"," "); }
 static boolean open(String s) { String t=normalize(s); return t.equals("abre el porton") || t.equals("abre porton"); }
 static boolean stop(String s) { return normalize(s).equals("terminar modo conduccion"); }
 static boolean validEndpoint(String input) {
  try { java.net.URI u=new java.net.URI(input);return "https".equals(u.getScheme()) && u.getHost()!=null && u.getHost().endsWith(".workers.dev") && u.getUserInfo()==null && u.getPort()==-1 && u.getQuery()==null && u.getFragment()==null && (u.getPath().isEmpty() || u.getPath().equals("/")); } catch(Exception e){return false;}
 }
}
