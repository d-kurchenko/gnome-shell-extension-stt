import metadata from '../../../../metadata.json';

export const site = {
    origin: 'https://d-kurchenko.github.io',
    base: '/gnome-shell-extension-stt',
    name: metadata.name,
    repository: metadata.url,
    install: 'https://extensions.gnome.org/extension/9978/speech-to-text/',
    openRouter: 'https://openrouter.ai/',
    apiKeys: 'https://openrouter.ai/keys',
    license: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html',
    versions: metadata['shell-version'],
} as const;
