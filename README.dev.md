# Ionic + Capacitor + Angular base project template

This is a base template to build an Android (and iOS) app using the following libraries:

Library     | Version
------------|--------
Ionic       | 7
Capacitor   | 5.2
Angular     | 16.1

## Ionic VSCode extension

Most of the following tasks could also be done with the official [Ionic VSCode extension](https://marketplace.visualstudio.com/items?itemName=ionic.ionic). Anyway, "_manually_" doing them gives you the full power 🚀.

## How to use and customize the template

### clone GIT repository

`git clone https://github.com/nicorac/ionic-capacitor-angular-template.git`

### App name

Choose a name for your app, like "**Brisk byte**", and an unique namespace.

Since `namespace+appId` must be globally unique, you should use your domain name as prefix, like `example.org.briskbyte`.

Now set custom values in the following files:

Item        | File                                                              | Sample value
------------|-------------------------------------------------------------------|--------------------------------------
Namespace   | [./android/app/build.gradle#L5](./android/app/build.gradle#L75)   | `example.org.briskbyte`<br>_codename_, lowercase no whitespaces
App ID    | [./android/app/build.gradle#L7](./android/app/build.gradle#L7)

/android/app/build.gradle#L5

### Template values

replace template default values with yours:

Element   | Search (template value)     | Replace with (new value)  | Notes
----------|-----------------------------|---------------------------|--------------------------------------------------------------------------------------------------------
App id    | `org.example.myappcodename` | `com.domain.briskbyte`    |  application unique id (must be globally unique, so include your full domain, **lowercase, no dashes**)
Code name | `myappcodename`             | `briskbyte`               |  lowercase, no dashes
Namespace | `org.example`               | `com.domain`              |  should be unique, so better use your domain
App name  | `My App Name`               | `Brisk byte`              |  application "human-readable" name (no formatting limits)

### Android **main activity** class file

**Main Activity** Android class file must be in a subfolder like `Namespace/Codename` (see table above).

So you must rename template file
`android/app/src/main/java/org/example/bcrgui/MainActivity.java`
to `android/app/src/main/java/com/domain/briskbyte/MainActivity.java`.

### Set your own app icon

Use `npm run generate-assets` script to generate icons for your application (it will launch `capacitor-assets` tool).

It needs a starting `[icon|logo].[png|svg]` file in `app/src/assets/icons` directory, containing your app icon to generate all the required assets for the app. You can also provide an optional `[icon|logo]-dark.[png|svg]` icon to be used in **dark mode**.

WARNING: the required icon `android/app/src/main/play_store_512.png` is not (yet) generated by the tool, so it must be created manually.

<https://capacitorjs.com/docs/guides/splash-screens-and-icons>

<https://github.com/ionic-team/capacitor-assets>

**OLD:**

Use an external tool (like [Icon kitchen](https://icon.kitchen)) to generate your app icons, then store them in these folders:

Description         | Folder
--------------------|--------------------------------
Android app icons   | `android/app/src/main/res`
About page icon     | `src/assets/icons/app-icon.png`

### `package.json` file

Edit `author` and `description` fields in `package.json` file.

### Application version

Application version must be set into these files:

- `src\app\version.ts`
- `android\app\build.gradle` --> versionName
- `package.json` (not mandatory...)

## VSCode debug

`.vscode/launch.json` file includes configurations to launch & debug application, both locally and externally on an Android device.

- `All (local)` starts local Ionic/Angular server and opens Chrome to debug application **locally**
- `All (ext)` starts external Ionic/Angular server and opens/debugs application on an external Android device

## Manual remote debug (on external Android device)

(ref: <https://ionic.io/blog/debugging-tips-for-your-ionic-app>)

- Install VSCode Android WebView Debugging extension \
  <https://marketplace.visualstudio.com/items?itemName=mpotthoff.vscode-android-webview-debug>

- Start the Capacitor app on external device

  `ionic cap run android --livereload --external`

- Attach VSCode debugger

## Open Android Studio for this project

`npx cap open android`

## Build final apk

- Build app (Web part) \
  `ionic capacitor build android --prod`
- **Android Studio** will open at the end, now build Android app (pressing `F7`)
- Resulting APK is in `./android/app/build/outputs/apk`

## Ionic components

<https://ionicframework.com/docs/components>

## Credits

This template project was created by [Claudio Nicora](https://github.com/nicorac) thanks to:

- Ionic
- Angular
- VSCode

If it helped you, feel free to contribute or [donate](https://coolsoft.altervista.org/en/donate).
