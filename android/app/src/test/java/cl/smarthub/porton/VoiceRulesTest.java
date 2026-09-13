package cl.smarthub.porton;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceRulesTest {
 @Test public void nameUsesWholeWords(){assertTrue(VoiceRules.invoked("María, riega el jardín", "María"));assertFalse(VoiceRules.invoked("mariana abre porton", "María"));assertEquals("riega el jardin",VoiceRules.strip("María, riega el jardín", "María"));}
 @Test public void gateNeedsRecentServerHeartbeat(){long now=1800000000000L;assertEquals(0,VoiceRules.connection(now-30000,now));assertEquals(1,VoiceRules.connection(now-36000,now));assertEquals(1,VoiceRules.connection(0,now));assertEquals(2,VoiceRules.connection(now+6000,now));assertEquals(2,VoiceRules.connection(now,0));assertEquals(0,VoiceRules.connection(now/1000,now));}
 @Test public void negatedGateCommandsNeverMatchLocalShortcut(){assertFalse(VoiceRules.open("no abre el porton"));assertFalse(VoiceRules.open("el vecino dice abre el porton"));assertTrue(VoiceRules.open("abre el portón"));}
}
