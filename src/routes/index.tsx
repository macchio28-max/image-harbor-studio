import { createFileRoute } from "@tanstack/react-router";
import { LomaViewer } from "@/components/loma/LomaViewer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LoMa VIEWER — Visualizzatore immagini e metadati" },
      { name: "description", content: "Visualizza foto, leggi EXIF e GPS, rimuovi i metadati e le firme AI. Funziona offline." },
      { property: "og:title", content: "LoMa VIEWER" },
      { property: "og:description", content: "Visualizzatore immagini professionale con Deep Clean dei metadati." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LomaViewer,
});
