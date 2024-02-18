package com.github.nicorac.plugins.audioplayer;

import android.media.MediaPlayer;

public class MediaPlayerInstance {
  public final int id;
  public final MediaPlayer player;
  public final String title;
  public final String text;
  MediaPlayerInstance(int id, MediaPlayer player, String title, String text) {
    this.id = id;
    this.player = player;
    this.title = title;
    this.text = text;
  }
}
