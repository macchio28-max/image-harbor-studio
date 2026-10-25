# LoMa VIEWER - Correzioni toolbar, Strumenti, Confronta, app esterne

## 1. Zoom
- 1:1 = 100%, 1:2 = 200%, 1:3 = 300% (oggi sono invertiti come riduzioni).

## 2. Pannello Strumenti (lato sinistro)
L'icona "Strumenti" apre/chiude un pannello a sinistra, stile Capture One, con sezioni espandibili che modificano davvero l'immagine in tempo reale:
- Istogramma (RGB live)
- Bilanciamento bianco: Kelvin, Tinta
- Esposizione: Esposizione, Contrasto, Luminosita, Saturazione
- High Dynamic Range: Alte luci, Ombre, Bianchi, Neri
- Chiarezza, Dehaze
- Vignettatura: Quantita, Metodo
- Ritaglio, Bilanciamento colore, Editor colore (tonalita/saturazione per canale)
- Nitidezza, Riduzione rumore
- Ogni sezione con pulsante reset; reset globale; Salva/Esporta applica le modifiche (sempre con rimozione metadati gia esistente).

## 3. Confronta = due foto diverse
- Due riquadri affiancati "Immagine 1" / "Immagine 2" come nello screenshot, ciascuno con propria apertura file / trascinamento, chiusura (X), zoom e schermo intero indipendenti, divisore centrale trascinabile.
- Il pannello info a destra mostra i dati della foto selezionata.

## 4. Icone
- Sostituite con le icone caricate (ChatGPT, Meta AI, Gemini, Topaz Photo AI, Topaz Gigapixel, Photoshop, Lightroom, Drive, iCloud, OneDrive, Mail, WhatsApp, LocalSend, ecc.).
- Ripristino di Photoshop e Lightroom (oggi mostrano per errore l'icona "percorsi").

## 5. Apertura delle app installate
Limite importante: una pagina web/PWA non puo avviare un programma dal suo percorso sul disco. Lo puo fare solo la versione desktop (Electron).
- Versione desktop (Windows/Mac): al primo clic su ChatGPT, Gemini, Meta AI, Topaz Photo AI, Topaz Gigapixel, Photoshop, Lightroom, WhatsApp, LocalSend, la app chiede di selezionare il programma; il percorso viene ricordato tra le sessioni, modificabile dall'utente (clic destro / impostazioni), e richiesto di nuovo se il programma non si trova piu. L'immagine corrente viene passata al programma.
- Versione tablet/browser: si usano i collegamenti diretti alle app dove esistono (es. WhatsApp, Lightroom/Photoshop mobile, ChatGPT, Gemini) e la condivisione nativa del sistema (Android/iPad) per inviare la foto alla app scelta, incluso LocalSend. Nessun rimando ai siti web.

## 6. Cloud (Drive, iCloud, OneDrive) = caricare
- Clic: si apre la pagina del servizio, l'utente accede, sceglie la cartella e la foto viene salvata li.
- Drive e OneDrive: selettore cartelle ufficiale dentro la app + caricamento diretto (richiede la registrazione di un'app Google e Microsoft; vi chiedero i codici).
- iCloud non offre un sistema di caricamento esterno: la foto viene preparata e si apre iCloud Drive per il trascinamento (o condivisione nativa su iPad/Mac).

## 7. Mail
- Menu di scelta: "Mail di sistema" (client predefinito) oppure Gmail, Outlook o altra app di posta (desktop: elenco app selezionabili con percorso memorizzato; tablet: condivisione nativa).

## Dettagli tecnici
- Electron: preload con contextBridge per `pickApp`, `launchApp(path, file)` via `child_process.spawn`/`shell.openPath`, percorsi salvati in `userData/apps.json`, controllo esistenza a ogni avvio.
- Browser: `navigator.share({files})`, URL scheme (`whatsapp://`, ecc.) con fallback alla condivisione.
- Filtri: pipeline canvas/WebGL non distruttiva, stato regolazioni per immagine.
- Drive: Google Picker + Drive API; OneDrive: File Picker v8. Client ID pubblici in config.
- Icone caricate come asset CDN.
