import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function showShellNotification(messageTitle: string, messageDetails: string): void {
  try { Main.notify(messageTitle, messageDetails); } catch (_) {}
}

let gstreamerRuntimeInitialized = false;
function ensureGStreamerRuntimeInitialized(): void {
  if (gstreamerRuntimeInitialized) return;
  Gst.init(null);
  gstreamerRuntimeInitialized = true;
}

function waitForGStreamerBusEndOfStreamOrError(
  bus: Gst.Bus,
  timeoutMilliseconds: number,
): Promise<Gst.Message | null> {
  return new Promise(resolve => {
    let finished = false;
    let busWatchSourceId = 0;
    let timeoutSourceId = 0;

    const finish = (message: Gst.Message | null, removeBusWatch: boolean) => {
      if (finished) return;
      finished = true;
      if (timeoutSourceId) {
        GLib.source_remove(timeoutSourceId);
        timeoutSourceId = 0;
      }
      if (removeBusWatch && busWatchSourceId) {
        GLib.source_remove(busWatchSourceId);
        busWatchSourceId = 0;
      }
      resolve(message);
    };

    busWatchSourceId = bus.add_watch(GLib.PRIORITY_DEFAULT, (_bus, message) => {
      if (finished) return GLib.SOURCE_REMOVE;
      const messageType = message.type;
      if (messageType === Gst.MessageType.EOS || messageType === Gst.MessageType.ERROR) {
        finish(message, false);
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });

    timeoutSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMilliseconds, () => {
      finish(null, true);
      return GLib.SOURCE_REMOVE;
    });
  });
}

function createGStreamerMicrophoneSourceElement(): Gst.Element {
  const elementFactoryNamesToTry = ['pulsesrc', 'pipewiresrc', 'autoaudiosrc'] as const;
  for (const factoryName of elementFactoryNamesToTry) {
    const element = Gst.ElementFactory.make(factoryName, null);
    if (element) {
      if (factoryName === 'pulsesrc') (element as any).set_property('device', 'default');
      return element;
    }
  }
  throw new Error('No GStreamer microphone element (install gst-plugins-good / PipeWire plugins)');
}

// ── Recorder ─────────────────────────────────────────────────────────────

class SpeechToTextAudioRecorder {
  private pipeline: Gst.Pipeline | null = null;
  private readonly recordingOutputFilePath: string;

  constructor() {
    this.recordingOutputFilePath = GLib.build_filenamev([
      GLib.get_tmp_dir(),
      'speech_to_text_last_recording.wav',
    ]);
  }

  start(): void {
    ensureGStreamerRuntimeInitialized();

    const outputFile = Gio.File.new_for_path(this.recordingOutputFilePath);
    if (outputFile.query_exists(null)) outputFile.delete(null);

    const pipeline = new Gst.Pipeline({ name: 'speech-to-text-record' });
    const source = createGStreamerMicrophoneSourceElement();
    const convert = Gst.ElementFactory.make('audioconvert', null);
    const resample = Gst.ElementFactory.make('audioresample', null);
    const capsFilter = Gst.ElementFactory.make('capsfilter', null);
    const wavEncoder = Gst.ElementFactory.make('wavenc', null);
    const fileSink = Gst.ElementFactory.make('filesink', null);

    if (!convert || !resample || !capsFilter || !wavEncoder || !fileSink) {
      throw new Error('Missing GStreamer elements (need gst-plugins-base/good: audioconvert, wavenc, …)');
    }

    const caps = Gst.Caps.from_string('audio/x-raw,format=S16LE,rate=16000,channels=1');
    (capsFilter as any).set_property('caps', caps);

    (fileSink as any).set_property('location', this.recordingOutputFilePath);
    (fileSink as any).set_property('sync', false);

    pipeline.add(source);
    pipeline.add(convert);
    pipeline.add(resample);
    pipeline.add(capsFilter);
    pipeline.add(wavEncoder);
    pipeline.add(fileSink);

    if (!source.link(convert)) throw new Error('GStreamer link failed (source→convert)');
    if (!convert.link(resample)) throw new Error('GStreamer link failed (convert→resample)');
    if (!resample.link(capsFilter)) throw new Error('GStreamer link failed (resample→capsFilter)');
    if (!capsFilter.link(wavEncoder)) throw new Error('GStreamer link failed (capsFilter→wavEncoder)');
    if (!wavEncoder.link(fileSink)) throw new Error('GStreamer link failed (wavEncoder→fileSink)');

    const stateChangeReturn = pipeline.set_state(Gst.State.PLAYING);
    if (stateChangeReturn === Gst.StateChangeReturn.FAILURE) {
      pipeline.set_state(Gst.State.NULL);
      throw new Error('GStreamer could not start recording (PLAYING failed)');
    }

    this.pipeline = pipeline;
  }

