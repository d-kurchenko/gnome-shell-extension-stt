/**
 * Microphone capture to a 16 kHz mono WAV file.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';

import {initGst, makeMicSource} from './gst.js';

export class Recorder
{
    #path: string;
    #pipeline: Gst.Pipeline | null = null;
    #bus: Gst.Bus | null = null;
    #busSignalId = 0;
    #timeoutId = 0;
    #waitResolve: ((message: Gst.Message | null) => void) | null = null;

    constructor()
    {
        this.#path = GLib.build_filenamev([
            GLib.get_tmp_dir(),
            'speech-to-text-recording.wav',
        ]);
    }

    start(): void
    {
        initGst();
        this.#deleteFile();

        const pipeline = new Gst.Pipeline({name: 'speech-to-text-record'});
        const source = makeMicSource();
        const convert = Gst.ElementFactory.make('audioconvert', null);
        const resample = Gst.ElementFactory.make('audioresample', null);
        const capsFilter = Gst.ElementFactory.make('capsfilter', null);
        const encoder = Gst.ElementFactory.make('wavenc', null);
        const sink = Gst.ElementFactory.make('filesink', null);

        if (!convert || !resample || !capsFilter || !encoder || !sink)
            throw new Error('Missing GStreamer elements (gst-plugins-base/good)');

        (capsFilter as any).caps = Gst.Caps.from_string(
            'audio/x-raw,format=S16LE,rate=16000,channels=1'
        );
        (sink as any).location = this.#path;
        (sink as any).sync = false;

        pipeline.add(source);
        pipeline.add(convert);
        pipeline.add(resample);
        pipeline.add(capsFilter);
        pipeline.add(encoder);
        pipeline.add(sink);

        if (!source.link(convert) ||
            !convert.link(resample) ||
            !resample.link(capsFilter) ||
            !capsFilter.link(encoder) ||
            !encoder.link(sink))
            throw new Error('GStreamer link failed');

        const state = pipeline.set_state(Gst.State.PLAYING);
        if (state === Gst.StateChangeReturn.FAILURE) {
            pipeline.set_state(Gst.State.NULL);
            throw new Error('GStreamer could not start recording');
        }

        this.#pipeline = pipeline;
    }

    async stop(): Promise<string | null>
    {
        const pipeline = this.#pipeline;
        if (!pipeline)
            return null;

        const bus = pipeline.get_bus();
        if (!bus) {
            pipeline.set_state(Gst.State.NULL);
            this.#pipeline = null;
            return null;
        }

        pipeline.send_event(Gst.Event.new_eos());
        const message = await this.#waitForEos(bus);

        pipeline.set_state(Gst.State.NULL);
        this.#pipeline = null;

        if (!message || message.type === Gst.MessageType.ERROR) {
            if (message && message.type === Gst.MessageType.ERROR) {
                const [error] = message.parse_error();
                console.error(`[Speech to Text] Recording stop: ${error.message}`);
            }
            this.#deleteFile();
            return null;
        }

        const file = Gio.File.new_for_path(this.#path);
        if (!file.query_exists(null))
            return null;

        const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        if (!info || info.get_size() < 44)
            return null;

        return this.#path;
    }

    destroy(): void
    {
        this.#resolveWait(null, true);
        if (this.#pipeline) {
            this.#pipeline.set_state(Gst.State.NULL);
            this.#pipeline = null;
        }
        this.#deleteFile();
    }

    #waitForEos(bus: Gst.Bus): Promise<Gst.Message | null>
    {
        return new Promise(resolve => {
            this.#waitResolve = resolve;
            this.#bus = bus;
            bus.add_signal_watch();
            this.#busSignalId = bus.connect('message', (_bus: Gst.Bus, message: Gst.Message) => {
                if (message.type === Gst.MessageType.EOS ||
                    message.type === Gst.MessageType.ERROR)
                    this.#resolveWait(message, true);
            });
            this.#timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20000, () => {
                this.#timeoutId = 0;
                this.#resolveWait(null, false);
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    #resolveWait(message: Gst.Message | null, removeTimeout: boolean): void
    {
        if (removeTimeout && this.#timeoutId) {
            GLib.source_remove(this.#timeoutId);
            this.#timeoutId = 0;
        } else {
            this.#timeoutId = 0;
        }

        if (this.#bus) {
            if (this.#busSignalId) {
                this.#bus.disconnect(this.#busSignalId);
                this.#busSignalId = 0;
            }
            this.#bus.remove_signal_watch();
            this.#bus = null;
        }

        const resolve = this.#waitResolve;
        this.#waitResolve = null;
        if (resolve)
            resolve(message);
    }

    #deleteFile(): void
    {
        const file = Gio.File.new_for_path(this.#path);
        if (file.query_exists(null))
            file.delete(null);
    }
}
