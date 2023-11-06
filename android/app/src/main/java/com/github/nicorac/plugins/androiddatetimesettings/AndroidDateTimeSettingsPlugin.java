package com.github.nicorac.plugins.androiddatetimesettings;

import android.text.format.DateFormat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidDateTimeSettings")
public class AndroidDateTimeSettingsPlugin extends Plugin {

  /**
   * Return true if time is currently set to 12-hours
   * (both by setting a culture that uses this format and/or by forcing it)
   */
  @PluginMethod()
  public void is12Hours(PluginCall call) {

    var ret = new JSObject();
    ret.put("is12Hours", !DateFormat.is24HourFormat(getContext()));
    call.resolve(ret);

  }

}
