package com.github.nicorac.plugins.bcrgui;

public record RawContactEntry(
  long contactId,
  String displayName,
  String rawNumber,
  String e164Number,
  String localizedLabel,
  boolean isPrimary
) {}

