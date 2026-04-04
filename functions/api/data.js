export async function onRequestGet({ env }) {
  try {
    const row = await env.asset_tracker_db.prepare(
      'SELECT value FROM kv WHERE key = ?'
    ).bind('asset-tracker-data').first()
    return Response.json({ value: row?.value ?? null })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { value } = await request.json()
    await env.asset_tracker_db.prepare(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)'
    ).bind('asset-tracker-data', value).run()
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function onRequestDelete({ env }) {
  try {
    await env.asset_tracker_db.prepare('DELETE FROM kv WHERE key = ?')
      .bind('asset-tracker-data').run()
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
