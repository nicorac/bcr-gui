# Version history

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
