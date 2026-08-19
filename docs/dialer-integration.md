# Dialer integration (Xposed module)

Shows call recordings inside the phone app itself:

- a **dot** on call-log rows whose call was recorded, alongside the HD / wifi-call glyphs
- a **Play** button in the expanded row's action list
- a **dot on the History action** when the contact has recordings on *other* calls
- a **play button per entry** on a contact's history screen
- a small player: seek bar, play/pause, skip by the seek step configured in BCR-GUI

BCR-GUI's own APK **is** the Xposed module — there is no second app to install. The
module declaration is inert without a framework, so the same APK remains an ordinary
app on a non-rooted device.

## Requirements

- Rooted device with an Xposed framework: **Vector** or **LSPosed**
- BCR-GUI installed, with its recordings directory already selected
- The phone app must be the device's **current default dialer**

## Setup

1. Install the APK.
2. BCR-GUI → **Settings → Phone app integration** → enable.
3. In your Xposed manager: enable **BCR-GUI** as a module and tick your phone app in
   its scope. Ticking BCR-GUI itself is optional — see *Module status* below.
4. Open the phone app. Enabling the setting takes effect within a minute; no
   force-stop is needed.

## How a row is matched to a recording

The dialer is obfuscated, so nothing is identified by class or method name. Three
independent routes, in order of preference:

| Screen | How the call is identified |
|---|---|
| Call log | the view holder's model, walked by field *type and value shape* |
| History | the instant behind the row's date label, captured from the platform formatter |
| fallback | day/hour/minute digits read from the label, or the call's duration |

**Timestamps come from the formatter, not from parsing text.** `DateUtils` and
`DateFormat` are hooked and each rendered string is mapped back to the instant it was
rendered from, so `"3 ene, 15:29"` yields an exact millisecond value — including the
year and seconds, which the string itself does not contain. Locale, date order and
month names never enter into it.

**Values that cannot be a call time are rejected.** The model walk selects longs by
shape, and the dialer holds a fixed epoch-looking constant. A value seen against three
different phone numbers is discarded, together with the cached field path that
produced it.

**Ambiguity yields nothing.** If two recordings fit a row equally well, no button is
shown. A control that plays the wrong call is worse than no control.

Grouped call-log rows get **no play button** — the row stands for several calls, so one
button cannot say which. They get the badge, and the dot on History points at the
per-call buttons there.

## Layout targets

Driven by *resource entry names*, which R8 does not rename, rather than by class names:

| What | Google Dialer | AOSP Dialer |
|---|---|---|
| action row | `action_button_container` | `call_log_entry_actions_stub` children |
| action buttons | `conversation_history_call_log_button_first…fourth` | `details_action`, `send_message_action`, … |
| status glyphs | `first_line_icon_container` | same |
| history entry | `swipeableContainer`, anchored near `call_duration` | — |

The History action is found by the **string resource** behind its label
(`conversation_history_button_history`), since its slot id is positional and its text is
localised.

Only Google Dialer has been tested. The AOSP paths are implemented but unverified.

## Module status

BCR-GUI reports the integration as active on either of two signals:

- `ModuleStatus.isModuleActive()` — a method hooked to return true, which only proves
  the module was loaded into BCR-GUI's own process, and requires BCR-GUI to be in the
  module's scope
- **a recent query from the dialer**, recorded by the provider — direct evidence the
  feature works, and true even when the framework does not scope the module to BCR-GUI

## Architecture

```
  dialer process                          BCR-GUI process
  ──────────────                          ───────────────
  DialerHook                              RecordingsProvider
   │ decorates rows from the list's           │ reads the recordings DB and directory
   │ own layout and scroll passes             │ over its persisted SAF grant
   │                                          │
   ├── lookup(number, instant) ─────────────► │ match within a 2-minute window
   ├── openFile(audio/<opaque-id>) ─────────► │ read-only file descriptor
   └── MiniPlayer (MediaPlayer + dialog)
```

- **The dialer never touches the recordings directory.** It holds no storage
  permission and never receives a SAF uri — only an opaque id and a file descriptor.
- **The provider refuses everything** that is not BCR-GUI or the current default
  dialer, and refuses all of it while the integration is disabled.
- **URI grants work around package visibility.** On Android 11+ the dialer cannot
  resolve our authority without a `<queries>` entry we cannot add to its manifest, so
  BCR-GUI grants it a read permission on every start (grants do not survive a reboot).

### Framework APIs

Two entry points are declared; whichever the framework supports is used, and
installation is idempotent so a framework offering both cannot hook twice.

| API | Declared in | Notes |
|---|---|---|
| libxposed 102 | `META-INF/xposed/java_init.list` | Vector 2.2 uses this |
| XposedBridge | `assets/xposed_init` | anything older |

Both drive the same code through the `Hooks` facade, which is the only place either API
appears. Neither API is packaged — both dependencies are `compileOnly`.

### Decoration is state-driven, not remembered

Rows are recycled, so every control re-derives what it should show on each pass and
reads its current state off the view rather than from a cache. Anything remembered
about a view is invalidated by a fingerprint of what the row displays. This was the
source of most of the bugs found on device: a badge left visible over a recycled row, a
play button still holding a previous call's recording, a mark not restored after the
host rebuilt its button.

Failures are never cached as negatives — an unanswered lookup is retried, since
BCR-GUI's process may simply have been starting.

## Performance

- recordings DB parsed once and re-read only when its mtime changes, checked at most
  every 10s
- directory listed at most every 30s
- lookups go through an index bucketed on the last 7 digits, not a scan per row
- the identity walk caches the field path that produced an answer and replays it
- the dialer-side view-holder field is resolved once per LayoutParams class

## Logs

```bash
adb logcat -s BcrGuiXposed
adb pull /sdcard/Android/data/<dialer-package>/files/bcr-gui-xposed.log
```

The file lives in the **dialer's** external files dir — the module runs in that process
— and needs no root to pull. Truncated at 512 KB. Distinct lines are logged once each,
so a scrolling list does not drown the interesting ones. Phone numbers and contact
names are masked; dates and durations are not, since they are what most failures are
judged on.

Long-pressing an injected button dumps the row's view tree and view-holder model,
masked, and shows a toast with the file path.

## Known limitations

- **Only the default dialer is served** — by design; it is the check that keeps other
  apps out.
- **Only Google Dialer is tested.**
- **A recording BCR-GUI has not indexed yet** is found by listing the directory and
  parsing its filename with the pattern configured in settings. If that pattern does
  not match, the file's mtime is used, which is when the recording *ended*.
- **Two recordings matching one row equally** produce no button.
- **After updating BCR-GUI, force-stop the dialer** — Xposed keeps the old module dex
  in the host process until it restarts.

## Building

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64      # AGP 8.5 needs JDK 17
export ANDROID_HOME=$HOME/Android/Sdk

npx ng build --configuration production
npx cap sync android
cd android && ./gradlew assembleDebug        # or assembleRelease with a keystore
```

The debug variant installs as `com.github.nicorac.bcrgui.debug`, side by side with a
release install. Its recordings directory must be granted again, and the Xposed scope
must tick the `.debug` package.

`assembleRelease` needs `ANDROID_KEYSTORE_PROPS` pointing at a `keystore.properties`
file; without it the release build is unsigned and debug builds are unaffected.
