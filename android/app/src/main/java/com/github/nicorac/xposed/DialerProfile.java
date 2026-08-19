package com.github.nicorac.xposed;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Everything this module needs to know about one phone app's layout.
 *
 * All of it is resource *entry names*, never class or method names: R8 renames classes
 * and methods but leaves resource names alone, which is what makes a single
 * implementation work against an obfuscated build.
 *
 * Adding support for another dialer means adding a profile here and listing it in
 * {@link DialerProfiles}. Nothing outside this file needs to change: the decoration,
 * identification and playback code is written against these names alone.
 *
 * A field left empty simply disables the feature that depends on it, so a partial
 * profile is a legitimate way to start.
 */
class DialerProfile {

  /** Package this profile describes; empty means "any", used by the fallback. */
  final String packageName;

  /** Human-readable, for the log. */
  final String label;

  /**
   * Containers holding the row's small status glyphs (HD, wifi calling, ...).
   * The "this call was recorded" dot is appended to one of these.
   *
   * It must be *appended*: these containers are often index-addressed by the host, and
   * inserting ahead of their own children has crashed a dialer before.
   */
  final List<String> glyphContainers;

  /** Ids of the action buttons shown when a call-log row is expanded. */
  final List<String> actionIds;

  /**
   * Suffixes that also count as an action button, for forks that use their own names.
   * Two or more matching siblings are treated as an action row.
   */
  final List<String> actionSuffixes;

  /** Roots of a single call-log or history row, used to recognise and dump one. */
  final List<String> rowRoots;

  /** Container of one per-contact history entry, if the dialer has that screen. */
  final List<String> historyContainers;

  /** Id of the duration label inside a history entry; the play control sits near it. */
  final String historyDurationId;

  /** Id of the date/time label inside a history entry. */
  final String historyTimeId;

  /** Id of the grouped-call counter; a visible one means the row covers several calls. */
  final String groupCountId;

  /**
   * Fragment identifying the "open call history" action by the *string resource* its
   * label came from. The slot is positional and the text is localised, so neither can
   * be used.
   */
  final String historyActionResource;

  /**
   * Resource-name prefixes stripped before testing {@link #historyActionResource}.
   * Google names every string on that screen conversation_history_*, so an unstripped
   * test matches every button.
   */
  final List<String> resourcePrefixesToStrip;

  DialerProfile(String packageName, String label,
                List<String> glyphContainers,
                List<String> actionIds,
                List<String> actionSuffixes,
                List<String> rowRoots,
                List<String> historyContainers,
                String historyDurationId,
                String historyTimeId,
                String groupCountId,
                String historyActionResource,
                List<String> resourcePrefixesToStrip) {
    this.packageName = packageName;
    this.label = label;
    this.glyphContainers = Collections.unmodifiableList(glyphContainers);
    this.actionIds = Collections.unmodifiableList(actionIds);
    this.actionSuffixes = Collections.unmodifiableList(actionSuffixes);
    this.rowRoots = Collections.unmodifiableList(rowRoots);
    this.historyContainers = Collections.unmodifiableList(historyContainers);
    this.historyDurationId = historyDurationId;
    this.historyTimeId = historyTimeId;
    this.groupCountId = groupCountId;
    this.historyActionResource = historyActionResource;
    this.resourcePrefixesToStrip = Collections.unmodifiableList(resourcePrefixesToStrip);
  }

  //#region queries used by the rest of the module

  boolean isActionId(String resourceName) {
    if (resourceName == null) return false;
    if (actionIds.contains(resourceName)) return true;
    for (String suffix : actionSuffixes) {
      if (resourceName.endsWith(suffix)) return true;
    }
    return false;
  }

  boolean isRowRoot(String resourceName) {
    return resourceName != null && rowRoots.contains(resourceName);
  }

  boolean isGlyphContainer(String resourceName) {
    return resourceName != null && glyphContainers.contains(resourceName);
  }

  boolean isHistoryContainer(String resourceName) {
    return resourceName != null && historyContainers.contains(resourceName);
  }

  /** Is this the label of the "open call history" action? */
  boolean isHistoryAction(String resourceName) {
    if (resourceName == null || historyActionResource.isEmpty()) return false;
    String name = resourceName.toLowerCase(java.util.Locale.US);
    for (String prefix : resourcePrefixesToStrip) {
      name = name.replace(prefix, "");
    }
    return name.contains(historyActionResource);
  }

  //#endregion

  static List<String> list(String... values) {
    return Arrays.asList(values);
  }
}
