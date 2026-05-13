#!/usr/bin/env bash
# Install Speech to Text GNOME Shell extension
set -e

EXT_DIR="$HOME/.local/share/gnome-shell/extensions/stt@pvmnsdev.gmail.com"
SRC="$(pwd)/dist/stt@pvmnsdev.gmail.com"

# Compile schemas
echo "Compiling GSettings schemas..."
glib-compile-schemas "$SRC/schemas/"

# Remove old symlink/directory
if [ -L "$EXT_DIR" ] || [ -d "$EXT_DIR" ]; then
    echo "Removing existing extension..."
    rm -rf "$EXT_DIR"
fi

# Create fresh install
echo "Installing extension to $EXT_DIR"
ln -s "$SRC" "$EXT_DIR"

echo ""
echo "Extension installed!"
echo "Restart GNOME Shell to apply:"
echo "  • Wayland: log out and log back in"
echo "  • X11: Alt+F2 → r → Enter"
echo ""
echo "Then enable via: gnome-extensions enable stt@pvmnsdev.gmail.com"
echo "Or use: gnome-extensions-app"