  async stop(): Promise<string | null> {
    const pipeline = this.pipeline;
    if (!pipeline) return null;
    this.pipeline = null;

    const bus = pipeline.get_bus();
    if (!bus) {
      pipeline.set_state(Gst.State.NULL);
      return null;
    }

    pipeline.send_event(Gst.Event.new_eos());
    const busMessage = await waitForGStreamerBusEndOfStreamOrError(bus, 20000);

    pipeline.set_state(Gst.State.NULL);

    if (!busMessage || busMessage.type === Gst.MessageType.ERROR) {
      if (busMessage?.type === Gst.MessageType.ERROR) {
        const [glibError] = busMessage.parse_error();
        log(`[Speech to Text] Recording stop error: ${glibError?.message ?? glibError}`);
      }
      try {
        const file = Gio.File.new_for_path(this.recordingOutputFilePath);
        if (file.query_exists(null)) file.delete(null);
      } catch (_) {}
      return null;
    }

    const file = Gio.File.new_for_path(this.recordingOutputFilePath);
    if (!file.query_exists(null)) return null;
    const fileInfo = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
    if (!fileInfo || fileInfo.get_size() < 44) return null;
    return this.recordingOutputFilePath;
  }

  cancel(): void {
    const pipeline = this.pipeline;
    this.pipeline = null;
    if (!pipeline) return;
    pipeline.set_state(Gst.State.NULL);
    try {
      const outputFile = Gio.File.new_for_path(this.recordingOutputFilePath);
      if (outputFile.query_exists(null)) outputFile.delete(null);
    } catch (_) {}
  }
}

// ── OpenRouter transcription ─────────────────────────────────────────────

type OpenRouterApplicationIdentification = Readonly<{
  applicationDisplayTitle: string;
  applicationRefererUrl: string;
  userAgentString: string;
}>;

function buildOpenRouterApplicationIdentificationFromMetadata(metadata: {
  name?: string;
  url?: string;
  version?: string | number;
}): OpenRouterApplicationIdentification {
  const applicationDisplayTitle =
    (metadata.name && String(metadata.name).trim()) ||
    'Speech to Text (GNOME Shell extension)';
  const applicationRefererUrl =
    (metadata.url && String(metadata.url).trim()) ||
    'https://github.com/d-kurchenko/gnome-shell-extension-stt';
  const versionString =
    metadata.version !== undefined && metadata.version !== null
      ? String(metadata.version)
      : '0';
  const userAgentString =
    `${applicationDisplayTitle.replace(/\s+/g, '-')}/${versionString} ` +
    `(GNOME Shell extension; ${applicationRefererUrl})`;
  return { applicationDisplayTitle, applicationRefererUrl, userAgentString };
}

