const ALLOWED_VIEWS = new Set(["indice", "config", "detalle"]);

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_KEY;
  if (!scriptUrl || !secret) {
    return res.status(500).json({ error: "Falta configurar el servicio de catálogo" });
  }

  let upstream;
  try {
    upstream = new URL(scriptUrl);
  } catch (_) {
    return res.status(500).json({ error: "La URL del servicio no es válida" });
  }

  if (upstream.protocol !== "https:" || upstream.hostname !== "script.google.com" || !upstream.pathname.endsWith("/exec")) {
    return res.status(500).json({ error: "La URL de Apps Script no es válida" });
  }

  const query = req.query || {};
  const vista = String(query.vista || "").toLowerCase();
  if (!ALLOWED_VIEWS.has(vista)) {
    return res.status(400).json({ error: "Consulta no permitida" });
  }

  const destino = new URL(upstream.toString());
  destino.searchParams.set("key", secret);
  destino.searchParams.set("vista", vista);

  if (vista === "detalle") {
    const id = String(query.id || "").trim();
    const categoria = String(query.categoria || "").trim();
    if (!/^\d{1,20}$/.test(id) || !/^[a-zA-Z0-9_-]{1,30}$/.test(categoria)) {
      return res.status(400).json({ error: "Identificador o categoría no válidos" });
    }
    destino.searchParams.set("id", id);
    destino.searchParams.set("categoria", categoria);
  }

  try {
    const respuesta = await fetch(destino.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" }
    });
    const texto = await respuesta.text();

    if (!respuesta.ok) {
      return res.status(502).json({ error: "No se pudo consultar el catálogo" });
    }

    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (_) {
      return res.status(502).json({ error: "Apps Script no devolvió JSON válido" });
    }

    return res.status(200).json(datos);
  } catch (error) {
    console.error("Error consultando Apps Script:", error);
    return res.status(502).json({ error: "Error de conexión con el catálogo" });
  }
};
