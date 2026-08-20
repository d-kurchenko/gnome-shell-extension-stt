/**
 * Reset-to-default suffix for a preferences row.
 */

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function watchSetting(
    settings: Gio.Settings,
    key: string,
    callback: () => void,
    widget: Gtk.Widget
): void
{
    const id = settings.connect(`changed::${key}`, callback);
    widget.connect('destroy', () => settings.disconnect(id));
}

export function addResetButton(
    settings: Gio.Settings,
    key: string,
    row: {add_suffix: (widget: Gtk.Widget) => void}
): void
{
    const button = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: _('Reset to default'),
        valign: Gtk.Align.CENTER,
        has_frame: false,
    });
    button.add_css_class('flat');

    const update = () => {
        const current = settings.get_value(key);
        const def = settings.get_default_value(key);
        button.sensitive = !def.equal(current);
    };

    update();
    watchSetting(settings, key, update, button);
    button.connect('clicked', () => settings.reset(key));
    row.add_suffix(button);
}
