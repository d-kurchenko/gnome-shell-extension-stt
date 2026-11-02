/**
 * Extension entry point.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Controller} from './lib/controller.js';

export default class SpeechToTextExtension extends Extension
{
    #controller: Controller | null = null;

    enable(): void
    {
        this.#controller = new Controller(this.getSettings(), this.path, this.uuid, this.metadata);
    }

    disable(): void
    {
        this.#controller?.destroy();
        this.#controller = null;
    }
}
