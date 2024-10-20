package com.github.nicorac.plugins.audioplayer;

import androidx.annotation.IntDef;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

public class AudioDeviceEnum {

  // output audio device management
  public static final int DEVICE_UNDEFINED = 0;
  public static final int DEVICE_LOUDSPEAKER = 1;
  public static final int DEVICE_EARPIECE = 2;

  @Retention(RetentionPolicy.SOURCE)
  @Target({ElementType.FIELD, ElementType.PARAMETER})
  @IntDef({DEVICE_UNDEFINED, DEVICE_LOUDSPEAKER, DEVICE_EARPIECE})
  public @interface AudioDeviceValue { }

}
