package cl.smarthub.porton;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/** Only hosts trusted by the AndroidX car host allowlist may bind. */
public final class GateCarService extends CarAppService {
 @NonNull @Override public HostValidator createHostValidator() {
  return new HostValidator.Builder(this)
   .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build();
 }
 @NonNull @Override public Session onCreateSession() {
  return new Session() {
   @NonNull @Override public Screen onCreateScreen(@NonNull Intent intent) {
    return new GateCarScreen(getCarContext());
   }
  };
 }
}
