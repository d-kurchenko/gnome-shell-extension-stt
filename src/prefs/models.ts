import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {KEYS} from '../lib/const.js';
import {ModelCatalog} from '../openrouter/catalog.js';
import {ExtensionMetadata, OpenRouterClient} from '../openrouter/client.js';
import {describeError, ModelApi, ModelApiSetting} from '../openrouter/protocol.js';
import {watchSetting} from './reset.js';

const MODEL_APIS: ModelApiSetting[] = ['auto', 'transcription', 'chat'];
const RECOMMENDED_MODELS = new Set([
    'openai/whisper-large-v3-turbo',
    'microsoft/mai-transcribe-2',
    'x-ai/grok-stt-1.0',
    'google/gemini-2.5-flash-lite',
]);
type ModelGroup = 'recommended' | ModelApi;

function modelApiNames(): string[]
{
    return [_('Automatic'), _('Speech recognition'), _('LLM with audio')];
}

export class ModelPreferences
{
    #parent: Gtk.Widget;
    #settings: Gio.Settings;
    #client: OpenRouterClient;
    #catalog: ModelCatalog;
    #cancellable = new Gio.Cancellable();
    #ready: Promise<void>;
    #dialog: Adw.Dialog | null = null;
    #dialogCancellable: Gio.Cancellable | null = null;
    #row: Adw.ActionRow;
    #type: Gtk.Label;
    #link: Gtk.LinkButton;
    #reset: Gtk.Button;
    #search: Gtk.SearchEntry;
    #status: Gtk.Label;
    #refresh: Gtk.Button;
    #spinner: Gtk.Spinner;
    #groups: Map<ModelGroup, {box: Gtk.Box, list: Gtk.ListBox}>;

