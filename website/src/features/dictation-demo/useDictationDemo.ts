import { computed, ref, watch, type MaybeRefOrGetter, toValue } from 'vue';
import { useTimeoutFn } from '@vueuse/core';
import type { DemoMessages } from '../../i18n';

export type DemoState = 'idle' | 'recording' | 'transcribing' | 'complete';

interface PlaybackOptions {
    active: MaybeRefOrGetter<boolean>;
    reducedMotion: MaybeRefOrGetter<boolean>;
}

/** Presentation-only loop: no microphone, clipboard, or network access. */
export function useDictationDemo(messages: MaybeRefOrGetter<DemoMessages>, options: PlaybackOptions) {
    const state = ref<DemoState>('idle');
    const autoplay = ref(true);
    const active = computed(() => toValue(options.active));
    const reducedMotion = computed(() => toValue(options.reducedMotion));
    const looping = computed(() => active.value && autoplay.value && !reducedMotion.value);
    const playing = computed(() => state.value === 'recording' || state.value === 'transcribing');
    const labels = computed(() => {
        const t = toValue(messages);
        const status = {
            idle: t.ready,
            recording: t.recording,
            transcribing: t.transcribing,
            complete: t.done,
        }[state.value];
        const button = reducedMotion.value
            ? (playing.value ? status : state.value === 'idle' ? t.play : t.again)
            : (autoplay.value ? t.pause : t.resume);
        return { button, status };
    });

    // Keep the completed transcript visible before starting the next recording.
    const replay = useTimeoutFn(play, 2800, { immediate: false });
    const transcription = useTimeoutFn(() => {
        state.value = 'complete';
        if (looping.value) replay.start();
    }, () => reducedMotion.value ? 350 : 1300, { immediate: false });

    const recording = useTimeoutFn(() => {
        state.value = 'transcribing';
        transcription.start();
    }, () => reducedMotion.value ? 350 : 2300, { immediate: false });

    function stopTimers() {
        recording.stop();
        transcription.stop();
        replay.stop();
    }

    function play() {
        if (!active.value || playing.value) return;
        stopTimers();
        state.value = 'recording';
        recording.start();
    }

    function toggle() {
        if (reducedMotion.value) play();
        else autoplay.value = !autoplay.value;
    }

    watch([active, reducedMotion, autoplay], () => {
        stopTimers();
        if (playing.value) state.value = 'complete';
        if (looping.value) play();
    }, { immediate: true, flush: 'sync' });

    // VueUse cancels all three timers when the island's effect scope is disposed.
    return { state, playing, autoplay, labels, toggle };
}
