<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentVisibility, useMounted, usePreferredReducedMotion } from '@vueuse/core';
import symbolic from '../../../../resources/icons/speech-to-text-symbolic.svg?url';
import { useDictationDemo } from './useDictationDemo';
import type { DemoMessages } from '../../i18n';

const props = defineProps<{ messages: DemoMessages }>();
const motion = usePreferredReducedMotion();
const visibility = useDocumentVisibility();
const mounted = useMounted();
const reducedMotion = computed(() => mounted.value && motion.value === 'reduce');
const { state, playing, autoplay, labels, toggle } = useDictationDemo(() => props.messages, {
    active: () => mounted.value && visibility.value === 'visible',
    reducedMotion,
});
const disabled = computed(() => !mounted.value || (reducedMotion.value && playing.value));
const bars = [
    12, 20, 32, 18, 42, 58, 30, 46, 24, 62, 44, 28, 52, 68, 38, 22, 46, 60, 32, 48, 20, 38, 54, 26,
    16, 32, 44, 20, 12,
];
</script>

<template>
    <div class="demo" :data-state="state">
        <div class="desktop">
            <div class="shell-bar" dir="ltr">
                <span class="activities" aria-hidden="true"><i></i><i></i></span>
                <span>09:41</span>
                <span class="shell-system">
                    <button
                        class="panel-demo"
                        :disabled="disabled"
                        :aria-label="labels.button"
                        @click="toggle"
                    >
                        <img :src="symbolic" width="17" height="17" alt="" />
                    </button>
                    <span aria-hidden="true">◔ &nbsp; ▰</span>
                </span>
            </div>
            <div class="wallpaper" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="note-window">
                <div class="window-title">
                    <span aria-hidden="true">☰</span>
                    <strong lang="en" dir="ltr">Speech to Text</strong>
                    <span class="window-close" aria-hidden="true">×</span>
                </div>
                <div class="note-body">
                    <p class="note-heading">{{ messages.heading }}</p>
                    <p class="transcript" :class="{ 'transcript-pending': playing }">
                        {{ messages.sample }}
                    </p>
                </div>
                <div class="note-status">
                    <span>{{ labels.status }}</span>
                </div>
            </div>
            <div class="recording-pill" aria-hidden="true">
                <span class="record-dot"></span><span>{{ labels.status }}</span>
                <div class="mini-wave">
                    <i
                        v-for="(height, index) in [12, 20, 9, 24, 16, 10, 20]"
                        :key="index"
                        :style="{ '--bar-height': `${height}px`, '--index': index }"
                    ></i>
                </div>
            </div>
            <div class="shortcut-hint" dir="ltr" aria-hidden="true">
                <kbd>Super</kbd><span>+</span><kbd>Z</kbd>
            </div>
        </div>
        <div class="demo-controls">
            <button class="demo-play" :disabled="disabled" @click="toggle">
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path v-if="autoplay && !reducedMotion" d="M8 5v14M16 5v14" />
                    <path v-else d="m9 5 11 7-11 7V5Z" />
                </svg>
                <span class="demo-button-label">
                    <span class="demo-button-reserve" aria-hidden="true">{{ messages.play }}</span>
                    <span class="demo-button-reserve" aria-hidden="true">{{ messages.again }}</span>
                    <span class="demo-button-reserve" aria-hidden="true">{{ messages.pause }}</span>
                    <span class="demo-button-reserve" aria-hidden="true">{{ messages.resume }}</span>
                    <span class="demo-button-reserve" aria-hidden="true">{{
                        messages.recording
                    }}</span>
                    <span class="demo-button-reserve" aria-hidden="true">{{
                        messages.transcribing
                    }}</span>
                    <span>{{ labels.button }}</span>
                </span>
            </button>
            <span class="demo-caption">{{ messages.caption }}</span>
        </div>
        <p class="sr-only" role="status" :aria-live="reducedMotion ? 'polite' : 'off'">
            {{ reducedMotion && state !== 'idle' ? labels.status : '' }}
        </p>
        <div class="voice-caption" aria-hidden="true">
            <div class="voice-wave">
                <i
                    v-for="(height, index) in bars"
                    :key="index"
                    :style="{ '--bar-height': `${height}px`, '--index': index }"
                ></i>
            </div>
        </div>
    </div>
</template>
