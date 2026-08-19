package com.github.nicorac.bcrgui;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import com.github.nicorac.plugins.androiddatetimesettings.AndroidDateTimeSettingsPlugin;
import com.github.nicorac.plugins.androidsaf.AndroidSAFPlugin;
import com.github.nicorac.plugins.audioplayer.AudioPlayerPlugin;
import com.github.nicorac.plugins.bcrgui.BcrGuiPlugin;
import com.github.nicorac.xposed.DialerLink;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AndroidSAFPlugin.class);
    registerPlugin(AndroidDateTimeSettingsPlugin.class);
    registerPlugin(AudioPlayerPlugin.class);
    registerPlugin(BcrGuiPlugin.class);
    super.onCreate(savedInstanceState);

    // URI grants are dropped on reboot, so re-issue them every start: without one the
    // dialer cannot even see our provider on Android 11+ (package visibility).
    DialerLink.grantToDefaultDialer(this);
  }

}
