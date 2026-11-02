/**
 * Recording and transcription lifecycle in the Shell process.
 */

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {KEYS, EMPTY_SPEECH} from './const.js';
import {Indicator} from './indicator.js';
import {Paster} from './paste.js';
import {Recorder} from './recorder.js';
import {SoundPlayer} from './sound.js';
import {Transcriber} from './transcribe.js';
import {ModelApiSetting, TranscriptionOptions, describeError} from '../openrouter/protocol.js';
import {ExtensionMetadata} from '../openrouter/client.js';

type State = 'idle' | 'starting' | 'recording' | 'stopping' | 'transcribing';

interface RecordingOptions extends TranscriptionOptions {
    emptyAction: string;
    placeholder: string;
}

export class Controller
{
    #settings: Gio.Settings | null = null;
    #indicator: Indicator | null = null;
    #recorder: Recorder | null = null;
    #transcriber: Transcriber | null = null;
    #sound: SoundPlayer | null = null;
    #paster: Paster | null = null;
    #state: State = 'idle';
    #operation = 0;
    #options: RecordingOptions | null = null;
    #path: string;
    #shortcutBound = false;

    constructor(settings: Gio.Settings, path: string, uuid: string, metadata: ExtensionMetadata)
    {
        this.#settings = settings;
        this.#path = path;
        this.#recorder = new Recorder();
        this.#transcriber = new Transcriber(metadata, uuid);
        this.#sound = new SoundPlayer();
        this.#paster = new Paster();
        this.#indicator = new Indicator(this.#settings, uuid, path, () => this.#toggle());

        this.#paster.enable();
        this.#indicator.enable();
        this.#bindShortcuts();

        (this.#settings as any).connectObject(
            `changed::${KEYS.TOGGLE_SHORTCUT}`,
            () => this.#rebindShortcuts(),
            `changed::${KEYS.ENABLE_SHORTCUTS}`,
            () => this.#rebindShortcuts(),
            this
        );

        if (Main.layoutManager._startingUp) {
            (Main.layoutManager as any).connectObject(
                'startup-complete',
                () => this.#rebindShortcuts(),
                this
            );
        }
    }

    destroy(): void
    {
        this.#operation++;
        this.#options = null;
        this.#unbindShortcuts();

        (Main.layoutManager as any).disconnectObject(this);

        if (this.#settings)
            (this.#settings as any).disconnectObject(this);

        this.#indicator?.destroy();
        this.#indicator = null;

        this.#paster?.destroy();
        this.#paster = null;

        this.#sound?.destroy();
        this.#sound = null;

        this.#transcriber?.destroy();
        this.#transcriber = null;

        this.#recorder?.destroy();
        this.#recorder = null;

        this.#settings = null;
        this.#state = 'idle';
    }

    #rebindShortcuts(): void
    {
        this.#unbindShortcuts();
        this.#bindShortcuts();
    }

    #bindShortcuts(): void
    {
        if (!this.#settings.get_boolean(KEYS.ENABLE_SHORTCUTS))
            return;

        Main.wm.addKeybinding(
            KEYS.TOGGLE_SHORTCUT,
            this.#settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => this.#toggle()
        );
        this.#shortcutBound = true;
    }

    #unbindShortcuts(): void
    {
        if (!this.#shortcutBound)
            return;

        Main.wm.removeKeybinding(KEYS.TOGGLE_SHORTCUT);
        this.#shortcutBound = false;
    }

    #toggle(): void
    {
        if (this.#state === 'starting')
            this.#cancelStart();
        else if (this.#state === 'recording')
            void this.#stop();
        else if (this.#state === 'idle')
            void this.#start();
    }

    async #playCue(fileName: string): Promise<void>
    {
        const volume = this.#settings.get_int(KEYS.SOUND_VOLUME);
        if (!this.#settings.get_boolean(KEYS.PLAY_SOUND) || volume === 0)
            return;

        try {
            await this.#sound.play(
                `${this.#path}/resources/${fileName}`,
                volume
            );
        } catch (error) {
            console.error(`[Speech to Text] Sound: ${error}`);
        }
    }

    async #start(): Promise<void>
    {
        const apiKey = this.#settings.get_string(KEYS.API_KEY).trim();
        if (!apiKey) {
            Main.notify(
                _('Speech to Text'),
                _('Please set your OpenRouter API key in extension settings.')
            );
            return;
        }

        const model = this.#settings.get_string(KEYS.MODEL).trim();
        if (!model) {
            Main.notify(
                _('Speech to Text'),
                _('Please set a transcription model in extension settings.')
            );
            return;
        }

        this.#indicator.showTemporarily();
        this.#options = {
            apiKey,
            model,
            api: this.#settings.get_string(KEYS.MODEL_API) as ModelApiSetting,
            language: this.#settings.get_string(KEYS.LANGUAGE).trim().toLowerCase(),
            temperature: this.#settings.get_double(KEYS.TEMPERATURE),
            timeout: this.#settings.get_int(KEYS.REQUEST_TIMEOUT),
            emptyAction: this.#settings.get_string(KEYS.EMPTY_SPEECH_ACTION),
            placeholder: this.#settings.get_string(KEYS.EMPTY_SPEECH_PLACEHOLDER).trim(),
        };
        const operation = ++this.#operation;
        this.#state = 'starting';

        try {
            await this.#playCue('start.mp3');
            if (operation !== this.#operation)
                return;

            this.#recorder.start();
            this.#state = 'recording';
            this.#indicator.setRecording(true);
        } catch (error) {
            if (operation !== this.#operation)
                return;

            Main.notify(_('Speech to Text — Error'), _('Failed to start recording.') + ` ${error}`);
            this.#options = null;
            this.#state = 'idle';
            this.#indicator.setRecording(false);
        }
    }

    #cancelStart(): void
    {
        this.#operation++;
        this.#sound.stop();
        this.#options = null;
        this.#state = 'idle';
        this.#indicator.setRecording(false);
    }

    async #stop(): Promise<void>
    {
        const operation = this.#operation;
        const options = this.#options;
        this.#state = 'stopping';
        this.#indicator.setRecording(false);
        this.#indicator.setTranscribing(true);

        try {
            const path = await this.#recorder.stop();
            if (operation !== this.#operation || !path)
                return;

            await this.#playCue('stop.mp3');
            if (operation !== this.#operation)
                return;

            this.#state = 'transcribing';
            let text = await this.#transcriber.transcribe(path, options);
            if (operation !== this.#operation)
                return;

            if (!text) {
                if (options.emptyAction === EMPTY_SPEECH.SKIP || !options.placeholder)
                    return;

                text = options.placeholder;
            }

            this.#paster.paste(text);
        } catch (error) {
            if (operation === this.#operation) {
                const message = describeError(error, _);
                console.error(`[Speech to Text] ${options.model} (${options.api}): ${message}`);
                Main.notify(_('Speech to Text — Error'), message);
            }
        } finally {
            if (operation === this.#operation) {
                this.#options = null;
                this.#state = 'idle';
                this.#indicator.setTranscribing(false);
            }
        }
    }
}
