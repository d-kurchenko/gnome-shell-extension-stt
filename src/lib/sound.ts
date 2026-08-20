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
};

export class SoundPlayer
{
    #playbacks: Playback[] = [];

    play(path: string, volumePercent: number): void
    {
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

        const playback: Playback = {element: playbin, watchId: 0};
        playback.watchId = bus.add_watch(GLib.PRIORITY_DEFAULT, (_bus, message) => {
            if (message.type === Gst.MessageType.EOS ||
                message.type === Gst.MessageType.ERROR) {
                if (message.type === Gst.MessageType.ERROR) {
                    const [error] = message.parse_error();
                    console.error(`[Speech to Text] Sound: ${error.message}`);
                }
                this.#drop(playback, false);
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });

        if (playbin.set_state(Gst.State.PLAYING) === Gst.StateChangeReturn.FAILURE) {
            this.#drop(playback, true);
            return;
        }

        this.#playbacks.push(playback);
    }

    destroy(): void
    {
        const playbacks = this.#playbacks;
        this.#playbacks = [];
        for (const playback of playbacks)
            this.#stop(playback, true);
    }

    #drop(playback: Playback, removeSource: boolean): void
    {
        const index = this.#playbacks.indexOf(playback);
        if (index !== -1)
            this.#playbacks.splice(index, 1);

        this.#stop(playback, removeSource);
    }

    #stop(playback: Playback, removeSource: boolean): void
    {
        if (removeSource && playback.watchId)
            GLib.source_remove(playback.watchId);

        playback.watchId = 0;
        playback.element.set_state(Gst.State.NULL);
    }
}
