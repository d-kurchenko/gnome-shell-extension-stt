/**
 * Short start/stop cues via GStreamer playbin.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';

import {initGst} from './gst.js';

const PLAYBIN_AUDIO_ONLY = 1 << 1;

type Playback = {
    element: Gst.Element;
    watchId: number;
    resolve: () => void;
};

export class SoundPlayer
{
    #playback: Playback | null = null;

    async play(path: string, volumePercent: number): Promise<void>
    {
        this.stop();
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null))
            return;

        initGst();
        const playbin = Gst.ElementFactory.make('playbin', null);
        if (!playbin)
            return;

        (playbin as any).uri = file.get_uri();
        (playbin as any).volume = Math.max(0, Math.min(1, volumePercent / 100));
        (playbin as any).flags = PLAYBIN_AUDIO_ONLY;

        const bus = playbin.get_bus();
        if (!bus) {
            playbin.set_state(Gst.State.NULL);
            return;
        }

        await new Promise<void>(resolve => {
            const playback: Playback = {element: playbin, watchId: 0, resolve};
            this.#playback = playback;
            playback.watchId = bus.add_watch(GLib.PRIORITY_DEFAULT, (_bus, message) => {
                if (message.type === Gst.MessageType.ERROR) {
                    const [error] = message.parse_error();
                    console.error(`[Speech to Text] Sound: ${error.message}`);
                }
                if (message.type === Gst.MessageType.EOS || message.type === Gst.MessageType.ERROR) {
                    this.#finish(false);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });

            if (playbin.set_state(Gst.State.PLAYING) === Gst.StateChangeReturn.FAILURE)
                this.#finish(true);
        });
    }

    stop(): void
    {
        this.#finish(true);
    }

    destroy(): void
    {
        this.stop();
    }

    #finish(removeSource: boolean): void
    {
        const playback = this.#playback;
        if (!playback)
            return;

        this.#playback = null;
        if (removeSource && playback.watchId)
            GLib.source_remove(playback.watchId);

        playback.watchId = 0;
        playback.element.set_state(Gst.State.NULL);
        playback.resolve();
    }
}
