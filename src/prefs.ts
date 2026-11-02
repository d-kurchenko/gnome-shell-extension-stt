/**
 * Preferences entry point.
 */

import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createPage} from './prefs/page.js';

export default class SpeechToTextPreferences extends ExtensionPreferences
{
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>
    {
        window.add(createPage(this.getSettings(), this.metadata, this.uuid, this.path));
    }
}
