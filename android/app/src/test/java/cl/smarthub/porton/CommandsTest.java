package cl.smarthub.porton;
import org.junit.Test;
import static org.junit.Assert.*;
public class CommandsTest {
 @Test public void onlyExplicitCommands(){assertTrue(Commands.open("Abre el portón"));assertTrue(Commands.open("abre porton"));assertFalse(Commands.open("no abre el porton"));assertFalse(Commands.open("dijo abre el porton"));assertFalse(Commands.open("abre el porton mañana"));assertFalse(Commands.open(""));assertTrue(Commands.stop("terminar modo conducción"));}
 @Test public void endpointCannotLeakTokenToOtherHosts(){assertTrue(Commands.validEndpoint("https://mi-worker.workers.dev"));assertFalse(Commands.validEndpoint("http://mi-worker.workers.dev"));assertFalse(Commands.validEndpoint("https://mi-worker.workers.dev.evil.com"));assertFalse(Commands.validEndpoint("https://mi-worker.workers.dev/abrir"));assertFalse(Commands.validEndpoint("https://user@mi-worker.workers.dev"));assertFalse(Commands.validEndpoint("https://mi-worker.workers.dev?token=x"));}
}
