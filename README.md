# Speech to Text

**Speak. Stop. Done.** — Turn speech into text right inside GNOME, without leaving the app you’re in.

Speech to Text is a GNOME Shell extension that listens through your microphone, sends the audio to your favourite speech-capable models via **[OpenRouter](https://openrouter.ai/)**, and drops the transcript where your cursor already is — clipboard and paste in one smooth motion.

---

## Why you’ll like it

- **Stays out of your way** — A calm panel indicator (optional): tap to talk, tap again when you’re finished.
- **Hands on the keyboard** — Global shortcut to start and stop recording is **on by default** (**Super+z**). Turn it off or change the binding under **Keyboard shortcut** in preferences if you prefer.
- **Panel layout you control** — Choose **tray horizontal alignment** (left, center, or right section of the top bar) and fine-tune **icon order** within that section with the **− / +** stepper.
- **Paste where you type** — Text goes into the focused field (editors, browsers, chat apps, terminals) — not only into the clipboard.
- **Your keys, your models** — Bring your own OpenRouter API key and pick any transcription-ready model the provider exposes.
- **Sounds you can feel** — Gentle start/stop cues so you always know whether the mic is live.
- **Tuned to you** — Temperature, timeouts, “no speech” behaviour, icon visibility, tray alignment, icon position, cue volume, and shortcuts — all in a clean preferences window.

---

## How it works

1. **Start** — Click the panel icon or press your shortcut. The extension begins capturing speech from the microphone.
2. **Stop** — Click again (or shortcut). Your audio is sent securely to OpenRouter for transcription.
3. **Receive** — The returned text is copied and pasted into whatever window already has focus — ready to edit or send.

No separate dictation window. No context switch. Just flow.

---

## Perfect for

- Quick replies in chat or email  
- Drafting notes or code comments  
- Capturing ideas before they slip away  
- Anyone who thinks faster than they type on a laptop with a mic  

---

## Trust & transparency

- Transcription runs through **OpenRouter** over HTTPS — only when **you** stop a recording, and only with **your** API key from settings.  
- The extension writes **your transcript** to the clipboard to make pasting reliable; it does not harvest unrelated clipboard history.  
- Open source under **GPL-2.0-or-later** — inspect the code, suggest improvements, or fork for your team.

---

## Get it

Install from **[extensions.gnome.org](https://extensions.gnome.org/)** when the listing is live, or follow your distro’s usual GNOME extension workflow from this repository’s releases.

*Requires a modern GNOME Shell environment and an OpenRouter account with an API key. Microphone access is used only while you are recording.*
