/**
 * GStreamer helpers used by recording and playback.
 */

import Gst from 'gi://Gst';

let initialized = false;

export function initGst(): void
{
    if (initialized)
        return;

    Gst.init(null);
    initialized = true;
}

export function makeMicSource(): Gst.Element
{
    const factories = ['pulsesrc', 'pipewiresrc', 'autoaudiosrc'];

    for (const factory of factories) {
        const element = Gst.ElementFactory.make(factory, null);
        if (!element)
            continue;

        if (factory === 'pulsesrc')
            (element as any).device = 'default';

        return element;
    }

    throw new Error('No GStreamer microphone element (gst-plugins-good / PipeWire)');
}
