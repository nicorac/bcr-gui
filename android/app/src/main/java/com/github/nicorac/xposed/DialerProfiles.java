package com.github.nicorac.xposed;

import java.util.Arrays;
import java.util.List;

import static com.github.nicorac.xposed.DialerProfile.list;

/**
 * The dialers this module knows about.
 *
 * To add one: write a profile, put it in {@link #ALL} ahead of the fallback, and check
 * the log line the module prints on startup to confirm it was selected. Nothing else
 * needs touching — everything downstream is written against {@link DialerProfile}.
 *
 * The resource names for a new dialer can be read straight out of the module's own
 * diagnostics: it dumps the view tree of each distinct row layout it meets, with ids,
 * and reports the string resources behind the action labels.
 */
final class DialerProfiles {

  /**
   * Google Dialer, verified on Android 16.
   *
   * Shares no call-log ids with AOSP: the expanded row is four fixed button slots
   * rather than named actions, and the per-contact history screen is its own layout.
   */
  static final DialerProfile GOOGLE = new DialerProfile(
    "com.google.android.dialer", "Google Dialer",
    /* glyphContainers */        list("first_line_icon_container"),
    /* actionIds */              list(
      "conversation_history_call_log_button_first",
      "conversation_history_call_log_button_second",
      "conversation_history_call_log_button_third",
      "conversation_history_call_log_button_fourth"),
    /* actionSuffixes */         list(),
    /* rowRoots */               list(
      "call_log_entry_root_constraint_layout",
      "conversation_history_call_details_entry_card"),
    /* historyContainers */      list("swipeableContainer"),
    /* historyDurationId */      "call_duration",
    /* historyTimeId */          "call_time",
    /* groupCountId */           "missed_call_count",
    /* historyActionResource */  "history",
    /* prefixesToStrip */        list("conversation_history"));

  /**
   * AOSP Dialer and the forks that inherit its layouts (LineageOS among them).
   *
   * Implemented from the AOSP sources but never exercised on a device, so treat any
   * behaviour here as unverified.
   */
  static final DialerProfile AOSP = new DialerProfile(
    "com.android.dialer", "AOSP Dialer",
    /* glyphContainers */        list("first_line_icon_container"),
    /* actionIds */              list(
      "call_action", "video_call_action", "set_up_video_action", "invite_video_action",
      "create_new_contact_action", "add_to_existing_contact_action",
      "send_message_action", "block_report_action", "block_action", "unblock_action",
      "report_not_spam_action", "details_action", "call_with_note_action",
      "call_compose_action", "share_voicemail"),
    /* actionSuffixes */         list("_action"),
    /* rowRoots */               list("call_log_list_item_view", "call_log_row",
                                      "call_details_entry_view"),
    /* historyContainers */      list(),
    /* historyDurationId */      "call_duration",
    /* historyTimeId */          "call_time",
    /* groupCountId */           "",
    /* historyActionResource */  "history",
    /* prefixesToStrip */        list());

  /**
   * Anything else the user scoped the module to.
   *
   * Recognises an action row by two or more sibling ids ending in a plausible suffix,
   * which is what vendor forks tend to produce. Enough to put a play button in the
   * right place on a dialer nobody has written a profile for; the history screen and
   * the grouped-row rules stay off, since those need names this cannot guess.
   */
  static final DialerProfile GENERIC = new DialerProfile(
    "", "generic",
    /* glyphContainers */        list("first_line_icon_container", "icon_container"),
    /* actionIds */              list(),
    /* actionSuffixes */         list("_action", "_action_button"),
    /* rowRoots */               list(),
    /* historyContainers */      list(),
    /* historyDurationId */      "call_duration",
    /* historyTimeId */          "call_time",
    /* groupCountId */           "",
    /* historyActionResource */  "",
    /* prefixesToStrip */        list());

  /** Consulted in order; the last entry matches anything. */
  static final List<DialerProfile> ALL = Arrays.asList(GOOGLE, AOSP, GENERIC);

  /** Profile for a package, never null. */
  static DialerProfile forPackage(String packageName) {
    for (DialerProfile p : ALL) {
      if (!p.packageName.isEmpty() && p.packageName.equals(packageName)) return p;
    }
    // Forks usually keep the layouts of whatever they were forked from, so a name
    // containing "dialer" is more likely to be AOSP-shaped than to be nothing at all.
    if (packageName != null && packageName.contains("dialer")) return AOSP;
    return GENERIC;
  }

  private DialerProfiles() {}
}
