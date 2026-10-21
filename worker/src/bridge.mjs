export function createBridgeClient(baseUrl, token, workerId) {
  let active
  async function call(body) {
    const response = await fetch(new URL('/api/worker', baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, workerId }), signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `Worker request failed (${response.status})`)
    return data
  }
  return {
    async rpc() {
      try { active = await call({ action: 'claim' }); return { data: active.job ? [active.job] : [], error: null } }
      catch (error) { return { data: null, error } }
    },
    from(table) { return { update(values) { return { async eq(column, id) {
      try { await call({ action: 'update', table, id, values, jobId: active?.job?.job_id }); return { error: null } }
      catch (error) { return { error } }
    } } } } },
    storage: { from() { return {
      async download(path) {
        try {
          const source = active?.sources.find(source => source.path === path)
          if (!source) throw new Error('Source is not part of this job')
          const response = await fetch(source.url, { signal: AbortSignal.timeout(120000) })
          if (!response.ok) throw new Error('Source download failed')
          return { data: await response.blob(), error: null }
        } catch (error) { return { data: null, error } }
      },
      async upload(path, bytes, options) {
        try {
          const target = active?.uploads.find(target => target.path === path)
          if (!target) throw new Error('Output is not part of this job')
          const response = await fetch(target.url, { method: 'PUT', headers: { 'content-type': options.contentType, 'x-upsert': 'true' }, body: bytes, signal: AbortSignal.timeout(120000) })
          if (!response.ok) throw new Error(`Output upload failed (${response.status})`)
          return { error: null }
        } catch (error) { return { error } }
      },
    } } },
  }
}
