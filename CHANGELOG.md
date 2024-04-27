# Version history

## Version 1.7.4 (2024-04-27)

Bug fixes:

- Added icons to multiselection menu items
- Fixed add contact icon
- Fixed call duration (removed seconds decimals)
- Updated translations (German, Russian)

## Version 1.7.3 (2024-04-02)

New features:

- New language supported: German (thanks to Xfox20, upbox-org)
- New language supported: Vietnamese (thanks to ngocanhtve)

## Version 1.7.2 (2024-03-28)

New features:

- New language supported: Russian (thanks to MZhuvka Skykin)
- New language supported: Persian (thanks to @AlirezaParsi)

## Version 1.7.1 (2024-03-19)

New features:

- New language supported: Chinese simplified (thanks to @HuangSmith)
- New filename template to support ColorOS call recorder
- New filename placeholder `{date:year2}` to parse 2 digits years (no century)

Bug fixes:

- Fixed home page "pull to refresh" translation

## Version 1.7.0 (2024-03-17)

New features:

- Added application localizations (#99). \
  Currently supported languages:
  - English (@nicorac)
  - Italian (@nicorac)
  - Spanish (thanks to @gallegonovato)

Bug fixes:

- Fixed layout of filename pattern editor placeholders and templates action sheets

## Version 1.6.1 (2024-03-07)

New features:

- Added support to AMR-WB and AMR-WB+ recordings (fixes #96)

## Version 1.6.0 (2024-02-29)

New features:

- Added support to AMR recordings (fixes #81)
- Replaced light splash screen images with dark versions, to avoid "flashing" at startup in dark mode
- Improved play notification, now including play progress
- Clicking play notification now brings the app to foreground

## Version 1.5.0 (2024-02-18)

New features:

- Added background audio play support: now the application continue playing when the app is minimized and/or the screen is switched off
- New system notification now shown when playing to let user bring the app back on foreground

Bug fixes:

- Removed warning message `Missing .json metadata file!` (almost useless to user)

## Version 1.4.1 (2024-02-14)

Bug fixes:

- Fixed support for AM/PM datetime parsing in filenames (#63)

- Fixed missing support for AM/PM in custom date format (#75)

## Version 1.4.0 (2024-02-10)

New features:

- Improved create/edit contact action by using default Android intent. \
  Now it is possible to:
  - create a new contact with the given phone number
  - append phone number to already existing contact
  - select contact storage (local, cloud, ...)
  - change all other contact fields

Bug fixes:

- Improved recording list scrollbar smoothness

- Increased spacing between recording play buttons

## Version 1.3.0 (2024-01-26)

New features:

- Added filename template for Huawei call recorder

Bug fixes:

- Fixed and improved performance of recordings list scrollbar

## Version 1.2.0 (2024-01-21)

New features:

- Application now uses Angular 17

- Uniformed style of "modal action sheets" and "action sheets"

- Improved dark mode readability (list, messageboxes, background, ...)

- Removed unused (and never used) READ_EXTERNAL_STORAGE permission

Bug fixes:

- Added missing Contacts permission check to "Create contact..." action

## Version 1.1.0 (2024-01-20)

New features:

- New setting to configure the default phone country prefix (i.e. `+39` for Italy and `+1` for the US). This will be used to improve contacts search and let it find the ones missing it.

- New feature to copy recording number to clipboard

## Version 1.0.0 (2024-01-05)

App is now stable and (almost) feature-complete, so it's time to switch to a **full** version number 😉.

New features:

- New features to synchronize recordings with phone Contacts, accessible with the **pencil icon** within each recording:

  - **create a new contact** with recording phone number \
    (to be used after recording a call from an unknown contact)
  - **search existing contact** with recording phone number \
    (to be used if you've already created the contact after recording the call)
  - **manual edit** \
    (if you changed your mind in both cases 🙄)

## Version 0.0.25 (2023-12-31)

Bug fixes:

- Improved directory change detection to update list at application start/resume

## Version 0.0.24 (2023-12-21)

New features:

- Added new filename pattern placeholders, to customize datetime format parsing

- Improved filename pattern editor

- Added support for pattern templates (to support additional call recorders)

- Added support for GrapheneOS embedded call recorder filename pattern

## Version 0.0.23 (2023-12-09)

New features:

- Recordings list can now be searched & filtered

Bug fixes:

- Wrapped multiselect actions in a toolbar context menu, shown in multiselect mode

- Date format changes are now applied immediately (no need to restart the app)

## Version 0.0.22 (2023-12-03)

New features:

- Screen is kept awake while playing to avoid play stop (workaround for issue #20)

Bug fixes:

- Recording share button is now disabled while waiting for the "Android share" dialog to appear (it could require some time if recording file is big)

## Version 0.0.21 (2023-12-03)

New features:

- Recordings database autorefresh on application resume (i.e. getting back from a call...)

## Version 0.0.20 (2023-11-22)

Bug fixes:

- Fixed Settings page always opening DateTime format editor

## Version 0.0.19 (2023-11-18)

New features:

- Added option to set a custom datetime format

Bug fixes:

- Datetime format now respects Android 12/24H setting (overriding selected culture defaults)

## Version 0.0.18 (2023-11-05)

New features:

- Added filename parser support for customized filename patterns

- Hardware back button press now navigates back to home page instead of closing the app

## Version 0.0.17 (2023-11-03)

Bug fixes:

- Default values not correctly deserialized for new settings

- Fixed rendering of items with caller name longer than one line

## Version 0.0.16 (2023-11-01)

New features:

- New player buttons to seek reverse/forward while playing a recording

## Version 0.0.15 (2023-10-30)

New features:

- Deeply improved native AndroidSAF code, now optimized to manage thousands of recordings (tested with 2000+ records)

- New optimized "virtual" recordings list, it can now easily handle thousands rows with low memory footprint and no stuttering

- Added custom scrollbar to recordings list, to ease list scrolling

## Version 0.0.14 (2023-10-08)

Bug fixes:

- Fixed NativeAudio plugin to avoid other audio applications be pauses at app start

- Deleting entries from list does not update DB for entries without metadata file

## Version 0.0.13 (2023-09-26)

New features:

- App recordings database is now an accessible file (`.bcr-gui.database.json`) stored in the same folder as BCR audio files; it allows app to be uninstalled/reinstalled/moved preserving its database content (in anticipation of new features that will allow adding notes, tags, ... to recordings)

- Improved database management

Bug fixes:

- Recordings database is not updated after a delete
- Long press not working on some devices

## Version 0.0.12 (2023-09-20)

New features:

- Recordings list can now be updated with a pull-down gesture
- Recordings list now supports multiselection mode; long press on an element to activate it
- Batch delete of recordings (thanks to multiselection feature above)

## Version 0.0.11 (2023-09-15)

New features:

- Application now also sets _Android navigation bar_ background color to match with theme

Bug fixes:

- Background color of Android status bar was not set correctly (always dark)

## Version 0.0.10 (2023-09-10)

New features:

- App now starts "Dark" as default, to avoid startup "Light" flashing

Bug fixes:

- Dark mode not applied when "Appearance = System preference"

## Version 0.0.9 (2023-09-08)

- New settings to customize date and time format

## Version 0.0.8 (2023-09-07)

- Fixed call icon rendering issues on old WebView versions
- Recording date is now rendered with current culture format

## Version 0.0.7 (2023-08-29)

- Added support to dark theme (user can force light/dark theme or use the system default)

## Version 0.0.6 (2023-08-27)

- New **Share** feature to share recordings audio files with other apps

## Version 0.0.5 (2023-08-23)

- Fixed bad cache encoding (not supporting UTF-8 data)
- At first start the app doesn't ask the user to select recordings directory

## Version 0.0.4 (2023-08-23)

- Fixed native Android plugin to deeply speed up recordings directory read (now more than 100x faster)
- New recordings database cache, to avoid parsing the same files over and over, gives blazing fast access to recordings list (tested with 1000+ recordings & json files)
- Added loading animation to recordings list
- Recordings list is now disabled while refreshing database

## Version 0.0.3 (2023-08-18)

- New "delete recordings" feature
- Removed unimplemented features buttons
- Fixed call direction icon in recordings list
- Improved error handling

## Version 0.0.2 (2023-08-09)

- New setting to change default recordings list sort

## Version 0.0.1 (2023-08-08)

- First working version
