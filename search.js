// Cloudflare Pages Function at /api/search
export async function onRequest(context) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (context.request.method === "OPTIONS") {
    return new Response("", { headers: cors });
  }
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const body = await context.request.json();
    const incoming = body?.criteria || {};

    // Map frontend fields to NIH schema
    const criteria = { ...incoming };
    if (criteria.text_search) {
      criteria.advanced_text_search = {
        operator: "and",
        search_field: "projecttitle,terms,abstracttext",
        search_text: String(criteria.text_search)
      };
      delete criteria.text_search;
      delete criteria.text;
    }

    const limit  = Math.min(Math.max(body?.limit ?? 25, 1), 100);
    const offset = Math.max(body?.offset ?? 0, 0);

    const payload = {
      criteria,
      sort_field: body?.sort_field ?? "project_start_date",
      sort_order: body?.sort_order ?? "desc",
      offset,
      limit
    };

    const res  = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "bad request" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
}
