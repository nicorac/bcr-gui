# Version history

## Version 0.0.4 (2023-08-23)

- fixed native Android plugin to deeply speed up recordings directory read (now more than 100x faster)
- new recordings database cache, to avoid parsing the same files over and over, gives blazing fast access to recordings list (tested with 1000+ recordings & json files)
- added loading animation to recordings list
- recordings list is now disabled while refreshing database

## Version 0.0.3 (2023-08-18)

- New "delete recordings" feature
- Removed unimplemented features buttons
- Fixed call direction icon in recordings list
- Improved error handling

## Version 0.0.2 (2023-08-09)

- New setting to change default recordings list sort

## Version 0.0.1 (2023-08-08)

- First working version
