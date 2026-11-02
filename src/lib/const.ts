/**
 * GSettings keys and shared string values.
 */

export const KEYS = {
    API_KEY: 'openrouter-api-key',
    MODEL: 'model',
    MODEL_API: 'model-api',
    LANGUAGE: 'speech-language',
    TEMPERATURE: 'temperature',
    EMPTY_SPEECH_ACTION: 'empty-speech-action',
    EMPTY_SPEECH_PLACEHOLDER: 'empty-speech-placeholder',
    SHOW_ICON: 'show-icon',
    PANEL_BOX: 'panel-indicator-box',
    PANEL_POSITION: 'panel-indicator-position',
    PLAY_SOUND: 'play-sound',
    REQUEST_TIMEOUT: 'request-timeout',
    TOGGLE_SHORTCUT: 'toggle-shortcut',
    ENABLE_SHORTCUTS: 'enable-shortcuts',
    SOUND_VOLUME: 'sound-volume',
};

export const PANEL_BOX = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
};

export const EMPTY_SPEECH = {
    PLACEHOLDER: 'placeholder',
    SKIP: 'skip',
};

export function panelBoxName(value: string): string
{
    if (value === PANEL_BOX.LEFT ||
        value === PANEL_BOX.CENTER ||
        value === PANEL_BOX.RIGHT)
        return value;

    return PANEL_BOX.RIGHT;
}
