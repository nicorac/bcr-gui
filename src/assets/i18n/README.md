# Application translation files

This directory contains BCR-GUI translation files.

Each translation file is a JSON object where each key uniquely identifies a translated content.

## Enabled cultures

File `_cultures.json` defines the enabled cultures for the application. Culture `name` must be inserted as spoken in that same language.

## Culture content files

Each culture file contains the translated content for a culture.

Filename identifies the culture using ISO language ([ISO-639-Set1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes)) + country ([ISO 3166-1-Alpha2](https://en.wikipedia.org/wiki/ISO_3166-1)) codes.

Example: `en-US.json` contains **English** language as spoken in **USA**.

## How to add a new culture

1. fork&clone repository (or edit it online [here](https://github.dev/nicorac/bcr-gui))
2. copy the reference language file `en-US.json` to a new file (i.e. `fr-FR.json`)
3. open the new language file and translate each item
4. open a pull request to merge your changes into sources

Please check [this issue](https://github.com/nicorac/bcr-gui/issues/99) for further info.
