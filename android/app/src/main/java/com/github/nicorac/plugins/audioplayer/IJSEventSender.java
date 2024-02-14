package com.github.nicorac.plugins.audioplayer;

import com.getcapacitor.JSObject;

public interface IJSEventSender {
  void sendJSEvent(String eventName, JSObject data);
}
