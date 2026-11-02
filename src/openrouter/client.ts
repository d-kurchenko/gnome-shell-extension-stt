import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {ERRORS, errorDetail, isObject, OpenRouterError} from './protocol.js';

export interface ExtensionMetadata {
    name?: string;
    url?: string;
    version?: string | number;
}

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterClient
{
    #session: Soup.Session;
    #metadata: ExtensionMetadata;

    constructor(metadata: ExtensionMetadata)
    {
        Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
        this.#metadata = metadata;
        const title = metadata.name || 'Speech to Text';
        this.#session = new Soup.Session({
            user_agent: `${title.replace(/\s+/g, '-')}/${metadata.version ?? '0'}`,
        });
    }

    async request(
        path: string,
        apiKey: string,
        cancellable: Gio.Cancellable,
        timeout = 15,
        body?: object
    ): Promise<unknown>
    {
        cancellable.set_error_if_cancelled();
        const message = Soup.Message.new(body ? 'POST' : 'GET', BASE_URL + path);
        if (apiKey)
            message.request_headers.append('Authorization', `Bearer ${apiKey}`);

        if (this.#metadata.url)
            message.request_headers.append('HTTP-Referer', this.#metadata.url);

        message.request_headers.append('X-OpenRouter-Title', this.#metadata.name || 'Speech to Text');
        if (body) {
            message.set_request_body_from_bytes(
                'application/json',
                new GLib.Bytes(new TextEncoder().encode(JSON.stringify(body)))
            );
        }

        // Each request owns its deadline; catalog refreshes may run in parallel.
        const deadline = new Gio.Cancellable();
        let timedOut = false;
        let timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.max(1, timeout), () => {
            timeoutId = 0;
            timedOut = true;
            deadline.cancel();
            return GLib.SOURCE_REMOVE;
        });
        const cancelId = cancellable.connect(() => {
            deadline.cancel();
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = 0;
            }
        });

        try {
            const bytes = await this.#session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, deadline);
            const status = message.get_status();
            let response: unknown;
            try {
                response = JSON.parse(new TextDecoder().decode(bytes.get_data()));
            } catch {
                if (status >= 200 && status < 300)
                    throw new OpenRouterError(ERRORS.RESPONSE);
            }

            const error = isObject(response) ? response.error : null;
            if (status < 200 || status >= 300 || error) {
                const code = isObject(error) && typeof error.code === 'number' ? error.code : status;
                throw new OpenRouterError(httpError(code), code, errorDetail(response));
            }

            return response;
        } catch (error) {
            if (timedOut)
                throw new OpenRouterError(ERRORS.TIMEOUT);

            if (cancellable.is_cancelled() || error instanceof OpenRouterError)
                throw error;

            throw new OpenRouterError(ERRORS.NETWORK);
        } finally {
            if (timeoutId)
                GLib.source_remove(timeoutId);

            if (cancelId)
                cancellable.disconnect(cancelId);
        }
    }

    destroy(): void
    {
        this.#session.abort();
    }
}

function httpError(status: number): string
{
    switch (status) {
    case 401:
    case 403:
        return ERRORS.AUTH;
    case 402:
        return ERRORS.CREDITS;
    case 404:
        return ERRORS.MODEL;
    case 413:
        return ERRORS.SIZE;
    case 408:
    case 504:
    case 524:
        return ERRORS.TIMEOUT;
    case 429:
        return ERRORS.LIMIT;
    default:
        return ERRORS.REQUEST;
    }
}