async function requestTranscriptionFromOpenRouter(
  audioFilePath: string,
  openRouterApiKey: string,
  openRouterModelIdentifier: string,
  transcriptionSystemPrompt: string,
  samplingTemperature: number,
  requestTimeoutSeconds: number,
  openRouterApplicationIdentification: OpenRouterApplicationIdentification,
): Promise<string> {
  const audioFile = Gio.File.new_for_path(audioFilePath);
  const [fileBytes] = await audioFile.load_contents_async(null);
  if (!fileBytes?.length) throw new Error('Failed to read audio file');

  const base64EncodedAudio = GLib.base64_encode(fileBytes);
  const requestBodyJson = JSON.stringify({
    model: openRouterModelIdentifier,
    temperature: samplingTemperature,
    messages: [
      { role: 'system', content: transcriptionSystemPrompt },
      {
        role: 'user',
        content: [{
          type: 'input_audio',
          input_audio: { data: base64EncodedAudio, format: 'wav' },
        }],
      },
    ],
  });

  const httpMessage = Soup.Message.new('POST', 'https://openrouter.ai/api/v1/chat/completions');
  httpMessage.set_request_body_from_bytes(
    'application/json',
    new GLib.Bytes(new TextEncoder().encode(requestBodyJson)),
  );
  const headers = httpMessage.request_headers;
  headers.append('Authorization', `Bearer ${openRouterApiKey}`);
  headers.append('HTTP-Referer', openRouterApplicationIdentification.applicationRefererUrl);
  headers.append('X-OpenRouter-Title', openRouterApplicationIdentification.applicationDisplayTitle);

  const httpSession = new Soup.Session({ timeout: requestTimeoutSeconds });
  httpSession.user_agent = openRouterApplicationIdentification.userAgentString;

  const responseBytes = await httpSession.send_and_read_async(httpMessage, GLib.PRIORITY_DEFAULT, null);
  const httpStatusCode = httpMessage.get_status();
  if (httpStatusCode !== Soup.Status.OK) {
    throw new Error(`HTTP ${httpStatusCode}: ${Soup.status_get_phrase(httpStatusCode)}`);
  }

  const responseUtf8Text = new TextDecoder('utf-8').decode(responseBytes.get_data()!);
  const parsedResponseBody: any = JSON.parse(responseUtf8Text);

  if (parsedResponseBody?.error) {
    const apiErrorMessage =
      parsedResponseBody.error?.message ?? JSON.stringify(parsedResponseBody.error);
    throw new Error(`OpenRouter API error: ${apiErrorMessage}`);
  }

  const messageContent = parsedResponseBody?.choices?.[0]?.message?.content;
  return typeof messageContent === 'string' ? messageContent.trim() : '';
}

// ── Sound (GStreamer playbin) ────────────────────────────────────────────

const GSTREAMER_PLAYBIN_FLAGS_AUDIO_ONLY = 1 << 1;

function playSoundEffectFromFile(filePath: string, volumePercent: number = 100): void {
  const soundFile = Gio.File.new_for_path(filePath);
  if (!soundFile.query_exists(null)) return;

  try {
    ensureGStreamerRuntimeInitialized();
    const playbinElement = Gst.ElementFactory.make('playbin', null) as Gst.Bin | null;
    if (!playbinElement) {
      log('[Speech to Text] playbin element unavailable');
      return;
    }

    const fileUri = soundFile.get_uri();
    (playbinElement as any).set_property('uri', fileUri);
    (playbinElement as any).set_property('volume', Math.max(0, Math.min(1, volumePercent / 100)));
    (playbinElement as any).set_property('flags', GSTREAMER_PLAYBIN_FLAGS_AUDIO_ONLY);

    const bus = playbinElement.get_bus();
    if (!bus) {
      playbinElement.set_state(Gst.State.NULL);
      return;
    }

    let busWatchSourceId = 0;
    busWatchSourceId = bus.add_watch(GLib.PRIORITY_DEFAULT, (_bus, message) => {
      const messageType = message.type;
      if (messageType === Gst.MessageType.EOS || messageType === Gst.MessageType.ERROR) {
        if (messageType === Gst.MessageType.ERROR) {
          const [glibError] = message.parse_error();
          log(`[Speech to Text] Sound playback: ${glibError?.message ?? glibError}`);
        }
        playbinElement.set_state(Gst.State.NULL);
        if (busWatchSourceId) GLib.source_remove(busWatchSourceId);
        return GLib.SOURCE_REMOVE;
      }
      return GLib.SOURCE_CONTINUE;
    });

    const stateChangeReturn = playbinElement.set_state(Gst.State.PLAYING);
    if (stateChangeReturn === Gst.StateChangeReturn.FAILURE) {
      if (busWatchSourceId) GLib.source_remove(busWatchSourceId);
      playbinElement.set_state(Gst.State.NULL);
    }
  } catch (error) {
    log(`[Speech to Text] playSoundEffectFromFile: ${error}`);
  }
}

// ── Extension ────────────────────────────────────────────────────────────

const NO_TRANSCRIBED_SPEECH_SENTINEL = '...';

