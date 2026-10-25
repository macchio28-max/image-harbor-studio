// Provenance & AI-trace analysis from file bytes + parsed metadata (exifr).
export type Level = "none" | "partial" | "ai";
export type Finding = { engine: string; signature: string; details: [string, string][] };
export type Provenance = { level: Level; findings: Finding[] };

const GENERATORS: [RegExp, string][] = [
  [/midjourney/i, "Midjourney"],
  [/dall[·.\-\s]?e\s*3/i, "OpenAI DALL·E 3"],
  [/dall[·.\-\s]?e/i, "OpenAI DALL·E"],
  [/gpt-4o|openai|chatgpt|sora/i, "OpenAI (ChatGPT / Sora)"],
  [/comfyui/i, "Stable Diffusion / ComfyUI"],
  [/automatic1111|stable[\s-]?diffusion|sdxl|\bflux\b/i, "Stable Diffusion"],
  [/fooocus/i, "Stable Diffusion / Fooocus"],
  [/invokeai/i, "Stable Diffusion / InvokeAI"],
  [/novelai/i, "NovelAI"],
  [/firefly|generative\s*(fill|expand)/i, "Adobe Firefly / Generative AI"],
  [/microsoft\s*designer|bing\s*image\s*creator/i, "Microsoft Designer / Bing"],
  [/synthid|imagen|gemini|google\s*ai/i, "Google Imagen / SynthID"],
  [/leonardo\.?ai/i, "Leonardo.Ai"],
  [/ideogram/i, "Ideogram"],
  [/runway/i, "Runway"],
  [/meta\s*ai|imagine\s*with\s*meta/i, "Meta AI"],
];
const EDITORS = /photoshop|lightroom|capture one|gimp|affinity|luminar|topaz|pixelmator|snapseed|darktable/i;
const AUTH = /truepic|leica|nikon|sony|canon/i;

const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

export function parseA1111(text: string): [string, string][] {
  const out: [string, string][] = [];
  const neg = text.indexOf("Negative prompt:");
  const st = text.search(/\n?Steps:\s*\d+/);
  const prompt = text.slice(0, neg >= 0 ? neg : st >= 0 ? st : text.length).trim();
  if (prompt) out.push(["Prompt", clip(prompt)]);
  if (neg >= 0) out.push(["Prompt negativo", clip(text.slice(neg + 16, st > neg ? st : undefined).trim())]);
  if (st >= 0) {
    for (const k of ["Steps", "Sampler", "CFG scale", "Seed", "Size", "Model", "Model hash"]) {
      const m = text.slice(st).match(new RegExp(`${k}:\\s*([^,\\n]+)`));
      if (m) out.push([k === "Steps" ? "Step" : k, m[1]!.trim()]);
    }
  }
  return out;
}

export type TextChunk = { key: string; text: string };

export function pngTextChunks(b: Uint8Array): { chunks: TextChunk[]; c2pa: boolean } {
  const chunks: TextChunk[] = [];
  let c2pa = false;
  if (b.length < 8 || b[0] !== 0x89 || b[1] !== 0x50) return { chunks, c2pa };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const dec = new TextDecoder("latin1"), u8 = new TextDecoder("utf-8");
  let p = 8;
  while (p + 8 <= b.length) {
    const len = dv.getUint32(p), type = dec.decode(b.subarray(p + 4, p + 8));
    const data = b.subarray(p + 8, Math.min(b.length, p + 8 + len));
    if (type === "caBX") c2pa = true;
    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      const z = data.indexOf(0);
      const key = dec.decode(data.subarray(0, z));
      let text = "";
      if (type === "tEXt") text = dec.decode(data.subarray(z + 1));
      else if (type === "iTXt" && data[z + 1] === 0) {
        let q = z + 3; q = data.indexOf(0, q) + 1; q = data.indexOf(0, q) + 1;
        text = u8.decode(data.subarray(q));
      } else text = "(compresso)";
      chunks.push({ key, text });
    }
    if (type === "IEND") break;
    p += 12 + len;
  }
  return { chunks, c2pa };
}

