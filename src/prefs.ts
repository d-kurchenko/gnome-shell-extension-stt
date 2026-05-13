import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createResetButtonForSettingsRow(
  settings: Gio.Settings,
  settingsKey: string,
  preferencesRow: any,
  isValueChangedFromDefault: () => boolean,
  resetSettingToDefault: () => void,
): Gtk.Button {
  const resetButton = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: _('Reset to default'),
    valign: Gtk.Align.CENTER,
    has_frame: false,
  });

  const updateResetButtonSensitivity = () => {
    resetButton.sensitive = isValueChangedFromDefault();
  };

  const settingsChangedHandlerId = settings.connect(`changed::${settingsKey}`, () => updateResetButtonSensitivity());

  resetButton.connect('clicked', () => {
    resetSettingToDefault();
    updateResetButtonSensitivity();
  });

  preferencesRow.connect('destroy', () => {
    settings.disconnect(settingsChangedHandlerId);
  });

  preferencesRow.add_suffix(resetButton);
  resetButton.add_css_class('flat');

  updateResetButtonSensitivity();

  return resetButton;
}

export default class SpeechToTextPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    return new Promise((resolve) => {
      const settings = this.getSettings();

      const preferencesPage = new Adw.PreferencesPage({
        title: _('Speech to Text'),
        icon_name: 'audio-input-microphone-symbolic',
      });
      window.add(preferencesPage);

      const openRouterGroup = new Adw.PreferencesGroup({
        title: _('OpenRouter Provider'),
        description: _('API credentials and model settings for transcription via OpenRouter.'),
      });
      preferencesPage.add(openRouterGroup);

      const openRouterApiKeyRow = new Adw.PasswordEntryRow({
        title: _('API Key'),
      });
      openRouterGroup.add(openRouterApiKeyRow);
      settings.bind('openrouter-api-key', openRouterApiKeyRow, 'text', Gio.SettingsBindFlags.DEFAULT);

      const openRouterModelRow = new Adw.EntryRow({
        title: _('Model'),
        show_apply_button: false,
      });
      openRouterGroup.add(openRouterModelRow);
      settings.bind('model', openRouterModelRow, 'text', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'model', openRouterModelRow,
        () => settings.get_string('model') !== settings.get_default_value('model').unpack(),
        () => settings.reset('model'),
      );

      const samplingTemperatureRow = new Adw.SpinRow({
        title: _('Temperature'),
        subtitle: _('Sampling temperature (0 = deterministic, 1 = more creative)'),
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 1.0, step_increment: 0.1 }),
        digits: 1,
      });
      openRouterGroup.add(samplingTemperatureRow);
      settings.bind('temperature', samplingTemperatureRow, 'value', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'temperature', samplingTemperatureRow,
        () => Math.abs(settings.get_double('temperature') - (settings.get_default_value('temperature').unpack() as number)) > 0.0001,
        () => settings.reset('temperature'),
      );

      const requestTimeoutRow = new Adw.SpinRow({
        title: _('Request Timeout'),
        subtitle: _('Seconds to wait for transcription'),
        adjustment: new Gtk.Adjustment({ lower: 10, upper: 300, step_increment: 5 }),
      });
      openRouterGroup.add(requestTimeoutRow);
      settings.bind('request-timeout', requestTimeoutRow, 'value', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'request-timeout', requestTimeoutRow,
        () => settings.get_int('request-timeout') !== settings.get_default_value('request-timeout').unpack(),
        () => settings.reset('request-timeout'),
      );

      const behaviorGroup = new Adw.PreferencesGroup({
        title: _('Behavior'),
      });
      preferencesPage.add(behaviorGroup);

      const showIconInPanelRow = new Adw.SwitchRow({
        title: _('Show Icon in Top Bar'),
        subtitle: _('When off, the icon appears only while recording or transcribing.'),
      });
      behaviorGroup.add(showIconInPanelRow);
      settings.bind('show-icon', showIconInPanelRow, 'active', Gio.SettingsBindFlags.DEFAULT);

      const PANEL_INDICATOR_BOX_LEFT = 'left';
      const PANEL_INDICATOR_BOX_CENTER = 'center';
      const PANEL_INDICATOR_BOX_RIGHT = 'right';

      const panelIndicatorBoxChoiceLabels = Gtk.StringList.new([
        _('Left'),
        _('Center'),
        _('Right'),
      ]);
      const panelIndicatorBoxComboRow = new Adw.ComboRow({
        title: _('Tray Horizontal Alignment'),
        subtitle: _('Place the status icon in the left, center, or right section of the top bar.'),
        model: panelIndicatorBoxChoiceLabels,
      });
      behaviorGroup.add(panelIndicatorBoxComboRow);

      const selectedIndexFromPanelIndicatorBox = (boxString: string) => {
        if (boxString === PANEL_INDICATOR_BOX_LEFT) return 0;
        if (boxString === PANEL_INDICATOR_BOX_CENTER) return 1;
        return 2;
      };
      const panelIndicatorBoxFromSelectedIndex = (selectedIndex: number) =>
        (selectedIndex === 0
          ? PANEL_INDICATOR_BOX_LEFT
          : selectedIndex === 1
            ? PANEL_INDICATOR_BOX_CENTER
            : PANEL_INDICATOR_BOX_RIGHT);

      const synchronizePanelIndicatorBoxComboFromSettings = () => {
        panelIndicatorBoxComboRow.selected = selectedIndexFromPanelIndicatorBox(
          settings.get_string('panel-indicator-box'),
        );
      };
      synchronizePanelIndicatorBoxComboFromSettings();
      const panelIndicatorBoxSettingsChangedId = settings.connect(
        'changed::panel-indicator-box',
        synchronizePanelIndicatorBoxComboFromSettings,
      );
      panelIndicatorBoxComboRow.connect('destroy', () => settings.disconnect(panelIndicatorBoxSettingsChangedId));

      panelIndicatorBoxComboRow.connect('notify::selected', () => {
        settings.set_string('panel-indicator-box', panelIndicatorBoxFromSelectedIndex(panelIndicatorBoxComboRow.selected));
      });

      createResetButtonForSettingsRow(
        settings, 'panel-indicator-box', panelIndicatorBoxComboRow,
        () => settings.get_string('panel-indicator-box') !== settings.get_default_value('panel-indicator-box').unpack(),
        () => settings.reset('panel-indicator-box'),
      );

      const panelIndicatorPositionRow = new Adw.SpinRow({
        title: _('Top Bar Icon Position'),
        subtitle: _('Order within that section (− / +): higher = closer to the outer edge of the bar.'),
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1 }),
      });
      behaviorGroup.add(panelIndicatorPositionRow);
      settings.bind('panel-indicator-position', panelIndicatorPositionRow, 'value', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'panel-indicator-position', panelIndicatorPositionRow,
        () => settings.get_int('panel-indicator-position') !== settings.get_default_value('panel-indicator-position').unpack(),
        () => settings.reset('panel-indicator-position'),
      );

      const EMPTY_SPEECH_ACTION_PLACEHOLDER = 'placeholder';
      const EMPTY_SPEECH_ACTION_SKIP = 'skip';
      const emptySpeechChoiceLabels = Gtk.StringList.new([
        _('Paste placeholder text'),
        _('Do nothing (no clipboard / paste)'),
      ]);
      const emptySpeechComboRow = new Adw.ComboRow({
        title: _('When there is no speech'),
        subtitle: _('If the model returns no transcribed words'),
        model: emptySpeechChoiceLabels,
      });
      behaviorGroup.add(emptySpeechComboRow);

      const selectedIndexFromEmptySpeechAction = (actionString: string) =>
        (actionString === EMPTY_SPEECH_ACTION_SKIP ? 1 : 0);
      const emptySpeechActionFromSelectedIndex = (selectedIndex: number) =>
        (selectedIndex === 1 ? EMPTY_SPEECH_ACTION_SKIP : EMPTY_SPEECH_ACTION_PLACEHOLDER);

      const synchronizeEmptySpeechComboFromSettings = () => {
        emptySpeechComboRow.selected = selectedIndexFromEmptySpeechAction(
          settings.get_string('empty-speech-action'),
        );
      };
      synchronizeEmptySpeechComboFromSettings();
      const emptySpeechActionSettingsChangedId = settings.connect(
        'changed::empty-speech-action',
        synchronizeEmptySpeechComboFromSettings,
      );
      emptySpeechComboRow.connect('destroy', () => settings.disconnect(emptySpeechActionSettingsChangedId));

      emptySpeechComboRow.connect('notify::selected', () => {
        settings.set_string(
          'empty-speech-action',
          emptySpeechActionFromSelectedIndex(emptySpeechComboRow.selected),
        );
      });

      const emptySpeechPlaceholderEntryRow = new Adw.EntryRow({
        title: _('Placeholder text (e.g. …; leave empty to paste nothing)'),
        show_apply_button: false,
      });
      behaviorGroup.add(emptySpeechPlaceholderEntryRow);
      settings.bind('empty-speech-placeholder', emptySpeechPlaceholderEntryRow, 'text', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'empty-speech-placeholder', emptySpeechPlaceholderEntryRow,
        () => settings.get_string('empty-speech-placeholder') !== settings.get_default_value('empty-speech-placeholder').unpack(),
        () => settings.reset('empty-speech-placeholder'),
      );

      const synchronizePlaceholderRowSensitivity = () => {
        emptySpeechPlaceholderEntryRow.sensitive =
          settings.get_string('empty-speech-action') === EMPTY_SPEECH_ACTION_PLACEHOLDER;
      };
      synchronizePlaceholderRowSensitivity();
      const emptySpeechActionForPlaceholderSensitivityId = settings.connect(
        'changed::empty-speech-action',
        synchronizePlaceholderRowSensitivity,
      );
      emptySpeechPlaceholderEntryRow.connect('destroy', () => {
        settings.disconnect(emptySpeechActionForPlaceholderSensitivityId);
      });

      const playSoundEffectsRow = new Adw.SwitchRow({
        title: _('Play Sound Effects'),
        subtitle: _('Play tone when recording starts and stops'),
      });
      behaviorGroup.add(playSoundEffectsRow);
      settings.bind('play-sound', playSoundEffectsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

      const soundVolumePercentRow = new Adw.SpinRow({
        title: _('Sound Volume'),
        subtitle: _('Volume for start/stop effects (0 = mute, 100 = full)'),
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 5 }),
      });
      behaviorGroup.add(soundVolumePercentRow);
      settings.bind('sound-volume', soundVolumePercentRow, 'value', Gio.SettingsBindFlags.DEFAULT);
      createResetButtonForSettingsRow(
        settings, 'sound-volume', soundVolumePercentRow,
        () => settings.get_int('sound-volume') !== settings.get_default_value('sound-volume').unpack(),
        () => settings.reset('sound-volume'),
      );

      const keyboardShortcutGroup = new Adw.PreferencesGroup({
        title: _('Keyboard Shortcut'),
        description: _('Press a key combination anywhere to start or stop recording.'),
      });
      preferencesPage.add(keyboardShortcutGroup);

      const enableKeyboardShortcutsRow = new Adw.SwitchRow({
        title: _('Enable Keyboard Shortcuts'),
        subtitle: _('When off, the toggle-recording shortcut is inactive.'),
      });
      keyboardShortcutGroup.add(enableKeyboardShortcutsRow);
      settings.bind('enable-shortcuts', enableKeyboardShortcutsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

      const toggleRecordingShortcutRow = new Adw.ActionRow({
        title: _('Toggle Recording'),
      });
      const toggleShortcutCaptureButton = this._createShortcutCaptureButton(settings);

      const toggleShortcutResetButton = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: _('Reset to default'),
        valign: Gtk.Align.CENTER,
        has_frame: false,
      });
      toggleShortcutResetButton.add_css_class('flat');

      const DEFAULT_TOGGLE_RECORDING_ACCELERATOR = '<Super>z';

      const updateToggleShortcutResetButton = () => {
        const currentAccelerator = settings.get_strv('toggle-shortcut')[0] ?? '';
        toggleShortcutResetButton.sensitive = currentAccelerator !== DEFAULT_TOGGLE_RECORDING_ACCELERATOR;
      };

      const toggleShortcutSettingsChangedId = settings.connect(
        'changed::toggle-shortcut',
        () => {
          updateToggleShortcutResetButton();
          toggleShortcutCaptureButton.set_label(
            settings.get_strv('toggle-shortcut')[0] || _('Disabled'),
          );
        },
      );

      toggleShortcutResetButton.connect('clicked', () => {
        settings.reset('toggle-shortcut');
      });

      toggleRecordingShortcutRow.add_suffix(toggleShortcutCaptureButton);
      toggleRecordingShortcutRow.add_suffix(toggleShortcutResetButton);

      toggleRecordingShortcutRow.connect('destroy', () => {
        settings.disconnect(toggleShortcutSettingsChangedId);
      });
      updateToggleShortcutResetButton();

      keyboardShortcutGroup.add(toggleRecordingShortcutRow);
      settings.bind('enable-shortcuts', toggleShortcutCaptureButton, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

      resolve();
    });
  }

  private _createShortcutCaptureButton(settings: Gio.Settings): Gtk.Button {
    const captureButton = new Gtk.Button({ has_frame: false });

    let debounceTimeoutSourceId = 0;
    const clearDebounceTimeout = () => {
      if (debounceTimeoutSourceId) {
        GLib.source_remove(debounceTimeoutSourceId);
        debounceTimeoutSourceId = 0;
      }
    };
    captureButton.connect('destroy', () => clearDebounceTimeout());

    const updateCaptureButtonLabelFromSettings = () => {
      const acceleratorString = settings.get_strv('toggle-shortcut')[0];
      captureButton.set_label(acceleratorString || _('Disabled'));
    };

    updateCaptureButtonLabelFromSettings();

    captureButton.connect('clicked', () => {
      // @ts-ignore dynamic property
      if (captureButton.isEditing) {
        clearDebounceTimeout();
        // @ts-ignore
        captureButton.set_label(captureButton.isEditing);
        // @ts-ignore
        captureButton.isEditing = null;
        return;
      }

      clearDebounceTimeout();

      // @ts-ignore
      captureButton.isEditing = captureButton.label;
      captureButton.set_label(_('Press shortcut…'));

      const keyEventController = new Gtk.EventControllerKey();
      captureButton.add_controller(keyEventController);

      const keyPressedHandlerId = keyEventController.connect(
        'key-pressed',
        (_controller: any, keyval: number, keycode: number, modifierState: any) => {
          clearDebounceTimeout();

          const modifierMask = modifierState & Gtk.accelerator_get_default_mod_mask();

          if (modifierMask === 0) {
            if (keyval === Gdk.KEY_Escape) {
              // @ts-ignore
              captureButton.set_label(captureButton.isEditing);
              // @ts-ignore
              captureButton.isEditing = null;
              keyEventController.disconnect(keyPressedHandlerId);
              captureButton.remove_controller(keyEventController);
              return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace) {
              settings.set_strv('toggle-shortcut', []);
              updateCaptureButtonLabelFromSettings();
              // @ts-ignore
              captureButton.isEditing = null;
              keyEventController.disconnect(keyPressedHandlerId);
              captureButton.remove_controller(keyEventController);
              return Gdk.EVENT_STOP;
            }
          }

          const acceleratorName =
            keyval !== 0
              ? Gtk.accelerator_name(keyval, modifierMask)
              : Gtk.accelerator_name_with_keycode(captureButton.get_display(), keyval, keycode, modifierMask);
          debounceTimeoutSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            debounceTimeoutSourceId = 0;
            keyEventController.disconnect(keyPressedHandlerId);
            captureButton.remove_controller(keyEventController);
            settings.set_strv('toggle-shortcut', [acceleratorName]);
            updateCaptureButtonLabelFromSettings();
            // @ts-ignore
            captureButton.isEditing = null;
            return GLib.SOURCE_REMOVE;
          });

          return Gdk.EVENT_STOP;
        },
      );

      captureButton.show();
    });

    return captureButton;
  }
}
