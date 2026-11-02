export type ModelApi = 'chat' | 'transcription';
export type ModelApiSetting = 'auto' | ModelApi;

export interface ModelInfo {
    id: string;
    name: string;
    apis: ModelApi[];
    parameters: string[];
}

export interface TranscriptionOptions {
    apiKey: string;
    model: string;
    api: ModelApiSetting;
    language: string;
    temperature: number;
    timeout: number;
}

export const ENDPOINTS: Record<ModelApi, string> = {
    chat: '/chat/completions',
    transcription: '/audio/transcriptions',
};

const NO_SPEECH = '...';
const SYSTEM_PROMPT =
    'You receive audio as input and must output only its text transcription without any additional comments. ' +
    'Transcribe speech in its original language; do not translate. ' +
    'Write numbers as digits. Transcribe all sounds as they are. Remove all hesitations (hmm, uh, um). ' +
    `If there is no speech in the audio, respond with "${NO_SPEECH}" and nothing else`;

// Mark shared error messages for gettext without importing either process's entry point.
function N_(message: string): string
{
    return message;
}

export const ERRORS = {
    RESPONSE: N_('OpenRouter returned an invalid response.'),
    NETWORK: N_('Could not connect to OpenRouter. Check your connection.'),
    TIMEOUT: N_('OpenRouter timed out. Try a shorter recording or increase the request timeout.'),
    AUTH: N_('Check your OpenRouter API key.'),
    CREDITS: N_('Your OpenRouter balance is insufficient.'),
    MODEL: N_('The selected model is unavailable or does not support this request.'),
    SIZE: N_('The recording is too large for this model. Try a shorter recording.'),
    LIMIT: N_('OpenRouter is receiving too many requests. Try again later.'),
    REQUEST: N_('OpenRouter could not complete the request.'),
    RESOLVE: N_('Could not determine the model type. Set it when entering the model ID manually.'),
    UNSUPPORTED: N_('This model does not support audio transcription. Choose another model.'),
    AUDIO: N_('Failed to read the audio recording.'),
    LANGUAGE: N_('Enter a two-letter speech language code in settings, or leave it empty for automatic detection.'),
};

export class OpenRouterError extends Error
{
    constructor(message: string, public status = 0, public detail = '')
    {
        super(message);
        this.name = 'OpenRouterError';
    }
}

export function describeError(error: unknown, translate: (message: string) => string): string
{
    if (!(error instanceof OpenRouterError))
        return error instanceof Error ? error.message : String(error);

    const message = translate(error.message);
    const detail = error.detail.slice(0, 500).replace(/\s+/g, ' ').trim();
    return [message, error.status ? `HTTP ${error.status}` : '', detail].filter(Boolean).join('\n');
}

export function isObject(value: unknown): value is Record<string, unknown>
{
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function errorDetail(response: unknown): string
{
    if (!isObject(response))
        return '';

    const error = isObject(response.error) ? response.error : response;
    const message = typeof error.message === 'string' ? error.message
        : typeof response.error === 'string' ? response.error : '';
    const metadata = isObject(error.metadata) ? error.metadata : {};
    let raw: unknown = metadata.raw;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            // Some providers return a plain-text explanation instead of JSON.
        }
    }

    const upstream = typeof raw === 'string' ? raw : isObject(raw) ? errorDetail(raw) : '';
    return [message, upstream !== message ? upstream : ''].filter(Boolean).join('\n');
}

function strings(value: unknown): string[]
{
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

export function parseModel(value: unknown): ModelInfo | null
{
    if (!isObject(value) || typeof value.id !== 'string' || !value.id)
        return null;

    const architecture = isObject(value.architecture) ? value.architecture : {};
    if (!strings(architecture.input_modalities).includes('audio'))
        return null;

    const endpoints = Array.isArray(value.endpoints) ? strings(value.endpoints) : null;
    const outputs = strings(architecture.output_modalities);
    const apis: ModelApi[] = [];
    if (endpoints ? endpoints.includes(`/api/v1${ENDPOINTS.transcription}`) : outputs.includes('transcription'))
        apis.push('transcription');

    if (outputs.includes('text') &&
        (endpoints === null || endpoints.includes(`/api/v1${ENDPOINTS.chat}`)))
        apis.push('chat');

    if (!apis.length)
        return null;

    return {
        id: value.id,
        name: typeof value.name === 'string' ? value.name : value.id,
        apis,
        parameters: strings(value.supported_parameters),
    };
}

export function parseModels(response: unknown): ModelInfo[]
{
    if (!isObject(response) || !Array.isArray(response.data))
        throw new OpenRouterError(ERRORS.RESPONSE);

    return response.data.map(parseModel).filter((model): model is ModelInfo => model !== null);
}

export function transcriptionBody(
    api: ModelApi,
    model: string,
    audio: string,
    temperature: number,
    language: string
): object
{
    if (language && !/^[a-z]{2}$/.test(language))
        throw new OpenRouterError(ERRORS.LANGUAGE);

    const input_audio = {data: audio, format: 'wav'};
    if (api === 'transcription')
        return {model, temperature, input_audio, ...(language ? {language} : {})};

    const prompt = language ? `${SYSTEM_PROMPT}. The spoken language is ${language}.` : SYSTEM_PROMPT;

    return {
        model,
        temperature,
        messages: [
            {role: 'system', content: prompt},
            {role: 'user', content: [{type: 'input_audio', input_audio}]},
        ],
    };
}

export function transcriptionText(api: ModelApi, response: unknown): string
{
    if (!isObject(response))
        throw new OpenRouterError(ERRORS.RESPONSE);

    let text: unknown = response.text;
    if (api === 'chat') {
        const choice = Array.isArray(response.choices) ? response.choices[0] : null;
        const message = isObject(choice) ? choice.message : null;
        text = isObject(message) ? message.content : null;
    }

    if (typeof text !== 'string')
        throw new OpenRouterError(ERRORS.RESPONSE);

    const trimmed = text.trim();
    return api === 'chat' && trimmed === NO_SPEECH ? '' : trimmed;
}
