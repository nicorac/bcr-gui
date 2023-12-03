# Version history

## Version 0.0.21 (2023-12-03)

New features

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