export function analyze(bytes: Uint8Array, metaIn: Record<string, any>): Provenance {
  const meta: any = metaIn;
  const findings: Finding[] = [];
  let level: Level = "none";
  const bump = (l: Level) => { if (l === "ai" || (l === "partial" && level === "none")) level = l; };
  const raw = new TextDecoder("latin1").decode(bytes);

  // PNG chunks
  const { chunks, c2pa: pngC2pa } = pngTextChunks(bytes);
  for (const c of chunks) {
    const k = c.key.toLowerCase();
    if (k === "parameters") {
      findings.push({ engine: /comfy/i.test(c.text) ? "Stable Diffusion / ComfyUI" : "Stable Diffusion (A1111 / Forge)", signature: "Chunk PNG parameters", details: parseA1111(c.text) });
      bump("ai");
    } else if (k === "prompt" || k === "workflow") {
      findings.push({ engine: "Stable Diffusion / ComfyUI", signature: `Chunk PNG ${c.key}`, details: [["Contenuto", clip(c.text, 400)]] });
      bump("ai");
    } else if (["generation_data", "invokeai_metadata", "sd-metadata", "dream", "fooocus_scheme"].includes(k)) {
      findings.push({ engine: GENERATORS.find(([r]) => r.test(c.text + k))?.[1] ?? "Generatore AI", signature: `Chunk PNG ${c.key}`, details: [["Contenuto", clip(c.text, 400)]] });
      bump("ai");
    } else {
      const g = GENERATORS.find(([r]) => r.test(c.text));
      if (g) { findings.push({ engine: g[1], signature: `Chunk PNG ${c.key}`, details: [["Valore", clip(c.text, 300)]] }); bump("ai"); }
    }
  }

  // C2PA / JUMBF
  const hasC2pa = pngC2pa || /c2pa|jumb[\s\S]{0,40}jumd/i.test(raw);
  if (hasC2pa) {
    const gen = raw.match(/claim_generator[^A-Za-z0-9]{0,8}([\x20-\x7e]{3,80})/);
    const signer = raw.match(/(?:CN=|issuer[^A-Za-z]{0,6})([\x20-\x7e]{3,60})/);
    const aiAssert = /trainedAlgorithmicMedia|c2pa\.ai|ai_generat|generative/i.test(raw);
    const blob = (gen?.[1] ?? "") + " " + raw.slice(0, 0);
    const eng = GENERATORS.find(([r]) => r.test(blob) || r.test(signer?.[1] ?? ""))?.[1];
    const details: [string, string][] = [];
    if (gen) details.push(["Claim generator", gen[1]!.trim()]);
    if (signer) details.push(["Firmatario", signer[1]!.trim()]);
    details.push(["Asserzione AI", aiAssert ? "Presente" : "Non trovata"]);
    findings.push({ engine: eng ?? (AUTH.test(blob + (signer?.[1] ?? "")) ? "Autenticità fotocamera (C2PA)" : "C2PA Content Credentials"), signature: "C2PA Manifest (JUMBF)", details });
    bump(aiAssert || eng ? "ai" : "partial");
  }

  // XMP IPTC Digital Source Type
  const dst = raw.match(/DigitalSourceType[^a-zA-Z]{0,4}[^"<>]*?(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)/);
  if (dst) {
    const composite = dst[1]!.startsWith("composite");
    findings.push({ engine: "Contenuto AI dichiarato (IPTC)", signature: "Tag XMP Generative", details: [["DigitalSourceType", dst[1]!], ["Significato", composite ? "Foto modificata con AI" : "Generata da AI"]] });
    bump("ai");
  }

  // EXIF / XMP text fields
  const fields: [string, unknown][] = [
    ["Software", meta.Software], ["Creator Tool", meta.CreatorTool], ["Processing Software", meta.ProcessingSoftware],
    ["Artist", meta.Artist], ["Make", meta.Make], ["ImageDescription", meta.ImageDescription],
    ["UserComment", typeof meta.UserComment === "string" ? meta.UserComment : meta.UserComment instanceof Uint8Array ? new TextDecoder().decode(meta.UserComment).replace(/^(ASCII|UNICODE)\0*/, "") : undefined],
    ["Description", typeof meta.description === "string" ? meta.description : meta.description?.value],
  ];
  let editor: string | null = null;
  for (const [k, v] of fields) {
    if (!v || typeof v !== "string") continue;
    if (/Steps:\s*\d+.*Sampler:/s.test(v)) {
      findings.push({ engine: "Stable Diffusion", signature: "Prompt di generazione incorporato", details: [["Campo", k], ...parseA1111(v)] });
      bump("ai"); continue;
    }
    const g = GENERATORS.find(([r]) => r.test(v));
    if (g && !findings.some((f) => f.engine === g[1])) {
      findings.push({ engine: g[1], signature: `Tag ${k}`, details: [[k, clip(v, 300)]] });
      bump("ai");
    } else if (!editor && EDITORS.test(v) && (k === "Software" || k === "Creator Tool" || k === "Processing Software")) editor = v;
  }
  // Midjourney / generic byte signatures not caught above
  if (!findings.length) {
    const g = GENERATORS.slice(0, 9).find(([r]) => r.test(raw.slice(0, 200000)));
    if (g) { findings.push({ engine: g[1], signature: "Firma testuale nel file", details: [] }); bump("ai"); }
  }
  if (editor && level === "none") {
    findings.push({ engine: editor, signature: "Software di elaborazione", details: [["Nota", "Elaborata con un editor: non indica AI di per sé"]] });
    bump("partial");
  }
  return { level, findings };
}
