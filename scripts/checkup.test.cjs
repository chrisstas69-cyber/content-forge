const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const module = {exports:{}}
  new Function('require','module','exports',source)(name => name in mocks ? mocks[name] : require(name), module, module.exports)
  return module.exports
}
const NextResponse = class extends Response {static json(data, options){return Response.json(data,options)}}
async function main(){
  let reads=0
  const download=load('src/app/api/download/route.ts',{'next/server':{NextResponse},fs:{promises:{readFile:async()=>{reads++;return Buffer.from('guide')}}}})
  for(const file of ['../.env','../../package.json','../private.docx','test.txt']){
    const result=await download.GET({nextUrl:new URL('http://localhost/api/download?file='+encodeURIComponent(file))})
    assert.equal(result.status,400)
  }
  assert.equal(reads,0)
  assert.equal((await download.GET({nextUrl:new URL('http://localhost/api/download?file=guide.docx')})).status,200)
  assert.equal(reads,1)
  let password
  const actions=load('src/app/auth/actions.ts',{'next/headers':{headers:async()=>new Headers({host:'localhost:3000'})},'next/navigation':{redirect:()=>{throw new Error('redirect')}},'@/lib/supabase/server':{createClient:async()=>({auth:{signInWithPassword:async input=>{password=input.password;return {}},signUp:async input=>{password=input.password;return {}}}})}})
  for(const action of [actions.login,actions.signup]){
    const data=new FormData();data.set('email',' person@example.com ');data.set('password',' secret password ')
    await assert.rejects(action(data),/redirect/)
    assert.equal(password,' secret password ')
  }
  const envNames=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','ENCRYPTION_KEY','CONTENT_WORKER_URL']
  const before=Object.fromEntries(envNames.map(key=>[key,process.env[key]]))
  const originalFetch=global.fetch
  try{
    for(const key of envNames)process.env[key]='configured'
    const health=load('src/app/api/dashboard/health/route.ts',{'next/server':{NextResponse},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'test-user'}}})},from:()=>({select:()=>({limit:async()=>({error:null})})}),storage:{from:()=>({list:async()=>({error:null})})}})}})
    delete process.env.CONTENT_WORKER_URL
    assert.equal((await health.GET()).status,503)
    process.env.CONTENT_WORKER_URL='https://worker.example'
    global.fetch=async()=>Response.json({ok:true})
    assert.equal((await health.GET()).status,200)
    global.fetch=async()=>{throw new Error('unreachable')}
    assert.equal((await health.GET()).status,503)
    global.fetch=async()=>Response.json({ok:false})
    assert.equal((await health.GET()).status,503)
  }finally{global.fetch=originalFetch;for(const key of envNames){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}}
  const originalMetricsFetch=global.fetch
  let existingId=null, cacheWrite
  const analytics=load('src/lib/analytics.ts',{'@/lib/secrets':{},'@/lib/db':{db:{post:{findMany:async()=>[{id:'post-1',videoId:'video-1',platform:'youtube',platformPostId:'remote-1',account:{accessToken:'test-token'}}]},analyticsCache:{findFirst:async()=>existingId?{id:existingId}:null,upsert:async input=>{cacheWrite=input}}}}})
  try{
    global.fetch=async()=>Response.json({items:[{statistics:{viewCount:'42',likeCount:'3',commentCount:'1'}}]})
    assert.deepEqual(await analytics.refreshAnalytics(),{refreshed:1,failed:0})
    assert.deepEqual(cacheWrite.where,{id:'post:post-1'})
    assert.equal(cacheWrite.create.id,'post:post-1')
    existingId='legacy-cache-id'
    assert.deepEqual(await analytics.refreshAnalytics(),{refreshed:1,failed:0})
    assert.deepEqual(cacheWrite.where,{id:'legacy-cache-id'})
  }finally{global.fetch=originalMetricsFetch}
  console.log('PASS: analytics uses unique cache IDs and updates existing cache rows.')
  const savedEnv={...process.env}
  try{
    process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key'
    process.env.CRON_SECRET='test-cron-secret'
    delete process.env.TEST_MODE_ENABLED
    NextResponse.next=()=>new Response(null,{status:200})
    NextResponse.redirect=url=>new Response(null,{status:307,headers:{location:String(url)}})
    const proxy=load('src/proxy.ts',{'next/server':{NextResponse},'@supabase/ssr':{createServerClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})}}).proxy
    const request=(pathname,token,method='GET')=>({method,nextUrl:new URL('https://app.example'+pathname),url:'https://app.example'+pathname,headers:new Headers(token?{authorization:'Bearer '+token}:{}),cookies:{getAll:()=>[]}})
    for(const pathname of ['/api/events','/api/comments','/api/trends/refresh','/api/analytics/refresh']) assert.equal((await proxy(request(pathname))).status,401)
    assert.equal((await proxy(request('/api/analytics/refresh','test-cron-secret'))).status,200)
    assert.equal((await proxy(request('/api/analytics/refresh','wrong-secret'))).status,401)
    assert.equal((await proxy(request('/api/secrets','test-cron-secret'))).status,401)
    assert.equal((await proxy(request('/api/comments','test-cron-secret','POST'))).status,401)
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    assert.equal((await proxy(request('/api/videos'))).status,503)
    process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key'
    process.env.CONTENT_WORKER_TOKEN='test-worker-token'
    process.env.VERCEL_ENV='preview'
    process.env.TEST_MODE_ENABLED='true'
    const jobId='11111111-1111-4111-8111-111111111111', itemId='22222222-2222-4222-8222-222222222222'
    const dbJob={id:jobId,content_item_id:itemId,status:'running',locked_by:'test-worker'}
    let writes=0
    const worker=load('src/app/api/worker/route.ts',{'next/server':{NextResponse},'@supabase/supabase-js':{createClient:()=>({rpc:async()=>({data:[],error:null}),from:table=>({select:()=>({eq:()=>({single:async()=>({data:table==='processing_jobs'?dbJob:{user_id:'user',workspace_id:'workspace'}})})}),update:()=>({eq:async()=>{writes++;return {error:null}}})})})}}).POST
    const workerRequest=(body,token='test-worker-token')=>new Request('https://app.example/api/worker',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})
    const update={action:'update',workerId:'test-worker',jobId,table:'content_items',id:itemId,values:{progress:30}}
    assert.equal((await worker(workerRequest({action:'claim',workerId:'test-worker'}))).status,200)
    assert.equal((await worker(workerRequest(update,'wrong-token'))).status,401)
    assert.equal((await worker(workerRequest({...update,workerId:'another-worker'}))).status,403)
    assert.equal((await worker(workerRequest({...update,id:jobId}))).status,403)
    assert.equal((await worker(workerRequest({...update,values:{user_id:'another-user'}}))).status,400)
    assert.equal((await worker(workerRequest({...update,values:{output_path:'another-user/output.mp4'}}))).status,400)
    assert.equal(writes,0)
    assert.equal((await worker(workerRequest(update))).status,200)
    assert.equal(writes,1)
    process.env.VERCEL_ENV='production'
    assert.equal((await worker(workerRequest(update))).status,404)
    console.log('PASS: worker bridge rejects wrong tokens, foreign jobs, arbitrary fields and paths; disabled in production.')

  }finally{for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv)}
  console.log('PASS: proxy blocks anonymous data access and wrong cron tokens; valid cron tokens work only for scheduled GET routes; missing auth config returns JSON 503.')
  console.log('PASS: download traversal blocked; valid guide served; login/signup preserve passwords; readiness detects missing, healthy, unhealthy, unreachable workers.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
