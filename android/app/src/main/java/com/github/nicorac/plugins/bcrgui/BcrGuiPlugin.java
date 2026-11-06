package com.github.nicorac.plugins.bcrgui;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.ContactsContract;
import android.telephony.PhoneNumberUtils;
import android.telephony.TelephonyManager;
import android.text.TextUtils;

import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;

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

  /**
   * Format a raw phone number to E.164 format.
   */
  @PluginMethod()
  public void formatNumberToE164(PluginCall call) {

    // get input arguments
    var phoneNumber = call.getString("number");
    if (phoneNumber == null) {
      call.reject("Missing phone number");
      return;
    }

    // Get country ISO for proper national-to-international E.164 resolution
    var countryIso = getDeviceCountryIso();

    // Convert raw phone string into E.164 format (e.g., "+390698765432")
    var e164Number = PhoneNumberUtils.formatNumberToE164(phoneNumber, countryIso);
    var result = new JSObject();
    result.put("number", !TextUtils.isEmpty(e164Number)
      ? e164Number
      : phoneNumber.replaceAll("[^0-9+]", "")
    );
    call.resolve(result);

  }

  /**
   * Reads contacts and formats phone numbers to E.164 directly using native Android lib.
   * Returns a map of E.164 phone numbers => contact details.
   */
  @PluginMethod()
  public void getContactsIndexedByE164(PluginCall call) {

    // Get country ISO for proper national-to-international E.164 resolution
    var countryIso = getDeviceCountryIso();

    var resolver = getContext().getContentResolver();
    var projection = new String[]{
      ContactsContract.CommonDataKinds.Phone.CONTACT_ID,    // index: 0
      ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,  // 1
      ContactsContract.CommonDataKinds.Phone.NUMBER,        // 2
      ContactsContract.CommonDataKinds.Phone.TYPE,          // 3
      ContactsContract.CommonDataKinds.Phone.LABEL,         // 4
      ContactsContract.CommonDataKinds.Phone.IS_PRIMARY,    // 5
    };
    var phoneCountPerContact = new HashMap<Long, Integer>();  // needed to test if a contact >1 numbers
    var rawEntries = new ArrayList<RawContactEntry>();

    try (var cursor = resolver.query(
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
      projection,
      ContactsContract.CommonDataKinds.Phone.HAS_PHONE_NUMBER + " = 1",
      null,
      null
    )) {
      if (cursor != null) {
        while (cursor.moveToNext()) {
          var contactId = cursor.getLong(0);
          var displayName = cursor.getString(1);
          var rawNumber = cursor.getString(2);
          int phoneType = cursor.getInt(3);
          var customLabel = cursor.getString(4);
          var isPrimary = (cursor.getInt(5) != 0);
          var localizedLabel = ContactsContract.CommonDataKinds.Phone
            .getTypeLabel(getContext().getResources(), phoneType, customLabel)
            .toString();

          if (TextUtils.isEmpty(rawNumber)) {
            continue;
          }

          // Convert raw phone string into E.164 format (e.g., "+390698765432")
          var e164Number = PhoneNumberUtils.formatNumberToE164(rawNumber, countryIso);

          // Increment counter for this contact
          phoneCountPerContact.put(contactId, phoneCountPerContact.getOrDefault(contactId, 0) + 1);

          // store in raw entries for later elaboration
          rawEntries.add(new RawContactEntry(contactId, displayName, rawNumber, e164Number, localizedLabel, isPrimary));
        }
      }

      // Build final JSON Map indexed by E.164 string
      var contactsMap = new JSObject();
      for (var entry : rawEntries) {
        int totalNumbersForThisContact = phoneCountPerContact.getOrDefault(entry.contactId(), 1);

        var key = !TextUtils.isEmpty(entry.e164Number())
          ? entry.e164Number()
          : entry.rawNumber().replaceAll("[^0-9+]", "");

        // Assign label ONLY if contact has multiple phone numbers
        var finalLabel = (totalNumbersForThisContact > 1) ? entry.localizedLabel() : "";

        var contactData = new JSObject();
        contactData.put("number", key);
        contactData.put("rawNumber", entry.rawNumber());
        contactData.put("localizedLabel", finalLabel);
        contactData.put("isPrimary", entry.isPrimary());
        contactData.put("displayName", entry.displayName());
        contactsMap.put(key, contactData);
      }

      JSObject result = new JSObject();
      result.put("contacts", contactsMap);
      call.resolve(result);

    } catch (Exception e) {
      call.reject("Failed to fetch and process contacts", e);
    }

  }

  /**
   * Helper method to detect ISO country code from SIM, Network or system Locale.
   */
  private String getDeviceCountryIso() {
    var tm = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
    if (tm != null) {
      var simCountry = tm.getSimCountryIso();
      if (!TextUtils.isEmpty(simCountry)) {
        return simCountry.toUpperCase(Locale.US);
      }
      var networkCountry = tm.getNetworkCountryIso();
      if (!TextUtils.isEmpty(networkCountry)) {
        return networkCountry.toUpperCase(Locale.US);
      }
    }
    return getContext().getResources().getConfiguration().getLocales().get(0).getCountry().toUpperCase(Locale.US);
  }

  /**
   * Own version of restartApp, inspired by the now-obsolete @kristianheljas/capacitor-app-restart plugin
   * <a href="https://github.com/kristianheljas/capacitor-app-restart/blob/main/android/src/main/java/ee/kristian/capacitorapprestart/CapacitorAppRestartPlugin.java">...</a>
   */
  @PluginMethod
  public void restartApp(PluginCall call) {
    var context = getContext();
    var packageManager = context.getPackageManager();
    Intent intent = packageManager.getLaunchIntentForPackage(context.getPackageName());
    ComponentName componentName = null;
    if (intent != null) {
      componentName = intent.getComponent();
    }
    Intent mainIntent = Intent.makeRestartActivityTask(componentName);

    mainIntent.setPackage(context.getPackageName());
    context.startActivity(mainIntent);
    Runtime.getRuntime().exit(0);
  }

}
