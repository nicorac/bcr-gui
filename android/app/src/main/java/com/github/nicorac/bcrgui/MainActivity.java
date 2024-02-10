package com.github.nicorac.bcrgui;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import com.github.nicorac.plugins.androiddatetimesettings.AndroidDateTimeSettingsPlugin;
import com.github.nicorac.plugins.androidsaf.AndroidSAFPlugin;
import com.github.nicorac.plugins.bcrgui.BcrGuiPlugin;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AndroidSAFPlugin.class);
    registerPlugin(AndroidDateTimeSettingsPlugin.class);
    registerPlugin(BcrGuiPlugin.class);
    super.onCreate(savedInstanceState);
  }

}
