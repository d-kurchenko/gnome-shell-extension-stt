import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ModelCatalog} from '../openrouter/catalog.js';
import {ExtensionMetadata, OpenRouterClient} from '../openrouter/client.js';
import {ENDPOINTS, ERRORS, OpenRouterError, TranscriptionOptions, transcriptionBody, transcriptionText} from '../openrouter/protocol.js';

export class Transcriber
{
    #client: OpenRouterClient;
    #catalog: ModelCatalog;
    #cancellable = new Gio.Cancellable();

    constructor(metadata: ExtensionMetadata, uuid: string)
    {
        Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
        this.#client = new OpenRouterClient(metadata);
        this.#catalog = new ModelCatalog(this.#client, uuid);
    }

    async transcribe(audioPath: string, options: TranscriptionOptions): Promise<string>
    {
        const api = options.api === 'auto'
            ? await this.#catalog.resolve(options.model, options.apiKey, this.#cancellable)
            : options.api;

        const file = Gio.File.new_for_path(audioPath);
        let bytes: Uint8Array;
        try {
            [bytes] = await file.load_contents_async(this.#cancellable);
        } catch (error) {
            if (this.#cancellable.is_cancelled())
                throw error;

            throw new OpenRouterError(ERRORS.AUDIO);
        }

        if (!bytes.length)
            throw new OpenRouterError(ERRORS.AUDIO);

        const body = transcriptionBody(
            api, options.model, GLib.base64_encode(bytes), options.temperature, options.language
        );
        const response = await this.#client.request(
            ENDPOINTS[api], options.apiKey, this.#cancellable, options.timeout, body
        );
        return transcriptionText(api, response);
    }

    destroy(): void
    {
        this.#cancellable.cancel();
        this.#client.destroy();
    }
}
