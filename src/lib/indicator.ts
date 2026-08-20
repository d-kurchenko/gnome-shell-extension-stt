/**
 * Top-bar recording indicator.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {KEYS, panelBoxName} from './const.js';

export class Indicator
{
    #settings: Gio.Settings | null;
    #onToggle: () => void;
    #button: PanelMenu.Button | null = null;
    #icon: St.Bin | null = null;
    #pressId = 0;
    #recording = false;
    #transcribing = false;

    constructor(settings: Gio.Settings, onToggle: () => void)
    {
        this.#settings = settings;
        this.#onToggle = onToggle;
    }

    enable(): void
    {
        (this.#settings as any).connectObject(
            `changed::${KEYS.SHOW_ICON}`,
            () => this.#sync(),
            this
        );
        (this.#settings as any).connectObject(
            `changed::${KEYS.PANEL_POSITION}`,
            () => this.#reposition(),
            this
        );
        (this.#settings as any).connectObject(
            `changed::${KEYS.PANEL_BOX}`,
            () => this.#reposition(),
            this
        );
        this.#sync();
    }

    setRecording(recording: boolean): void
    {
        this.#recording = recording;
        this.#updateStyle();
        if (!recording)
            this.#sync();
    }

    setTranscribing(transcribing: boolean): void
    {
        this.#transcribing = transcribing;
        this.#updateStyle();
        this.#sync();
    }

    showTemporarily(): void
    {
        if (!this.#button)
            this.#createButton();
    }

    destroy(): void
    {
        if (this.#settings)
            (this.#settings as any).disconnectObject(this);

        this.#removeButton();
        this.#settings = null;
    }

    #sync(): void
    {
        const show = this.#settings.get_boolean(KEYS.SHOW_ICON);
        const needed = show || this.#recording || this.#transcribing;

        if (needed && !this.#button) {
            this.#createButton();
            this.#updateStyle();
        } else if (!needed && this.#button) {
            this.#removeButton();
        }
    }

    #reposition(): void
    {
        if (!this.#button)
            return;

        this.#removeButton();
        this.#sync();
        this.#updateStyle();
    }

    #createButton(): void
    {
        this.#button = new PanelMenu.Button(0.0, 'Speech to Text', true);
        this.#icon = new St.Bin({
            style_class: 'speech-to-text-panel-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#button.add_child(this.#icon);

        this.#pressId = this.#button.connect('button-press-event', () => {
            this.#onToggle();
            return Clutter.EVENT_STOP;
        });

        const position = this.#settings.get_int(KEYS.PANEL_POSITION);
        const box = panelBoxName(this.#settings.get_string(KEYS.PANEL_BOX));
        Main.panel.addToStatusArea('speech-to-text-extension', this.#button, position, box);
    }

    #removeButton(): void
    {
        if (!this.#button)
            return;

        if (this.#pressId) {
            this.#button.disconnect(this.#pressId);
            this.#pressId = 0;
        }

        this.#button.destroy();
        this.#button = null;
        this.#icon = null;
    }

    #updateStyle(): void
    {
        if (!this.#icon)
            return;

        this.#icon.remove_style_class_name('recording');
        this.#icon.remove_style_class_name('transcribing');

        if (this.#recording)
            this.#icon.add_style_class_name('recording');
        else if (this.#transcribing)
            this.#icon.add_style_class_name('transcribing');
    }
}
