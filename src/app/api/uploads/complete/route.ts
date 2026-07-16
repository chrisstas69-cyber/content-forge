import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
const schema=z.object({itemId:z.string().uuid()})
export async function POST(req:NextRequest) {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Authentication required'},{status:401})
  const parsed=schema.safeParse(await req.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:'Invalid upload'},{status:400})
  const {data:item,error}=await supabase.from('content_items').update({status:'queued',progress:0,current_step:'Waiting for processing worker',updated_at:new Date().toISOString()}).eq('id',parsed.data.itemId).eq('user_id',user.id).eq('status','uploading').select('id, workspace_id').single()
  if(error||!item)return NextResponse.json({error:'Upload could not be finalized.'},{status:409})
  const {error:jobError}=await supabase.from('processing_jobs').insert({workspace_id:item.workspace_id,content_item_id:item.id,user_id:user.id})
  if(jobError){await supabase.from('content_items').update({status:'failed',error_message:'Could not queue processing'}).eq('id',item.id);return NextResponse.json({error:'The file is safe, but processing could not be queued.'},{status:503})}
  return NextResponse.json({ok:true,itemId:item.id})
}
