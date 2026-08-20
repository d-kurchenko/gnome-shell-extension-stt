/**
 * Keyboard shortcut capture button.
 */

import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {watchSetting} from './reset.js';

export function createShortcutButton(settings: Gio.Settings, key: string): Gtk.Button
{
    const button = new Gtk.Button({has_frame: false});
    let capturing = false;
    let savedLabel = '';
    let timeoutId = 0;
    let controller: Gtk.EventControllerKey | null = null;
    let keyHandlerId = 0;

    const clearTimeout = () => {
        if (timeoutId) {
            GLib.source_remove(timeoutId);
            timeoutId = 0;
        }
    };

    const stopCapture = () => {
        clearTimeout();
        if (controller) {
            if (keyHandlerId)
                controller.disconnect(keyHandlerId);
            button.remove_controller(controller);
            controller = null;
            keyHandlerId = 0;
        }
        capturing = false;
    };

    const updateLabel = () => {
        button.set_label(settings.get_strv(key)[0] || _('Disabled'));
    };

    updateLabel();
    watchSetting(settings, key, updateLabel, button);

    button.connect('destroy', () => stopCapture());

    button.connect('clicked', () => {
        if (capturing) {
            stopCapture();
            button.set_label(savedLabel);
            return;
        }

        capturing = true;
        savedLabel = button.label;
        button.set_label(_('Press shortcut…'));

        controller = new Gtk.EventControllerKey();
        button.add_controller(controller);

        keyHandlerId = controller.connect(
            'key-pressed',
            (_c: Gtk.EventControllerKey, keyval: number, keycode: number, modifierState: number) => {
                clearTimeout();

                const mods = modifierState & Gtk.accelerator_get_default_mod_mask();

                if (mods === 0) {
                    if (keyval === Gdk.KEY_Escape) {
                        button.set_label(savedLabel);
                        stopCapture();
                        return Gdk.EVENT_STOP;
                    }
                    if (keyval === Gdk.KEY_BackSpace) {
                        settings.set_strv(key, []);
                        stopCapture();
                        return Gdk.EVENT_STOP;
                    }
                }

                const accel = keyval !== 0
                    ? Gtk.accelerator_name(keyval, mods)
                    : Gtk.accelerator_name_with_keycode(
                        button.get_display(), keyval, keycode, mods
                    );

                timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                    timeoutId = 0;
                    settings.set_strv(key, [accel]);
                    stopCapture();
                    return GLib.SOURCE_REMOVE;
                });

                return Gdk.EVENT_STOP;
            }
        );
    });

    return button;
}
