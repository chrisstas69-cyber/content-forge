import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
  const {id}=await ctx.params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Authentication required'},{status:401})
  const {data:item}=await supabase.from('content_items').select('output_path').eq('id',id).single()
  if(!item?.output_path)return NextResponse.json({error:'Output is not ready'},{status:404})
  const {data,error}=await supabase.storage.from('content-media').createSignedUrl(item.output_path,300,{download:true})
  if(error||!data)return NextResponse.json({error:'Could not create download link'},{status:500})
  return NextResponse.redirect(new URL(data.signedUrl,req.url))
}