const TRANSCRIPTION_SYSTEM_PROMPT =
  'You receive audio as input and must output only its text transcription without any additional comments. ' +
  'Write numbers as digits. Transcribe all sounds as they are. Remove all hesitations (hmm, uh, um). ' +
  `If there is no speech in the audio, respond with "${NO_TRANSCRIBED_SPEECH_SENTINEL}" and nothing else`;

const PANEL_INDICATOR_BOX_LEFT = 'left';
const PANEL_INDICATOR_BOX_CENTER = 'center';
const PANEL_INDICATOR_BOX_RIGHT = 'right';

const GSETTINGS_SCHEMA_KEY_NAMES = {
  OPENROUTER_API_KEY: 'openrouter-api-key',
  MODEL: 'model',
  TEMPERATURE: 'temperature',
  EMPTY_SPEECH_ACTION: 'empty-speech-action',
  EMPTY_SPEECH_PLACEHOLDER: 'empty-speech-placeholder',
  SHOW_ICON: 'show-icon',
  PANEL_INDICATOR_BOX: 'panel-indicator-box',
  PANEL_INDICATOR_POSITION: 'panel-indicator-position',
  PLAY_SOUND: 'play-sound',
  REQUEST_TIMEOUT: 'request-timeout',
  TOGGLE_SHORTCUT: 'toggle-shortcut',
  ENABLE_SHORTCUTS: 'enable-shortcuts',
  SOUND_VOLUME: 'sound-volume',
} as const;

function panelIndicatorBoxKeyForAddToStatusArea(settings: Gio.Settings): string {
  const boxKey = settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.PANEL_INDICATOR_BOX);
  if (boxKey === PANEL_INDICATOR_BOX_LEFT || boxKey === PANEL_INDICATOR_BOX_CENTER || boxKey === PANEL_INDICATOR_BOX_RIGHT) {
    return boxKey;
  }
  return PANEL_INDICATOR_BOX_RIGHT;
}

export default class SpeechToTextExtension extends Extension {
  private settings: Gio.Settings | null = null;
  private recorder: SpeechToTextAudioRecorder | null = null;
  private recording = false;
  private transcribing = false;
  private button: PanelMenu.Button | null = null;
  private iconWidget: St.Bin | null = null;
  private showIconSettingsConnectionId = 0;
  private panelIndicatorPositionSettingsConnectionId = 0;
  private panelIndicatorBoxSettingsConnectionId = 0;
  private enableShortcutsSettingsConnectionId = 0;

  private virtualKeyboardDevice: any = null;
  private contentPurpose: number = Clutter.InputContentPurpose.NORMAL;
  private contentPurposeSignalConnectionId = 0;
  private toggleShortcutSettingsConnectionId = 0;
  private panelButtonPressEventSignalId = 0;
  private pasteIntoActiveFieldTimeoutSourceId = 0;
  private layoutManagerStartupCompleteSignalConnectionId = 0;

  enable(): void {
    this.settings = this.getSettings();
    this.recorder = new SpeechToTextAudioRecorder();

    this._initVirtualKeyboard();

    this._bindShortcuts();
    if (Main.layoutManager._startingUp) {
      this.layoutManagerStartupCompleteSignalConnectionId = Main.layoutManager.connect(
        'startup-complete',
        () => {
          if (this.layoutManagerStartupCompleteSignalConnectionId) {
            Main.layoutManager.disconnect(this.layoutManagerStartupCompleteSignalConnectionId);
            this.layoutManagerStartupCompleteSignalConnectionId = 0;
          }
          if (!this.settings) return;
          this._rebindShortcuts();
        },
      );
    }

    this.toggleShortcutSettingsConnectionId = this.settings.connect(
      `changed::${GSETTINGS_SCHEMA_KEY_NAMES.TOGGLE_SHORTCUT}`,
      () => this._rebindShortcuts(),
    );
    this.enableShortcutsSettingsConnectionId = this.settings.connect(
      `changed::${GSETTINGS_SCHEMA_KEY_NAMES.ENABLE_SHORTCUTS}`,
      () => this._rebindShortcuts(),
    );

    this.showIconSettingsConnectionId = this.settings.connect(
      `changed::${GSETTINGS_SCHEMA_KEY_NAMES.SHOW_ICON}`,
      () => this._updateIcon(),
    );

    this.panelIndicatorPositionSettingsConnectionId = this.settings.connect(
      `changed::${GSETTINGS_SCHEMA_KEY_NAMES.PANEL_INDICATOR_POSITION}`,
      () => this._repositionPanelIndicatorFromSettings(),
    );
    this.panelIndicatorBoxSettingsConnectionId = this.settings.connect(
      `changed::${GSETTINGS_SCHEMA_KEY_NAMES.PANEL_INDICATOR_BOX}`,
      () => this._repositionPanelIndicatorFromSettings(),
    );

    this._updateIcon();
  }

