import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// List all conversations
export async function GET() {
  const conversations = await db.agentConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { messages: { take: 1, orderBy: { createdAt: 'asc' } } },
  })
  return NextResponse.json({
    conversations: conversations.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      firstMessage: c.messages[0]?.content?.slice(0, 100) || '',
    })),
  })
}

// Delete a conversation
export async function DELETE(req: NextRequest) {
  const { conversationId } = await req.json()
  await db.agentConversation.delete({ where: { id: conversationId } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
