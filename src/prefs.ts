/**
 * Preferences window entry point.
 */

import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {fillPage} from './prefs/page.js';

export default class SpeechToTextPreferences extends ExtensionPreferences
{
    async fillPreferencesWindow(window: Adw.PreferencesWindow)
    {
        fillPage(window, this.getSettings());
    }
}