  disable(): void {
    if (this.recording) this.recorder?.cancel();
    this.recorder = null;

    if (this.pasteIntoActiveFieldTimeoutSourceId) {
      GLib.source_remove(this.pasteIntoActiveFieldTimeoutSourceId);
      this.pasteIntoActiveFieldTimeoutSourceId = 0;
    }

    if (this.showIconSettingsConnectionId && this.settings) {
      this.settings.disconnect(this.showIconSettingsConnectionId);
      this.showIconSettingsConnectionId = 0;
    }

    if (this.panelIndicatorPositionSettingsConnectionId && this.settings) {
      this.settings.disconnect(this.panelIndicatorPositionSettingsConnectionId);
      this.panelIndicatorPositionSettingsConnectionId = 0;
    }

    if (this.panelIndicatorBoxSettingsConnectionId && this.settings) {
      this.settings.disconnect(this.panelIndicatorBoxSettingsConnectionId);
      this.panelIndicatorBoxSettingsConnectionId = 0;
    }

    if (this.toggleShortcutSettingsConnectionId && this.settings) {
      this.settings.disconnect(this.toggleShortcutSettingsConnectionId);
      this.toggleShortcutSettingsConnectionId = 0;
    }

    if (this.enableShortcutsSettingsConnectionId && this.settings) {
      this.settings.disconnect(this.enableShortcutsSettingsConnectionId);
      this.enableShortcutsSettingsConnectionId = 0;
    }

    if (this.layoutManagerStartupCompleteSignalConnectionId) {
      Main.layoutManager.disconnect(this.layoutManagerStartupCompleteSignalConnectionId);
      this.layoutManagerStartupCompleteSignalConnectionId = 0;
    }

    this._unbindShortcuts();
    this._destroyVirtualKeyboard();
    this._removeButton();
    this.settings = null;
  }

  // ── Panel button ─────────────────────────────────────────────────────

  private _updateIcon(): void {
    const showIconInPanel = this.settings?.get_boolean(GSETTINGS_SCHEMA_KEY_NAMES.SHOW_ICON) ?? true;
    const needsButton = showIconInPanel || this.recording || this.transcribing;
    if (needsButton && !this.button) {
      this._createButton();
      this._updateIconStyle();
    } else if (!needsButton && this.button) {
      this._removeButton();
    }
  }

