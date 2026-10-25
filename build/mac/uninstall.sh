#!/bin/sh
# Uninstalls Productive Browser. Run with:
#   sudo "/Applications/Productive Browser.app/Contents/Resources/mac/uninstall.sh"
# Refused while the rules are locked, like the Windows uninstaller.
set -e
APP="/Applications/Productive Browser.app"
PLIST="/Library/LaunchDaemons/com.productivebrowser.service.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi
if ! "$APP/Contents/MacOS/Productive Browser" --can-uninstall; then
  echo "Your limits are locked. Productive Browser can be uninstalled after the lock ends." >&2
  exit 1
fi

# Remove the other-browser blocklists and filter DNS while the service code is still here.
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/Productive Browser" \
  "$APP/Contents/Resources/app.asar.unpacked/out/main/service.js" --remove-policies
launchctl bootout system/com.productivebrowser.service 2>/dev/null || true
rm -f "$PLIST" /Library/Preferences/com.productivebrowser.configured
rm -rf "/Library/Application Support/ProductiveBrowser" /Library/Logs/ProductiveBrowser "$APP"
echo "Productive Browser was uninstalled."
