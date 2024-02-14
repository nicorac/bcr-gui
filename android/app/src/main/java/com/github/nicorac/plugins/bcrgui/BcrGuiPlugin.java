package com.github.nicorac.plugins.bcrgui;

import android.content.Intent;
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
      call.reject(result.toString());
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

}
