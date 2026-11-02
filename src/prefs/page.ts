/**
 * Preferences page.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {EMPTY_SPEECH, KEYS, PANEL_BOX} from '../lib/const.js';
import {ExtensionMetadata} from '../openrouter/client.js';
import {ModelPreferences} from './models.js';
import {addLanguageRow} from './language.js';
import {addResetButton, watchSetting} from './reset.js';
import {createShortcutButton} from './shortcut.js';

export function createPage(
    settings: Gio.Settings,
    metadata: ExtensionMetadata,
    uuid: string
): Adw.PreferencesPage
{
    const page = new Adw.PreferencesPage({
        title: _('Speech to Text'),
        icon_name: 'audio-input-microphone-symbolic',
    });
    addOpenRouterGroup(page, settings, new ModelPreferences(page, settings, metadata, uuid));
    addBehaviorGroup(page, settings);
    addShortcutGroup(page, settings);

    return page;
}

function addOpenRouterGroup(page: Adw.PreferencesPage, settings: Gio.Settings, models: ModelPreferences): void
{
    const group = new Adw.PreferencesGroup({
        title: _('OpenRouter Provider'),
        description: _('API credentials and model settings for transcription via OpenRouter.'),
    });
    page.add(group);

    const apiKey = new Adw.PasswordEntryRow({title: _('API Key')});
    group.add(apiKey);
    settings.bind(KEYS.API_KEY, apiKey, 'text', Gio.SettingsBindFlags.DEFAULT);

    models.addTo(group);
    addLanguageRow(group, settings);

    const temperature = new Adw.SpinRow({
        title: _('Temperature'),
        subtitle: _('Sampling temperature (0 = deterministic, 1 = more creative)'),
        adjustment: new Gtk.Adjustment({lower: 0, upper: 1.0, step_increment: 0.1}),
        digits: 1,
    });
    group.add(temperature);
    settings.bind(KEYS.TEMPERATURE, temperature, 'value', Gio.SettingsBindFlags.DEFAULT);
    addResetButton(settings, KEYS.TEMPERATURE, temperature);

    const timeout = new Adw.SpinRow({
        title: _('Request Timeout'),
        subtitle: _('Seconds to wait for transcription'),
        adjustment: new Gtk.Adjustment({lower: 10, upper: 300, step_increment: 5}),
    });
    group.add(timeout);
    settings.bind(KEYS.REQUEST_TIMEOUT, timeout, 'value', Gio.SettingsBindFlags.DEFAULT);
    addResetButton(settings, KEYS.REQUEST_TIMEOUT, timeout);
}

function addBehaviorGroup(page: Adw.PreferencesPage, settings: Gio.Settings): void
{
    const group = new Adw.PreferencesGroup({title: _('Behavior')});
    page.add(group);

    const showIcon = new Adw.SwitchRow({
        title: _('Show Icon in Top Bar'),
        subtitle: _('When off, the icon appears only while recording or transcribing.'),
    });
    group.add(showIcon);
    settings.bind(KEYS.SHOW_ICON, showIcon, 'active', Gio.SettingsBindFlags.DEFAULT);

    const boxRow = new Adw.ComboRow({
        title: _('Tray Horizontal Alignment'),
        subtitle: _('Place the status icon in the left, center, or right section of the top bar.'),
        model: Gtk.StringList.new([_('Left'), _('Center'), _('Right')]),
    });
    group.add(boxRow);
    bindCombo(settings, KEYS.PANEL_BOX, boxRow, [
        PANEL_BOX.LEFT,
        PANEL_BOX.CENTER,
        PANEL_BOX.RIGHT,
    ]);
    addResetButton(settings, KEYS.PANEL_BOX, boxRow);

    const position = new Adw.SpinRow({
        title: _('Top Bar Icon Position'),
        subtitle: _('Order within that section (− / +): higher = closer to the outer edge of the bar.'),
        adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 1}),
    });
    group.add(position);
    settings.bind(KEYS.PANEL_POSITION, position, 'value', Gio.SettingsBindFlags.DEFAULT);
    addResetButton(settings, KEYS.PANEL_POSITION, position);

    const emptyRow = new Adw.ComboRow({
        title: _('When there is no speech'),
        subtitle: _('If the model returns no transcribed words'),
        model: Gtk.StringList.new([
            _('Paste placeholder text'),
            _('Do nothing (no clipboard / paste)'),
        ]),
    });
    group.add(emptyRow);
    bindCombo(settings, KEYS.EMPTY_SPEECH_ACTION, emptyRow, [
        EMPTY_SPEECH.PLACEHOLDER,
        EMPTY_SPEECH.SKIP,
    ]);

    const placeholder = new Adw.EntryRow({
        title: _('Placeholder text (e.g. …; leave empty to paste nothing)'),
        show_apply_button: false,
    });
    group.add(placeholder);
    settings.bind(KEYS.EMPTY_SPEECH_PLACEHOLDER, placeholder, 'text', Gio.SettingsBindFlags.DEFAULT);
    addResetButton(settings, KEYS.EMPTY_SPEECH_PLACEHOLDER, placeholder);

    const syncPlaceholder = () => {
        placeholder.sensitive =
            settings.get_string(KEYS.EMPTY_SPEECH_ACTION) === EMPTY_SPEECH.PLACEHOLDER;
    };
    syncPlaceholder();
    watchSetting(settings, KEYS.EMPTY_SPEECH_ACTION, syncPlaceholder, placeholder);

    const playSound = new Adw.SwitchRow({
        title: _('Play Sound Effects'),
        subtitle: _('Play tone when recording starts and stops'),
    });
    group.add(playSound);
    settings.bind(KEYS.PLAY_SOUND, playSound, 'active', Gio.SettingsBindFlags.DEFAULT);

    const volume = new Adw.SpinRow({
        title: _('Sound Volume'),
        subtitle: _('Volume for start/stop effects (0 = mute, 100 = full)'),
        adjustment: new Gtk.Adjustment({lower: 0, upper: 100, step_increment: 5}),
    });
    group.add(volume);
    settings.bind(KEYS.SOUND_VOLUME, volume, 'value', Gio.SettingsBindFlags.DEFAULT);
    addResetButton(settings, KEYS.SOUND_VOLUME, volume);
}

function addShortcutGroup(page: Adw.PreferencesPage, settings: Gio.Settings): void
{
    const group = new Adw.PreferencesGroup({
        title: _('Keyboard Shortcut'),
        description: _('Press a key combination anywhere to start or stop recording.'),
    });
    page.add(group);

    const enable = new Adw.SwitchRow({
        title: _('Enable Keyboard Shortcuts'),
        subtitle: _('When off, the toggle-recording shortcut is inactive.'),
    });
    group.add(enable);
    settings.bind(KEYS.ENABLE_SHORTCUTS, enable, 'active', Gio.SettingsBindFlags.DEFAULT);

    const row = new Adw.ActionRow({title: _('Toggle Recording')});
    const capture = createShortcutButton(settings, KEYS.TOGGLE_SHORTCUT);
    row.add_suffix(capture);
    addResetButton(settings, KEYS.TOGGLE_SHORTCUT, row);
    group.add(row);
    settings.bind(KEYS.ENABLE_SHORTCUTS, capture, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
}

function bindCombo(
    settings: Gio.Settings,
    key: string,
    row: Adw.ComboRow,
    values: string[]
): void
{
    const fromSettings = () => {
        const index = values.indexOf(settings.get_string(key));
        row.selected = index >= 0 ? index : 0;
    };

    fromSettings();
    watchSetting(settings, key, fromSettings, row);
    row.connect('notify::selected', () => {
        settings.set_string(key, values[row.selected]);
    });
}
