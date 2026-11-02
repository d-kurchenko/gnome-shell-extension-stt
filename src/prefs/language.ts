import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {KEYS} from '../lib/const.js';
import {addResetButton, watchSetting} from './reset.js';

const LANGUAGES = ['', 'ru', 'uk', 'en'];

export function addLanguageRow(group: Adw.PreferencesGroup, settings: Gio.Settings): void
{
    const row = new Adw.ComboRow({
        title: _('Speech language'),
        subtitle: _('Choose the spoken language if automatic detection is inaccurate.'),
        model: Gtk.StringList.new([
            _('Automatic'), _('Russian'), _('Ukrainian'), _('English'), _('Other language'),
        ]),
    });
    group.add(row);
    addResetButton(settings, KEYS.LANGUAGE, row);

    const code = new Adw.EntryRow({title: _('Language code (for example, de or fr)')});
    const apply = new Gtk.Button({label: _('Apply'), valign: Gtk.Align.CENTER});
    apply.add_css_class('suggested-action');
    code.add_suffix(apply);
    group.add(code);

    const validate = () => {
        const language = code.text.trim().toLowerCase();
        apply.sensitive = /^[a-z]{2}$/.test(language);
        if (language && !apply.sensitive)
            code.add_css_class('error');
        else
            code.remove_css_class('error');
    };
    code.connect('notify::text', validate);
    const save = () => {
        if (apply.sensitive)
            settings.set_string(KEYS.LANGUAGE, code.text.trim().toLowerCase());
    };
    apply.connect('clicked', save);
    code.connect('entry-activated', save);

    let syncing = false;
    const sync = () => {
        const language = settings.get_string(KEYS.LANGUAGE);
        const index = LANGUAGES.indexOf(language);
        syncing = true;
        row.selected = index >= 0 ? index : LANGUAGES.length;
        code.text = language;
        code.visible = index < 0;
        validate();
        syncing = false;
    };
    row.connect('notify::selected', () => {
        if (syncing)
            return;

        const language = LANGUAGES[row.selected];
        code.visible = language === undefined;
        if (language !== undefined)
            settings.set_string(KEYS.LANGUAGE, language);
        else
            code.grab_focus();
    });
    sync();
    watchSetting(settings, KEYS.LANGUAGE, sync, row);
}
