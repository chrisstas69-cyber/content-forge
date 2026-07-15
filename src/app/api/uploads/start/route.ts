import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const fileSchema = z.object({ name:z.string().min(1).max(255), type:z.string().min(1).max(120), size:z.number().int().positive().max(5*1024*1024*1024) })
const requestSchema = z.object({ files:z.array(fileSchema).min(1).max(50), settings:z.record(z.string(),z.unknown()).default({}) })
function safeExtension(name:string) { return name.toLowerCase().match(/\.[a-z0-9]{1,10}$/)?.[0] || '' }

export async function POST(req:NextRequest) {
  const supabase = await createClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({error:'Authentication required'},{status:401})
  const parsed = requestSchema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({error:'Choose valid video or image files and try again.'},{status:400})
  const { data:membership, error:membershipError } = await supabase.from('workspace_members').select('workspace_id').eq('user_id',user.id).limit(1).single()
  if (membershipError || !membership) return NextResponse.json({error:'Your workspace is not ready. Please sign out and back in.'},{status:409})
  const files=parsed.data.files, allImages=files.every(f=>f.type.startsWith('image/')), allVideos=files.every(f=>f.type.startsWith('video/'))
  if (!allImages && !allVideos) return NextResponse.json({error:'Upload videos or photos as separate batches.'},{status:400})
  if (allVideos && files.length>1) return NextResponse.json({error:'Upload one video at a time for reliable phone uploads.'},{status:400})
  const itemId=randomUUID()
  const paths=files.map(f=>`${user.id}/${membership.workspace_id}/${itemId}/${randomUUID()}${safeExtension(f.name)}`)
  const { error:insertError } = await supabase.from('content_items').insert({ id:itemId, workspace_id:membership.workspace_id, user_id:user.id, filename:allImages&&files.length>1?`${files[0].name} (+${files.length-1} more)`:files[0].name, kind:allImages?'slideshow':'video', mime_type:allImages?'image/jpeg':files[0].type, size_bytes:files.reduce((s,f)=>s+f.size,0), source_paths:paths, edit_settings:parsed.data.settings })
  if (insertError) { console.error('Could not create content item:',insertError); return NextResponse.json({error:'The media database is not ready. Apply the latest Supabase migration.'},{status:503}) }
  const uploads:{name:string;path:string;token:string}[]=[]
  for (let index=0;index<paths.length;index+=1) {
    const {data,error}=await supabase.storage.from('content-media').createSignedUploadUrl(paths[index])
    if (error||!data) {
      await supabase.from('content_items').delete().eq('id',itemId)
      return NextResponse.json({error:'Could not prepare secure storage. Please retry.'},{status:503})
    }
    uploads.push({name:files[index].name,path:data.path,token:data.token})
  }
  return NextResponse.json({itemId,uploads})
}
