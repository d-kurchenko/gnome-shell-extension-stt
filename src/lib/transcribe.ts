/**
 * OpenRouter chat/completions transcription request.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const NO_SPEECH = '...';

export const SYSTEM_PROMPT =
    'You receive audio as input and must output only its text transcription without any additional comments. ' +
    'Write numbers as digits. Transcribe all sounds as they are. Remove all hesitations (hmm, uh, um). ' +
    `If there is no speech in the audio, respond with "${NO_SPEECH}" and nothing else`;

export class Transcriber
{
    #session: Soup.Session;
    #cancellable: Gio.Cancellable;
    #title: string;
    #referer: string;
    #version: string;

    constructor(metadata: {name?: string, url?: string, version?: string | number})
    {
        this.#title = metadata.name || 'Speech to Text';
        this.#referer = metadata.url || '';
        this.#version = metadata.version != null ? String(metadata.version) : '0';
        this.#session = new Soup.Session();
        this.#cancellable = new Gio.Cancellable();
    }

    async transcribe(
        audioPath: string,
        apiKey: string,
        model: string,
        temperature: number,
        timeoutSeconds: number
    ): Promise<string>
    {
        const file = Gio.File.new_for_path(audioPath);
        const [bytes] = await file.load_contents_async(this.#cancellable);
        if (!bytes.length)
            throw new Error('Failed to read audio file');

        const body = JSON.stringify({
            model,
            temperature,
            messages: [
                {role: 'system', content: SYSTEM_PROMPT},
                {
                    role: 'user',
                    content: [{
                        type: 'input_audio',
                        input_audio: {
                            data: GLib.base64_encode(bytes),
                            format: 'wav',
                        },
                    }],
                },
            ],
        });

        const message = Soup.Message.new('POST', OPENROUTER_URL);
        message.set_request_body_from_bytes(
            'application/json',
            new GLib.Bytes(new TextEncoder().encode(body))
        );

        message.request_headers.append('Authorization', `Bearer ${apiKey}`);
        message.request_headers.append('HTTP-Referer', this.#referer);
        message.request_headers.append('X-OpenRouter-Title', this.#title);
        this.#session.user_agent = `${this.#title.replace(/\s+/g, '-')}/${this.#version}`;
        this.#session.timeout = timeoutSeconds;

        const response = await this.#session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this.#cancellable
        );
        const status = message.get_status();
        if (status !== Soup.Status.OK)
            throw new Error(`HTTP ${status}: ${Soup.status_get_phrase(status)}`);

        const parsed = JSON.parse(new TextDecoder('utf-8').decode(response.get_data()));
        if (parsed.error)
            throw new Error(parsed.error.message || JSON.stringify(parsed.error));

        const content = parsed.choices[0].message.content;
        if (typeof content !== 'string')
            return '';

        return content.trim();
    }

    destroy(): void
    {
        this.#cancellable.cancel();
        this.#session.abort();
    }
}
