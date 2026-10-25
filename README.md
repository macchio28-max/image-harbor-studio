# Image Harbor Studio

Crea l'applicazione "LoMa VIEWER" seguendo fedelmente il design e le immagini allegate:

1. **Brand e Logo**: Usa il logo allegato ("LoMa VIEWER") come favicon, icona PWA e nell'angolo in alto a sinistra della barra superiore.
2. **Layout fedele allo screenshot allegato**:
   - Tema scuro professionale in stile macOS/desktop (sfondo scuro profondo, finiture pulite).
   - **Barra superiore (Toolbar)**:
     - Logo e titolo LoMa VIEWER.
     - Controlli principali: Salva, Seleziona, Sposta, Zoom -, Zoom +, 1:1, 1:2, 1:3, Fit, Confronta (split-view o affiancato), Strumenti (crop, rotazione, regolazioni luce/colore), Screenshot (cattura a risoluzione nativa del monitor/display dell'utente, perfetto per Samsung Galaxy Tab S8 Ultra e monitor ad alta risoluzione), Senza metadati (Deep Clean: pulizia totale di EXIF, IPTC, XMP, C2PA, e chunk parametri AI di ChatGPT, DALL-E, Midjourney, Photoshop, Topaz).
     - Sezione AI esterne: icone e trigger per ChatGPT, Meta AI, Gemini, Flow.
     - Sezione Programmi esterni: Topaz Photo AI, Topaz Gigapixel AI (con pannello impostazioni per configurare i percorsi o aprire/esportare).
     - Sezione Cloud & Condivisione: Google Drive, OneDrive, iCloud, Mail, WhatsApp, AirDrop, LocalSend (utilizzando la Web Share API su dispositivi supportati).
   - **Area centrale (Canvas / Image Viewer)**:
     - Stato iniziale vuoto fedele allo screenshot: icona a schede di immagini, scritta "Nessuna immagine caricata", "Apri un'immagine o trascinala qui per visualizzarla in LoMa Viewer", e pulsante blu "Apri immagine...".
     - Supporto drag & drop completo di file immagine (JPEG, PNG, WebP, AVIF, GIF, SVG, BMP, TIFF, RAW).
     - Quando un'immagine è caricata: navigazione fluida con pan (spostamento), zoom con rotellina o pinch-to-zoom per tablet, pulsanti zoom rapido (1:1 al 100% pixel reali, 1:2, 1:3, Fit a schermo intero).
   - **Pannello laterale destro (Informazioni & Metadati)**:
     - Scheda "Informazioni immagine" con miniatura e riepilogo.
     - Scheda "Dati di scatto (EXIF)": Fotocamera, Obiettivo, Lunghezza focale, Tempo di esposizione, Diaframma, ISO, Compensazione exp., Modalità di scatto, Modalità misurazione, Bilanciamento bianco, Flash (estratti realmente dai metadati del file caricato tramite parser EXIF client-side).
     - Scheda "Posizione (GPS)": Latitudine, Longitudine, Località e riquadro mappa interattiva/placeholder quando presenti coordinate.
     - Scheda "Dettagli file": Nome file, Formato, Dimensione, Risoluzione (L x A), Spazio colore, Profilo colore, Data e ora.
3. **Funzionalità chiave**:
   - **Deep Clean Metadati**: rimozione fisica e totale di EXIF e firme AI riscrivendo i pixel su canvas vergine al download/esportazione.
   - **Screenshot a risoluzione nativa display**: calcolo di `window.screen.width * window.devicePixelRatio` e cattura pixel-perfect senza UI.
   - **PWA offline**: installabile su tablet (Galaxy Tab S8 Ultra) e computer, funzionante al 100% offline.
   - **Predisposizione desktop Electron**: configurazione per compilazione .exe Windows e .dmg Mac.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://image-harbor-studio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2278fcc4-764e-426c-aed1-58606155f133).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
