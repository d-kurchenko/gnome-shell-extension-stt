/**
 * Paste clipboard contents into the focused field via a virtual keyboard.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Paster
{
    #keyboard: Clutter.VirtualInputDevice | null = null;
    #contentPurpose: number = Clutter.InputContentPurpose.NORMAL;
    #timeoutId = 0;

    enable(): void
    {
        const stage = Shell.Global.get().stage;
        const backend = typeof stage.get_context === 'function'
            ? stage.get_context().get_backend()
            : Clutter.get_default_backend();
        const seat = backend.get_default_seat();
        this.#keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this.#contentPurpose = Main.inputMethod.content_purpose;

        (Main.inputMethod as any).connectObject(
            'notify::content-purpose',
            (inputMethod: {content_purpose: number}) => {
                this.#contentPurpose = inputMethod.content_purpose;
            },
            this
        );
    }

    paste(text: string): void
    {
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, text);

        if (this.#timeoutId) {
            GLib.source_remove(this.#timeoutId);
            this.#timeoutId = 0;
        }
        this.#timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this.#timeoutId = 0;
            this.#sendPasteKeys();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy(): void
    {
        if (this.#timeoutId) {
            GLib.source_remove(this.#timeoutId);
            this.#timeoutId = 0;
        }

        (Main.inputMethod as any).disconnectObject(this);
        this.#keyboard = null;
    }

    #sendPasteKeys(): void
    {
        if (!this.#keyboard)
            return;

        const terminal = this.#contentPurpose === Clutter.InputContentPurpose.TERMINAL;
        if (terminal)
            this.#key(Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);

        this.#key(Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        this.#key(Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
        this.#key(Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
        this.#key(Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);

        if (terminal)
            this.#key(Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
    }

    #key(keyval: number, state: Clutter.KeyState): void
    {
        this.#keyboard.notify_keyval(
            GLib.get_monotonic_time(),
            keyval,
            state
        );
    }
}
