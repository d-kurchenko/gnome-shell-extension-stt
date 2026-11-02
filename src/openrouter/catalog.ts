import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {OpenRouterClient} from './client.js';
import {ERRORS, isObject, ModelApi, ModelInfo, OpenRouterError, parseModel, parseModels} from './protocol.js';

const CACHE_AGE = 24 * 60 * 60 * 1000;

export class ModelCatalog
{
    #client: OpenRouterClient;
    #file: Gio.File;
    #models = new Map<string, ModelInfo>();
    #updatedAt = 0;
    #loaded = false;

    constructor(client: OpenRouterClient, uuid: string)
    {
        Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
        Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
        this.#client = client;
        this.#file = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_cache_dir(), uuid, 'models.json',
        ]));
    }

    get models(): ModelInfo[]
    {
        return [...this.#models.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    get stale(): boolean
    {
        const age = Date.now() - this.#updatedAt;
        return age < 0 || age >= CACHE_AGE;
    }

    find(id: string): ModelInfo | undefined
    {
        return this.#models.get(id);
    }

    async load(cancellable: Gio.Cancellable): Promise<void>
    {
        if (this.#loaded)
            return;

        try {
            const [bytes] = await this.#file.load_contents_async(cancellable);
            const cache: unknown = JSON.parse(new TextDecoder().decode(bytes));
            if (!isObject(cache) || cache.version !== 1 || !Array.isArray(cache.models))
                return;

            for (const model of cache.models) {
                if (isCachedModel(model))
                    this.#models.set(model.id, model);
            }

            this.#updatedAt = typeof cache.updatedAt === 'number' ? cache.updatedAt : 0;
        } catch (error) {
            if (cancellable.is_cancelled())
                throw error;

            // Missing or damaged cache is replaced by the next successful refresh.
        } finally {
            this.#loaded = !cancellable.is_cancelled();
        }
    }

    async refresh(apiKey: string, cancellable: Gio.Cancellable): Promise<void>
    {
        const responses = await Promise.all([
            this.#client.request('/models', apiKey, cancellable),
            this.#client.request('/models?output_modalities=transcription', apiKey, cancellable),
        ]);
        const models = responses.flatMap(parseModels);
        this.#models = new Map(models.map(model => [model.id, model]));
        this.#updatedAt = Date.now();
        await this.#save(cancellable);
    }

    async resolve(id: string, apiKey: string, cancellable: Gio.Cancellable): Promise<ModelApi>
    {
        await this.load(cancellable);
        const cached = this.find(id);
        if (cached)
            return cached.apis[0];

        const parts = id.split('/');
        if (parts.length !== 2 || parts.some(part => !part))
            throw new OpenRouterError(ERRORS.RESOLVE);

        let response: unknown;
        try {
            response = await this.#client.request(`/model/${parts.map(encodeURIComponent).join('/')}`, apiKey, cancellable);
        } catch (error) {
            if (cancellable.is_cancelled())
                throw error;

            if (error instanceof OpenRouterError) {
                if ([401, 402, 403, 429].includes(error.status))
                    throw error;

                throw new OpenRouterError(ERRORS.RESOLVE, error.status, error.detail);
            }

            throw error;
        }

        const model = isObject(response) ? parseModel(response.data) : null;
        if (!model)
            throw new OpenRouterError(ERRORS.UNSUPPORTED);

        this.#models.set(id, {...model, id});
        await this.#save(cancellable);
        return model.apis[0];
    }

    async #save(cancellable: Gio.Cancellable): Promise<void>
    {
        try {
            this.#file.get_parent().make_directory_with_parents(cancellable);
        } catch (error) {
            if (cancellable.is_cancelled())
                throw error;

            if (!(error instanceof GLib.Error) || !error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.EXISTS))
                return;
        }

        try {
            const contents = JSON.stringify({version: 1, updatedAt: this.#updatedAt, models: this.models});
            // @girs does not declare the promisified overload for this method.
            await (this.#file as any).replace_contents_bytes_async(
                new GLib.Bytes(new TextEncoder().encode(contents)),
                null, false, Gio.FileCreateFlags.PRIVATE, cancellable
            );
        } catch (error) {
            if (cancellable.is_cancelled())
                throw error;

            // Dictation and model selection also work when the cache is not writable.
        }
    }
}

function isCachedModel(value: unknown): value is ModelInfo
{
    return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
        Array.isArray(value.apis) && value.apis.length > 0 &&
        value.apis.every(api => api === 'chat' || api === 'transcription') &&
        Array.isArray(value.parameters) && value.parameters.every(parameter => typeof parameter === 'string');
}
