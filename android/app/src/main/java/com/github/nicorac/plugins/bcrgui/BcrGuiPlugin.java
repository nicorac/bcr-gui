package com.github.nicorac.plugins.bcrgui;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.github.nicorac.xposed.DialerLink;
import com.github.nicorac.xposed.ModuleStatus;
import com.github.nicorac.xposed.XposedEntry;

@CapacitorPlugin(name = "BcrGui")
public class BcrGuiPlugin extends Plugin {

  /**
   * Allow client to create a new contact with the given phone number
   * or add the phone number to an existing one
   */
  @PluginMethod()
  public void createOrEditContact(PluginCall call) {

    // get input arguments
    String phoneNumber = call.getString("phoneNumber");
    if (phoneNumber == null) {
      call.reject("Missing phone number");
      return;
    }
    String displayName = call.getString("displayName");

    // start intent
    var intent = new Intent(Intent.ACTION_INSERT_OR_EDIT);
    intent
      .setType(ContactsContract.Contacts.CONTENT_ITEM_TYPE)
      .putExtra(ContactsContract.Intents.Insert.PHONE, phoneNumber)
    ;
    if (displayName != null) {
      intent.putExtra(ContactsContract.Intents.Insert.NAME, displayName);
    }

    // start activity and wait for result
    startActivityForResult(call, intent, "createOrEditContactResult");

  }

  @ActivityCallback()
  private void createOrEditContactResult(PluginCall call, ActivityResult result) {

    if (call == null) {
      return;
    }

    if (result.getResultCode() != AppCompatActivity.RESULT_OK) {
      call.reject(result.toString(), ErrorCodes.ERR_USER_CANCELED);
      return;
    }

    // extract created/edited contact URI
    Intent intent = result.getData();
    Uri contactUri = intent.getData();

    if (contactUri != null) {

      // load contact
      var dn = getContactDisplayName(contactUri);
      if (dn != null) {
        var ret = new JSObject();
        ret.put("contactUri", contactUri.toString());
        ret.put("displayName", dn);
        call.resolve(ret);
      }
    }

    // reject call
    call.reject("Can't find contact");

  }

  @Nullable
  private String getContactDisplayName(Uri contactUri) {

    String[] projection = {
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
    };

    try (
      var cur = getContext().getContentResolver().query(contactUri, projection, null, null, null);
    ) {
      if (cur != null && cur.moveToFirst()) {
        return cur.getString(0);
      }
    }

    return null;
  }

  //#region dialer integration (Xposed)

  /**
   * Report whether the Xposed side of the dialer integration is live.
   *
   * "moduleActive" can only be true when a framework is installed AND the user
   * enabled BCR-GUI as a module AND scoped it to BCR-GUI itself -- see
   * {@link ModuleStatus}. When it is false we cannot tell those cases apart, so the
   * UI has to cover all of them in one message.
   */
  @PluginMethod()
  public void getDialerIntegrationStatus(PluginCall call) {

    // (re)issue the grant here too, so toggling the setting on takes effect without
    // waiting for the next app start
    DialerLink.grantToDefaultDialer(getContext());

    // Two independent signals. The probe proves the module was loaded into this
    // process; a recent provider query from the dialer proves the integration is
    // actually working, which is what the user is asking about and stays true even
    // when the framework does not scope the module to BCR-GUI itself.
    long lastContact = getContext()
      .getSharedPreferences(DialerLink.LINK_PREFS, Context.MODE_PRIVATE)
      .getLong(DialerLink.KEY_LAST_DIALER_CONTACT, 0);
    boolean recentlyUsed = lastContact > 0
      && System.currentTimeMillis() - lastContact < 24 * 60 * 60 * 1000L;

    var ret = new JSObject();
    ret.put("moduleActive", ModuleStatus.isModuleActive() || recentlyUsed);
    ret.put("selfProbeActive", ModuleStatus.isModuleActive());
    ret.put("lastDialerContact", lastContact);
    ret.put("moduleVersion", ModuleStatus.getModuleVersion());
    ret.put("expectedModuleVersion", XposedEntry.MODULE_VERSION);

    // the provider only serves the current default dialer, so surface which one
    // that is: picking a different dialer is a common reason for "nothing happens"
    String dialerPkg = DialerLink.defaultDialer(getContext());
    ret.put("defaultDialer", dialerPkg);
    ret.put("defaultDialerLabel", getAppLabel(dialerPkg));
    ret.put("xposedManager", findXposedManager());

    call.resolve(ret);
  }

  /** Launch the installed Xposed manager, if we can find one. */
  @PluginMethod()
  public void openXposedManager(PluginCall call) {
    String pkg = findXposedManager();
    if (pkg == null) {
      call.reject("No Xposed manager found", ErrorCodes.ERR_NOT_FOUND);
      return;
    }
    Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
    if (intent == null) {
      call.reject("Cannot launch " + pkg, ErrorCodes.ERR_NOT_FOUND);
      return;
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
    call.resolve();
  }

  /**
   * Known Xposed manager packages. Managers commonly hide themselves from the
   * launcher and from queries, so a null result does NOT mean "no framework".
   */
  @Nullable
  private String findXposedManager() {
    String[] candidates = {
      "org.lsposed.manager",
      "io.github.lsposed.manager",
      "org.jingmatrix.vector",
      "de.robv.android.xposed.installer",
    };
    PackageManager pm = getContext().getPackageManager();
    for (String pkg : candidates) {
      try {
        pm.getPackageInfo(pkg, 0);
        return pkg;
      } catch (PackageManager.NameNotFoundException ignored) {
        // not installed, try the next
      }
    }
    return null;
  }

  @Nullable
  private String getAppLabel(@Nullable String pkg) {
    if (pkg == null) return null;
    try {
      PackageManager pm = getContext().getPackageManager();
      return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
    } catch (Exception e) {
      return pkg;
    }
  }

  /**
   * Return the diagnostics the dialer-side module last handed over.
   *
   * The module cannot write anywhere this app can read -- it runs in the dialer's
   * process -- so it pushes its ring buffer through the provider and this reads what
   * arrived. Returned as text so the UI can share it without a file-provider grant.
   */
  @PluginMethod()
  public void readDialerDiagnostics(PluginCall call) {
    var ret = new JSObject();
    try {
      var file = new java.io.File(getContext().getFilesDir(),
        com.github.nicorac.xposed.DialerLink.DIAGNOSTICS_FILE);
      if (!file.exists()) {
        ret.put("available", false);
        ret.put("content", "");
        ret.put("collectedAt", 0);
        call.resolve(ret);
        return;
      }
      var content = new String(java.nio.file.Files.readAllBytes(file.toPath()),
        java.nio.charset.StandardCharsets.UTF_8);
      ret.put("available", true);
      ret.put("content", content);
      ret.put("collectedAt", file.lastModified());
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Cannot read diagnostics: " + e.getMessage(), ErrorCodes.ERR_NOT_FOUND);
    }
  }

  //#endregion

}