  private _createButton(): void {
    if (this.button) return;

    this.button = new PanelMenu.Button(0.0, 'Speech to Text', true);

    this.iconWidget = new St.Bin({
      style_class: 'speech-to-text-panel-icon',
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.button.add_child(this.iconWidget);

    this.panelButtonPressEventSignalId = this.button.connect('button-press-event', () => {
      this._onToggle();
      return true;
    });

    const panelIndicatorPosition =
      this.settings?.get_int(GSETTINGS_SCHEMA_KEY_NAMES.PANEL_INDICATOR_POSITION) ?? 0;
    const panelIndicatorBoxKey = this.settings
      ? panelIndicatorBoxKeyForAddToStatusArea(this.settings)
      : PANEL_INDICATOR_BOX_RIGHT;
    Main.panel.addToStatusArea(
      'speech-to-text-extension',
      this.button,
      panelIndicatorPosition,
      panelIndicatorBoxKey,
    );
  }

  /** Recreate the panel button so `addToStatusArea` applies a new insert index. */
  private _repositionPanelIndicatorFromSettings(): void {
    if (!this.button) return;
    this._removeButton();
    this._updateIcon();
    this._updateIconStyle();
  }

  private _removeButton(): void {
    if (!this.button) return;
    if (this.panelButtonPressEventSignalId) {
      this.button.disconnect(this.panelButtonPressEventSignalId);
      this.panelButtonPressEventSignalId = 0;
    }
    if (this.iconWidget) {
      this.iconWidget.destroy();
      this.iconWidget = null;
    }
    this.button.destroy();
    this.button = null;
  }

  private _setRecording(isRecording: boolean): void {
    this.recording = isRecording;
    this._updateIconStyle();
    if (!isRecording) this._updateIcon();
  }

  private _setTranscribing(isTranscribing: boolean): void {
    this.transcribing = isTranscribing;
    this._updateIconStyle();
    this._updateIcon();
  }

  private _updateIconStyle(): void {
    if (!this.iconWidget) return;
    this.iconWidget.remove_style_class_name('recording');
    this.iconWidget.remove_style_class_name('transcribing');
    if (this.recording) {
      this.iconWidget.add_style_class_name('recording');
    } else if (this.transcribing) {
      this.iconWidget.add_style_class_name('transcribing');
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────

  private _shortcutsBindingIds: string[] = [];

  private _rebindShortcuts(): void {
    this._unbindShortcuts();
    this._bindShortcuts();
  }

  private _bindShortcuts(): void {
    if (!this.settings?.get_boolean(GSETTINGS_SCHEMA_KEY_NAMES.ENABLE_SHORTCUTS)) return;
    this._bindShortcut(GSETTINGS_SCHEMA_KEY_NAMES.TOGGLE_SHORTCUT, () => this._onToggle());
  }

  private _unbindShortcuts(): void {
    this._shortcutsBindingIds.forEach(keybindingName => {
      Main.wm.removeKeybinding(keybindingName);
    });
    this._shortcutsBindingIds = [];
  }

  private _bindShortcut(keybindingName: string, onActivated: () => void): void {
    Main.wm.addKeybinding(
      keybindingName,
      this.settings!,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      onActivated.bind(this),
    );
    this._shortcutsBindingIds.push(keybindingName);
  }

  // ── Virtual keyboard for pasting ───────────────────────────────────

  private _initVirtualKeyboard(): void {
    try {
      const seat = Clutter.get_default_backend().get_default_seat();
      this.virtualKeyboardDevice = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

      // @ts-ignore GJS-specific signal connection
      this.contentPurposeSignalConnectionId = Main.inputMethod.connectObject(
        'notify::content-purpose',
        (inputMethod: any) => {
          this.contentPurpose = inputMethod.content_purpose;
        },
        this,
      );
    } catch (error) {
      log(`[Speech to Text] Failed to init virtual keyboard: ${error}`);
    }
  }

  private _destroyVirtualKeyboard(): void {
    if (this.contentPurposeSignalConnectionId && Main.inputMethod) {
      // @ts-ignore
      Main.inputMethod.disconnectObject(this);
      this.contentPurposeSignalConnectionId = 0;
    }
    if (this.virtualKeyboardDevice) {
      this.virtualKeyboardDevice = null;
    }
  }

  private _notifyVirtualKey(key: number, keyState: Clutter.KeyState): void {
    if (!this.virtualKeyboardDevice) return;
    this.virtualKeyboardDevice.notify_keyval(
      Clutter.get_current_event_time() * 1000,
      key,
      keyState,
    );
  }

  private _focusedInputBehavesLikeTerminal(): boolean {
    return this.contentPurpose === Clutter.InputContentPurpose.TERMINAL;
  }

  private _pasteIntoActiveField(): Promise<void> {
    return new Promise<void>(resolve => {
      if (this.pasteIntoActiveFieldTimeoutSourceId) {
        GLib.source_remove(this.pasteIntoActiveFieldTimeoutSourceId);
        this.pasteIntoActiveFieldTimeoutSourceId = 0;
      }
      this.pasteIntoActiveFieldTimeoutSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        this.pasteIntoActiveFieldTimeoutSourceId = 0;
        try {
          if (this._focusedInputBehavesLikeTerminal()) {
            this._notifyVirtualKey(Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            this._notifyVirtualKey(Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
            this._notifyVirtualKey(Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
            this._notifyVirtualKey(Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
            this._notifyVirtualKey(Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
            this._notifyVirtualKey(Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
          } else {
            this._notifyVirtualKey(Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
            this._notifyVirtualKey(Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
            this._notifyVirtualKey(Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
            this._notifyVirtualKey(Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
          }
        } catch (error) {
          log(`[Speech to Text] Paste failed: ${error}`);
        }
        resolve();
        return GLib.SOURCE_REMOVE;
      });
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────

  private _onToggle(): void {
    if (this.recording) {
      this._doStop();
    } else {
      this._doStart();
    }
  }

  private async _doStart(): Promise<void> {
    const settings = this.settings;
    if (!settings) return;

    const openRouterApiKey = settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.OPENROUTER_API_KEY)?.trim();
    if (!openRouterApiKey) {
      showShellNotification(
        _('Speech to Text'),
        _('Please set your OpenRouter API key in extension settings.'),
      );
      return;
    }

    const openRouterModelIdentifier = settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.MODEL)?.trim();
    if (!openRouterModelIdentifier) {
      showShellNotification(
        _('Speech to Text'),
        _('Please set a transcription model in extension settings.'),
      );
      return;
    }

    if (!this.button) this._createButton();

    this._setRecording(true);

    if (settings.get_boolean(GSETTINGS_SCHEMA_KEY_NAMES.PLAY_SOUND)) {
      playSoundEffectFromFile(
        `${this.path}/resources/start.mp3`,
        settings.get_int(GSETTINGS_SCHEMA_KEY_NAMES.SOUND_VOLUME),
      );
    }

    try {
      this.recorder!.start();
    } catch (error: any) {
      showShellNotification(
        _('Speech to Text — Error'),
        _('Failed to start recording.') + (error?.message ? ` ${error.message}` : ''),
      );
      this._setRecording(false);
    }
  }

  private async _doStop(): Promise<void> {
    const settings = this.settings;
    if (!settings) return;

    if (settings.get_boolean(GSETTINGS_SCHEMA_KEY_NAMES.PLAY_SOUND)) {
      playSoundEffectFromFile(
        `${this.path}/resources/stop.mp3`,
        settings.get_int(GSETTINGS_SCHEMA_KEY_NAMES.SOUND_VOLUME),
      );
    }

    this._setRecording(false);
    this._setTranscribing(true);

    try {
      const recordedAudioPath = await this.recorder!.stop();
      if (!recordedAudioPath) {
        this._setTranscribing(false);
        return;
      }

      const openRouterApiKey =
        settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.OPENROUTER_API_KEY)?.trim() ?? '';
      const openRouterModelIdentifier =
        settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.MODEL)?.trim() ?? '';
      const emptySpeechAction =
        settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.EMPTY_SPEECH_ACTION) || 'placeholder';
      const emptySpeechPlaceholderText =
        settings.get_string(GSETTINGS_SCHEMA_KEY_NAMES.EMPTY_SPEECH_PLACEHOLDER) ?? '';
      const samplingTemperature = settings.get_double(GSETTINGS_SCHEMA_KEY_NAMES.TEMPERATURE);
      const requestTimeoutSeconds = settings.get_int(GSETTINGS_SCHEMA_KEY_NAMES.REQUEST_TIMEOUT);
      const openRouterIdentification =
        buildOpenRouterApplicationIdentificationFromMetadata(this.metadata);

      let transcribedText = await requestTranscriptionFromOpenRouter(
        recordedAudioPath,
        openRouterApiKey,
        openRouterModelIdentifier,
        TRANSCRIPTION_SYSTEM_PROMPT,
        samplingTemperature,
        requestTimeoutSeconds,
        openRouterIdentification,
      );
      const hasNoTranscribedSpeech =
        transcribedText === '' || transcribedText === NO_TRANSCRIBED_SPEECH_SENTINEL;
      if (hasNoTranscribedSpeech) {
        if (emptySpeechAction === 'skip') {
          return;
        }
        const trimmedPlaceholder = emptySpeechPlaceholderText.trim();
        if (!trimmedPlaceholder) {
          return;
        }
        transcribedText = trimmedPlaceholder;
      }

      try {
        const clipboard = St.Clipboard.get_default();
        if (clipboard) {
          clipboard.set_text(St.ClipboardType.CLIPBOARD, transcribedText);
          clipboard.set_text(St.ClipboardType.PRIMARY, transcribedText);
        }
      } catch (_) {}

      this._pasteIntoActiveField();
    } catch (error: any) {
      showShellNotification(_('Speech to Text — Error'), error?.message ?? String(error));
    } finally {
      this._setTranscribing(false);
    }
  }
}
