# Version history

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
