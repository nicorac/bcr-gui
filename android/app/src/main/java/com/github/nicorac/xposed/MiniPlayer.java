package com.github.nicorac.xposed;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Minimal playback UI shown from the dialer's call log.
 *
 * Built entirely from platform widgets and {@code android.R} drawables: the module is
 * loaded into the dialer's process and has no access to BCR-GUI's resources, so
 * anything referencing our own R would crash. Using the platform's own dialog and
 * media icons also makes it inherit the dialer's theme for free.
 */
final class MiniPlayer {

  private static final SimpleDateFormat MMSS = new SimpleDateFormat("mm:ss", Locale.US);
  private static final SimpleDateFormat DATE_FMT =
    new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);

  /** Only ever one player at a time. */
  private static MiniPlayer current;

  private final MediaPlayer player = new MediaPlayer();
  private final Handler ui = new Handler(Looper.getMainLooper());
  private final AudioManager audio;
  private final AudioManager.OnAudioFocusChangeListener focusListener;

  private Dialog dialog;
  private SeekBar seekBar;
  private TextView elapsed;
  private TextView total;
  private ImageButton playPause;
  private boolean userIsSeeking;
  private boolean released;

  private final Runnable tick = new Runnable() {
    @Override
    public void run() {
      if (released) return;
      try {
        if (!userIsSeeking) {
          seekBar.setProgress(player.getCurrentPosition());
          elapsed.setText(fmt(player.getCurrentPosition()));
        }
      } catch (Throwable ignored) {
        // player torn down between frames
      }
      ui.postDelayed(this, 500);
    }
  };

  static void show(Context ctx, Uri audioUri, String title, long date, RecordingIndex.Config cfg) {
    try {
      if (current != null) current.release();
      current = new MiniPlayer(ctx, audioUri, title, date, cfg);
    } catch (Throwable t) {
      XLog.e("cannot start playback", t);
      Toast.makeText(ctx, "BCR-GUI: cannot play this recording", Toast.LENGTH_SHORT).show();
    }
  }

  private MiniPlayer(Context ctx, Uri audioUri, String title, long date,
                     RecordingIndex.Config cfg) throws Exception {

    audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
    focusListener = change -> {
      if (change == AudioManager.AUDIOFOCUS_LOSS
        || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
        pause();
      }
    };

    player.setAudioStreamType(AudioManager.STREAM_MUSIC);
    player.setDataSource(ctx, audioUri);
    player.prepare();

    if (cfg.playbackSpeed > 0 && cfg.playbackSpeed != 1f
      && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        player.setPlaybackParams(player.getPlaybackParams().setSpeed(cfg.playbackSpeed));
      } catch (Throwable t) {
        XLog.w("playback speed not supported", t);
      }
    }

    buildDialog(ctx, title, date, cfg.seekTime);

    player.setOnCompletionListener(mp -> {
      playPause.setImageResource(android.R.drawable.ic_media_play);
      seekBar.setProgress(player.getDuration());
      elapsed.setText(fmt(player.getDuration()));
    });
    player.setOnErrorListener((mp, what, extra) -> {
      XLog.w("MediaPlayer error what=" + what + " extra=" + extra);
      Toast.makeText(ctx, "BCR-GUI: playback error", Toast.LENGTH_SHORT).show();
      release();
      return true;
    });

    start();
  }

  //#region UI

  private void buildDialog(Context ctx, String title, long date, int seekSeconds) {

    float d = ctx.getResources().getDisplayMetrics().density;
    int pad = (int) (16 * d);

    LinearLayout root = new LinearLayout(ctx);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(pad, pad, pad, pad / 2);

    // ---- progress row: elapsed | seekbar | total
    LinearLayout progress = new LinearLayout(ctx);
    progress.setOrientation(LinearLayout.HORIZONTAL);
    progress.setGravity(Gravity.CENTER_VERTICAL);

    elapsed = new TextView(ctx);
    elapsed.setText(fmt(0));
    elapsed.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);

    seekBar = new SeekBar(ctx);
    seekBar.setMax(Math.max(player.getDuration(), 1));
    LinearLayout.LayoutParams sbLp = new LinearLayout.LayoutParams(
      0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    sbLp.leftMargin = sbLp.rightMargin = (int) (8 * d);
    seekBar.setLayoutParams(sbLp);
    seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      @Override
      public void onProgressChanged(SeekBar sb, int value, boolean fromUser) {
        if (fromUser) elapsed.setText(fmt(value));
      }

      @Override
      public void onStartTrackingTouch(SeekBar sb) { userIsSeeking = true; }

      @Override
      public void onStopTrackingTouch(SeekBar sb) {
        userIsSeeking = false;
        seekTo(sb.getProgress());
      }
    });

    total = new TextView(ctx);
    total.setText(fmt(player.getDuration()));
    total.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);

    progress.addView(elapsed);
    progress.addView(seekBar);
    progress.addView(total);

    // ---- transport row: rewind | play/pause | forward
    LinearLayout transport = new LinearLayout(ctx);
    transport.setOrientation(LinearLayout.HORIZONTAL);
    transport.setGravity(Gravity.CENTER);
    transport.setPadding(0, pad / 2, 0, 0);

    final int step = Math.max(seekSeconds, 1) * 1000;
    transport.addView(iconButton(ctx, android.R.drawable.ic_media_rew,
      "Back " + seekSeconds + "s", v -> seekBy(-step)));
    playPause = iconButton(ctx, android.R.drawable.ic_media_pause, "Play/pause",
      v -> togglePlayPause());
    transport.addView(playPause);
    transport.addView(iconButton(ctx, android.R.drawable.ic_media_ff,
      "Forward " + seekSeconds + "s", v -> seekBy(step)));

    root.addView(progress);
    root.addView(transport);

    String subtitle = date > 0 ? DATE_FMT.format(new Date(date)) : null;

    dialog = new AlertDialog.Builder(ctx)
      .setTitle(title == null || title.isEmpty() ? "Recording" : title)
      .setMessage(subtitle)
      .setView(root)
      .setOnDismissListener(dlg -> release())
      .create();
    dialog.show();
  }

  private ImageButton iconButton(Context ctx, int drawable, String desc, View.OnClickListener cb) {
    float d = ctx.getResources().getDisplayMetrics().density;
    ImageButton b = new ImageButton(ctx);
    b.setImageResource(drawable);
    b.setContentDescription(desc);
    b.setOnClickListener(cb);
    // borderless look without pulling in any of our own styles
    android.util.TypedValue tv = new android.util.TypedValue();
    if (ctx.getTheme().resolveAttribute(
      android.R.attr.selectableItemBackgroundBorderless, tv, true)) {
      b.setBackgroundResource(tv.resourceId);
    } else {
      b.setBackground(null);
    }
    int m = (int) (12 * d);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    lp.leftMargin = lp.rightMargin = m;
    b.setLayoutParams(lp);
    return b;
  }

  //#endregion

  //#region transport

  private void start() {
    requestFocus();
    player.start();
    playPause.setImageResource(android.R.drawable.ic_media_pause);
    ui.removeCallbacks(tick);
    ui.post(tick);
  }

  private void pause() {
    if (player.isPlaying()) {
      player.pause();
      playPause.setImageResource(android.R.drawable.ic_media_play);
    }
  }

  private void togglePlayPause() {
    if (player.isPlaying()) pause();
    else start();
  }

  private void seekBy(int deltaMs) {
    seekTo(player.getCurrentPosition() + deltaMs);
  }

  private void seekTo(int posMs) {
    int clamped = Math.max(0, Math.min(posMs, player.getDuration()));
    player.seekTo(clamped);
    seekBar.setProgress(clamped);
    elapsed.setText(fmt(clamped));
  }

  @SuppressWarnings("deprecation")
  private void requestFocus() {
    // The pre-26 call is deprecated but still honoured on every supported release,
    // and avoids branching for a request this simple.
    if (audio != null) {
      audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
    }
  }

  @SuppressWarnings("deprecation")
  private void release() {
    if (released) return;
    released = true;
    ui.removeCallbacks(tick);
    try {
      player.release();
    } catch (Throwable ignored) {
      // already gone
    }
    if (audio != null) audio.abandonAudioFocus(focusListener);
    if (dialog != null && dialog.isShowing()) {
      try {
        dialog.dismiss();
      } catch (Throwable ignored) {
        // activity already finishing
      }
    }
    if (current == this) current = null;
  }

  //#endregion

  private static String fmt(int ms) {
    if (ms < 0) ms = 0;
    if (ms >= 3600_000) {
      return String.format(Locale.US, "%d:%02d:%02d",
        ms / 3600_000, (ms / 60_000) % 60, (ms / 1000) % 60);
    }
    synchronized (MMSS) {
      return MMSS.format(new Date(ms));
    }
  }
}
