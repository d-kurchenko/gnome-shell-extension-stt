import en from './messages/en.json';
import ar from './messages/ar.json';
import bg from './messages/bg.json';
import ca from './messages/ca.json';
import cs from './messages/cs.json';
import de from './messages/de.json';
import el from './messages/el.json';
import es from './messages/es.json';
import eu from './messages/eu.json';
import fa from './messages/fa.json';
import fi from './messages/fi.json';
import fr from './messages/fr.json';
import hu from './messages/hu.json';
import it from './messages/it.json';
import ja from './messages/ja.json';
import kn from './messages/kn.json';
import ko from './messages/ko.json';
import nl from './messages/nl.json';
import oc from './messages/oc.json';
import pl from './messages/pl.json';
import ptBR from './messages/pt-BR.json';
import ru from './messages/ru.json';
import sk from './messages/sk.json';
import tr from './messages/tr.json';
import uk from './messages/uk.json';
import zhCN from './messages/zh-CN.json';
import { locales, type Locale } from './locales';

export type Messages = typeof en;
export type DemoMessages = Messages['demo'];

// Every dictionary must implement the complete English message contract.
// This module is only used during static generation, not imported by the Vue island.
const dictionaries = {
    ar,
    bg,
    ca,
    cs,
    de,
    el,
    en,
    es,
    eu,
    fa,
    fi,
    fr,
    hu,
    it,
    ja,
    kn,
    ko,
    nl,
    oc,
    pl,
    'pt-BR': ptBR,
    ru,
    sk,
    tr,
    uk,
    'zh-CN': zhCN,
} satisfies Record<Locale, Messages>;

export function getMessages(locale: Locale): Messages {
    const dictionary = dictionaries[locale];
    if (!dictionary) throw new Error(`Missing website translation: ${locale}`);
    return dictionary;
}

export function formatVersions(text: string, versions: readonly string[]): string {
    return text.replace('{versions}', versions.join(', '));
}

export { locales };
export type { Locale };
