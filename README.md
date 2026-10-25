# Productive Browser

A Chromium-based (Electron) browser that limits social media and YouTube to a set number of minutes per day, only during the hours you allow. Once saved, the rules are encrypted and locked until a date you choose, and the same sites are blocked in Chrome, Edge, Brave and Firefox so the limits can't be skipped.

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Browser | `src/main`, `src/renderer` | Tabs and address bar. Blocks requests to sites that are out of time and counts usage every second. |
| Service | `src/service` | Runs as a Windows service (LocalSystem). It holds the rules and usage, keeps time and enforces the lock. |
| Rules | `src/shared/rules.ts` | Daily quota + weekly windows, and the "tighten-only while locked" check. |

- **Lock:** while locked, you can only make rules stricter (fewer minutes, shorter hours, more sites, a longer lock).
- **Encryption:** state is sealed with AES-256-GCM in `C:\ProgramData\ProductiveBrowser`, which only SYSTEM and Administrators can access. If the file is edited or deleted, every preset site is blocked for 7 days ("strict mode").
- **Clock:** time comes from HTTPS `Date` headers (YouTube, Google, Cloudflare, Microsoft), so changing the Windows clock doesn't help. Offline, it never goes below the last time it saw.
- **Fail closed:** if the browser can't reach the service, all listed sites are blocked.
- **Other browsers:** the listed sites are always blocked there through enterprise policies (`chrome://policy` shows them), so all use goes through Productive Browser, where it's counted.

- **Content filter:** an optional [CleanBrowsing](https://cleanbrowsing.org/) DNS filter (Security, Adult or Family), part of the locked rules. This browser resolves every site through it with no fallback. Chrome, Edge, Brave and Firefox are forced to use it through their DNS-over-HTTPS policies.

Usage counts while a listed site is the active tab of the focused window, or while any tab on it is playing audio.

## Develop

Works on Windows and macOS.

```sh
npm install
npm run dev        # browser + a dev service (no browser policies are written in dev)
npm test           # rule engine, crypto, clock, lock, tamper and policy tests
npm run typecheck
```

Reset dev data:
- Windows: delete `%LOCALAPPDATA%\ProductiveBrowserDev` and `HKCU\Software\ProductiveBrowserDev`.
- macOS: delete `~/Library/Application Support/ProductiveBrowserDev` and `~/Library/Preferences/com.productivebrowser.dev.configured`.

## Build the installers

| Platform | Command | Output | Must be built on |
| --- | --- | --- | --- |
| Windows | `npm run dist:win` | `dist\Productive Browser Setup <version>.exe` | Windows |
| macOS | `npm run dist:mac` | `dist/Productive Browser-<version>-universal.pkg` (Intel + Apple Silicon) | macOS |

To build both without a Mac, push the project to GitHub and run the **Build installers** workflow (`.github/workflows/build.yml`) from the Actions tab. The installers appear as downloadable artifacts.

**Windows:** the installer needs admin rights. It installs the service with [WinSW](https://github.com/winsw/winsw) (downloaded by `scripts/fetch-winsw.mjs`). Uninstalling is refused while the rules are locked.

**macOS:** the `.pkg` asks for an admin password and installs the service as a LaunchDaemon running as root. The service keeps its data in `/Library/Application Support/ProductiveBrowser` (root only) and writes browser policies to `/Library/Managed Preferences` and Firefox's `policies.json`. To uninstall, run this (it refuses while the rules are locked):

```sh
sudo "/Applications/Productive Browser.app/Contents/Resources/mac/uninstall.sh"
```

Dragging the app to the Trash leaves the service and the other-browser blocks in place.

**Signing:** builds are unsigned for now. Windows SmartScreen and macOS Gatekeeper will warn before opening them. On macOS, right-click the `.pkg` and choose Open, or allow it in System Settings → Privacy & Security. Public distribution needs a code-signing certificate on both platforms, plus Apple notarization (an Apple Developer account) on macOS. electron-builder picks these up from `CSC_LINK`/`CSC_KEY_PASSWORD` and `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`.

## Limits

An administrator on the computer can still get around this, for example by stopping the service. The goal is enough friction that breaking the rules takes deliberate effort. Browsers without policy support (e.g. Opera, portable browsers) aren't blocked. On a Mac managed by an organization (MDM), its profiles can replace the Chromium browser policies.
