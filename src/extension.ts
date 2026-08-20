/**
 * Extension entry point.
 */

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {KEYS, EMPTY_SPEECH} from './lib/const.js';
import {Indicator} from './lib/indicator.js';
import {Paster} from './lib/paste.js';
import {Recorder} from './lib/recorder.js';
import {SoundPlayer} from './lib/sound.js';
import {NO_SPEECH, Transcriber} from './lib/transcribe.js';

export default class SpeechToTextExtension extends Extension
{
    #settings: Gio.Settings | null = null;
    #indicator: Indicator | null = null;
    #recorder: Recorder | null = null;
    #transcriber: Transcriber | null = null;
    #sound: SoundPlayer | null = null;
    #paster: Paster | null = null;
    #recording = false;
    #shortcutBound = false;

    enable()
    {
        this.#settings = this.getSettings();
        this.#recorder = new Recorder();
        this.#transcriber = new Transcriber(this.metadata);
        this.#sound = new SoundPlayer();
        this.#paster = new Paster();
        this.#indicator = new Indicator(this.#settings, () => this.#toggle());

        this.#paster.enable();
        this.#indicator.enable();
        this.#bindShortcuts();

        (this.#settings as any).connectObject(
            `changed::${KEYS.TOGGLE_SHORTCUT}`,
            () => this.#rebindShortcuts(),
            this
        );
        (this.#settings as any).connectObject(
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

    disable()
    {
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
        this.#recording = false;
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
        if (this.#recording)
            this.#stop();
        else
            this.#start();
    }

    #playCue(fileName: string): void
    {
        if (!this.#settings.get_boolean(KEYS.PLAY_SOUND))
            return;

        this.#sound.play(
            `${this.path}/resources/${fileName}`,
            this.#settings.get_int(KEYS.SOUND_VOLUME)
        );
    }

    #start(): void
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
        this.#recording = true;
        this.#indicator.setRecording(true);
        this.#playCue('start.mp3');

        try {
            this.#recorder.start();
        } catch (error) {
            Main.notify(_('Speech to Text — Error'), _('Failed to start recording.') + ` ${error}`);
            this.#recording = false;
            this.#indicator.setRecording(false);
        }
    }

    async #stop(): Promise<void>
    {
        this.#playCue('stop.mp3');
        this.#recording = false;
        this.#indicator.setRecording(false);
        this.#indicator.setTranscribing(true);

        try {
            const path = await this.#recorder.stop();
            if (!this.#settings)
                return;

            if (!path)
                return;

            const apiKey = this.#settings.get_string(KEYS.API_KEY).trim();
            const model = this.#settings.get_string(KEYS.MODEL).trim();
            const temperature = this.#settings.get_double(KEYS.TEMPERATURE);
            const timeout = this.#settings.get_int(KEYS.REQUEST_TIMEOUT);
            let text = await this.#transcriber.transcribe(
                path, apiKey, model, temperature, timeout
            );
            if (!this.#settings)
                return;

            if (text === '' || text === NO_SPEECH) {
                if (this.#settings.get_string(KEYS.EMPTY_SPEECH_ACTION) === EMPTY_SPEECH.SKIP)
                    return;

                text = this.#settings.get_string(KEYS.EMPTY_SPEECH_PLACEHOLDER).trim();
                if (!text)
                    return;
            }

            this.#paster.paste(text);
        } catch (error) {
            if (!this.#settings)
                return;

            Main.notify(_('Speech to Text — Error'), `${error}`);
        } finally {
            this.#indicator?.setTranscribing(false);
        }
    }
}