    constructor(parent: Gtk.Widget, settings: Gio.Settings, metadata: ExtensionMetadata, uuid: string)
    {
        this.#parent = parent;
        this.#settings = settings;
        this.#client = new OpenRouterClient(metadata);
        this.#catalog = new ModelCatalog(this.#client, uuid);
        this.#row = new Adw.ActionRow({title: _('Model'), use_markup: false});
        this.#type = new Gtk.Label({valign: Gtk.Align.CENTER});
        this.#type.add_css_class('dim-label');
        this.#row.add_suffix(this.#type);

        this.#link = new Gtk.LinkButton({
            icon_name: 'adw-external-link-symbolic',
            tooltip_text: _('View model on OpenRouter'),
            valign: Gtk.Align.CENTER,
        });
        this.#link.add_css_class('flat');
        this.#row.add_suffix(this.#link);

        this.#reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            tooltip_text: _('Reset to default'),
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        this.#reset.connect('clicked', () => {
            settings.reset(KEYS.MODEL_API);
            settings.reset(KEYS.MODEL);
        });
        this.#row.add_suffix(this.#reset);

        const choose = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            tooltip_text: _('Choose model'),
            valign: Gtk.Align.CENTER,
            has_frame: false,
        });
        choose.connect('clicked', () => this.#open());
        this.#row.add_suffix(choose);
        this.#row.activatable_widget = choose;

        watchSetting(settings, KEYS.MODEL, () => this.#sync(), this.#row);
        watchSetting(settings, KEYS.MODEL_API, () => this.#sync(), this.#row);
        parent.connect('unrealize', () => {
            this.#cancellable.cancel();
            this.#dialogCancellable?.cancel();
            this.#client.destroy();
        });

        this.#sync();
        this.#ready = this.#catalog.load(this.#cancellable).then(() => {
            if (!this.#cancellable.is_cancelled())
                this.#sync();
        }).catch(() => {});
    }

    addTo(group: Adw.PreferencesGroup): void
    {
        group.add(this.#row);
    }

    #sync(): void
    {
        const id = this.#settings.get_string(KEYS.MODEL).trim();
        const model = this.#catalog.find(id);
        const setting = this.#settings.get_string(KEYS.MODEL_API);
        const api = setting === 'auto' ? model?.apis[0] : setting;
        this.#row.subtitle = model && model.name !== id ? `${model.name}\n${id}` : id;
        this.#type.label = api === 'transcription' ? _('Speech recognition')
            : api === 'chat' ? _('LLM with audio') : _('Automatic');
        this.#link.uri = `https://openrouter.ai/${id.split('/').map(encodeURIComponent).join('/')}`;
        this.#link.sensitive = Boolean(id);
        this.#reset.sensitive = [KEYS.MODEL, KEYS.MODEL_API].some(key =>
            !this.#settings.get_value(key).equal(this.#settings.get_default_value(key))
        );
    }

    #open(): void
    {
        if (this.#dialog) {
            this.#dialog.present(this.#parent);
            return;
        }

        const dialog = new Adw.Dialog({title: _('Choose model'), content_width: 600, content_height: 650});
        const cancellable = new Gio.Cancellable();
        this.#dialog = dialog;
        this.#dialogCancellable = cancellable;

        const toolbar = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        this.#refresh = new Gtk.Button({icon_name: 'view-refresh-symbolic', tooltip_text: _('Refresh models')});
        this.#refresh.connect('clicked', () => void this.#load(cancellable, true));
        header.pack_start(this.#refresh);
        this.#spinner = new Gtk.Spinner();
        header.pack_start(this.#spinner);
        toolbar.add_top_bar(header);

        const searchBar = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL, spacing: 8,
            margin_top: 12, margin_bottom: 12, margin_start: 18, margin_end: 18,
        });
        this.#search = new Gtk.SearchEntry({placeholder_text: _('Search by name or model ID'), hexpand: true});
        this.#search.connect('search-changed', () => this.#render());
        searchBar.append(this.#search);

        this.#status = new Gtk.Label({wrap: true, xalign: 0, visible: false});
        this.#status.add_css_class('dim-label');
        searchBar.append(this.#status);
        toolbar.add_top_bar(searchBar);

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL, spacing: 18,
            margin_top: 6, margin_bottom: 12, margin_start: 18, margin_end: 18,
        });
        this.#groups = new Map();
        const headings: [ModelGroup, string][] = [
            ['recommended', _('Recommended')],
            ['transcription', _('Speech recognition')],
            ['chat', _('LLM with audio')],
        ];
        for (const [group, title] of headings) {
            const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
            const heading = new Gtk.Label({
                label: title, xalign: 0,
            });
            heading.add_css_class('heading');
            box.append(heading);
            const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});
            list.add_css_class('boxed-list');
            box.append(list);
            content.append(box);
            this.#groups.set(group, {box, list});
        }

        const manual = this.#manualEntry();
        manual.description = _('Speech recognition models return their own formatting. LLMs use the transcription instructions.');
        manual.margin_top = 12;
        manual.margin_bottom = 18;
        manual.margin_start = 18;
        manual.margin_end = 18;
        toolbar.add_bottom_bar(manual);

        const scroll = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.NEVER, child: content});
        toolbar.content = scroll;
        dialog.child = toolbar;
        dialog.connect('closed', () => {
            cancellable.cancel();
            this.#dialog = null;
            this.#dialogCancellable = null;
        });
        dialog.present(this.#parent);
        this.#search.grab_focus();
        void this.#load(cancellable);
    }

    #manualEntry(): Adw.PreferencesGroup
    {
        const group = new Adw.PreferencesGroup();
        const expand = new Adw.ExpanderRow({title: _('Enter a model ID manually')});
        const entry = new Adw.EntryRow({title: _('Model ID'), text: this.#settings.get_string(KEYS.MODEL)});
        const api = new Adw.ComboRow({
            title: _('Model type'), model: Gtk.StringList.new(modelApiNames()),
            selected: Math.max(0, MODEL_APIS.indexOf(this.#settings.get_string(KEYS.MODEL_API) as ModelApiSetting)),
        });
        const apply = new Gtk.Button({label: _('Use model'), valign: Gtk.Align.CENTER});
        apply.add_css_class('suggested-action');
        const validate = () => {
            apply.sensitive = /^[^/\s]+\/[^/\s]+$/.test(entry.text.trim());
        };
        entry.connect('notify::text', validate);
        validate();
        apply.connect('clicked', () => {
            this.#settings.set_string(KEYS.MODEL_API, MODEL_APIS[api.selected]);
            this.#settings.set_string(KEYS.MODEL, entry.text.trim());
            this.#dialog.close();
        });
        const action = new Adw.ActionRow({title: _('Use the OpenRouter ID, for example provider/model.')});
        action.add_suffix(apply);
        expand.add_row(entry);
        expand.add_row(api);
        expand.add_row(action);
        group.add(expand);
        return group;
    }

    #render(): void
    {
        const query = this.#search.text.trim().toLocaleLowerCase();
        const current = this.#settings.get_string(KEYS.MODEL).trim();
        const models = this.#catalog.models.filter(model =>
            `${model.name} ${model.id}`.toLocaleLowerCase().includes(query)
        );

        for (const [group, {box, list}] of this.#groups) {
            while (list.get_first_child())
                list.remove(list.get_first_child());

            const matches = models.filter(model => RECOMMENDED_MODELS.has(model.id)
                ? group === 'recommended'
                : model.apis[0] === group);
            box.visible = matches.length > 0;
            for (const model of matches) {
                const row = new Adw.ActionRow({
                    title: model.name, subtitle: model.id, use_markup: false,
                    title_lines: 1, subtitle_lines: 1, activatable: true,
                });
                if (model.id === current)
                    row.add_suffix(new Gtk.Image({icon_name: 'object-select-symbolic'}));

                row.connect('activated', () => {
                    this.#settings.set_string(KEYS.MODEL_API, 'auto');
                    this.#settings.set_string(KEYS.MODEL, model.id);
                    this.#dialog.close();
                });
                list.append(row);
            }
        }

        this.#status.label = models.length ? '' : query ? _('No matching models.') : _('No models loaded. Refresh the list or enter a model ID manually.');
        this.#status.visible = Boolean(this.#status.label);
    }

    async #load(cancellable: Gio.Cancellable, force = false): Promise<void>
    {
        this.#refresh.sensitive = false;
        this.#spinner.start();
        try {
            await this.#ready;
            if (cancellable.is_cancelled())
                return;

            this.#render();
            if (force || this.#catalog.stale) {
                this.#status.label = _('Loading models…');
                this.#status.visible = true;
                await this.#catalog.refresh(this.#settings.get_string(KEYS.API_KEY).trim(), cancellable);
                if (cancellable.is_cancelled())
                    return;

                this.#sync();
                this.#render();
            }
        } catch (error) {
            if (!cancellable.is_cancelled()) {
                this.#status.label = describeError(error, _);
                this.#status.visible = true;
            }
        } finally {
            if (!cancellable.is_cancelled()) {
                this.#refresh.sensitive = true;
                this.#spinner.stop();
            }
        }
    }
}
