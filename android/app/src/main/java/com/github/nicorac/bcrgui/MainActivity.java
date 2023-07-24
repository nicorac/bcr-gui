package com.github.nicorac.bcrgui;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import com.github.nicorac.plugins.capacitorandroidsaf.AndroidSAFPlugin;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(AndroidSAFPlugin.class);
    super.onCreate(savedInstanceState);
  }

}
