package cl.smarthub.porton;
import org.junit.Test;
import static org.junit.Assert.*;
public class GoogleRuntimeTest {
 @Test public void googleProviderRuntimeTypesArePresent() throws Exception {
  // Resolve signatures too: loading a class alone may postpone the missing-type error until Android verifies it.
  for(String name:new String[]{
   "androidx.loader.app.LoaderManager",
   "androidx.loader.app.LoaderManager$LoaderCallbacks",
   "androidx.fragment.app.FragmentActivity",
   "com.google.android.gms.common.GoogleApiAvailability",
   "androidx.credentials.playservices.CredentialProviderPlayServicesImpl"
  }){
   Class<?> type=Class.forName(name,false,getClass().getClassLoader());
   assertNotNull(type.getDeclaredMethods());
   assertNotNull(type.getDeclaredConstructors());
  }
 }
}
