// Imported into the generated service worker. Handles Android "Share to LoMa VIEWER".
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || !url.searchParams.has("share-target")) return;
  event.respondWith(
    (async () => {
      try {
        const data = await event.request.formData();
        const files = data.getAll("images").filter((f) => f && typeof f === "object");
        const cache = await caches.open("loma-share-target");
        for (const k of await cache.keys()) await cache.delete(k);
        let i = 0;
        for (const f of files) {
          await cache.put(
            new Request(`/__shared/${Date.now()}-${i++}`),
            new Response(f, {
              headers: {
                "content-type": f.type || "application/octet-stream",
                "x-file-name": encodeURIComponent(f.name || `condivisa-${i}.jpg`),
              },
            }),
          );
        }
      } catch (e) {
        console.warn("share-target failed", e);
      }
      return Response.redirect("/?shared=1", 303);
    })(),
  );
});
