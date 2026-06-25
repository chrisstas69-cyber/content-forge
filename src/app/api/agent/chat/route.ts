import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { agentTools, getToolByName, toolSpecs } from '@/lib/agent-tools'
import ZAI from 'z-ai-web-dev-sdk'
import { emit } from '@/lib/event-bus'

export const runtime = 'nodejs'
export const maxDuration = 120

let zaiInstance: any = null
async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create()
  return zaiInstance
}

const SYSTEM_PROMPT = `You are the ContentForge AI Assistant, an intelligent agent living inside a content automation platform.

Your job: help the user manage their content workflow — videos, scheduling, publishing, analytics, trends, and strategy.

You have access to tools that let you SEE and DO things in the user's actual account:
- list_videos, get_video_details: see what content exists
- list_scheduled_posts, cancel_scheduled_post: manage the publishing queue
- get_connected_accounts: see which social platforms are connected
- get_settings, update_settings: view/change brand handle and content niche
- search_trends, refresh_trends: see what's trending right now
- get_analytics: pull performance metrics across platforms
- get_dashboard_stats: high-level numbers

Guidelines:
1. Be conversational and concise. Don't dump huge data unless asked.
2. Use tools proactively — if the user asks "what should I post tomorrow?", look at their library AND trends before answering.
3. When you take an action (cancel a post, update settings), confirm what you did.
4. If you don't have enough info, ask. But try to gather context first via tools.
5. Tailor your advice to the user's specific niche and content. Read their settings.
6. Be opinionated. If a video has a low viral score, say so and suggest improvements.
7. When suggesting content ideas, ground them in actual trends you can pull via search_trends.

You ARE the user's content strategist, social media manager, and analyst — all in one.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, conversationId } = body as { message: string; conversationId?: string }

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // Get or create conversation
    let conversation
    if (conversationId) {
      conversation = await db.agentConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
    }
    if (!conversation) {
      conversation = await db.agentConversation.create({
        data: { title: message.slice(0, 60) },
        include: { messages: true },
      })
    }

    // Save user message
    await db.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    })

    // Build the message history for the LLM
    const zai = await getZai()
    const history = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversation.messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'tool',
        content: m.content,
        ...(m.toolCalls ? { tool_calls: JSON.parse(m.toolCalls) } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      { role: 'user' as const, content: message },
    ]

    // Call LLM with tools — may loop multiple times if it makes tool calls
    let loopCount = 0
    const maxLoops = 6  // safety limit
    let finalContent = ''
    let toolsUsed: string[] = []

    while (loopCount < maxLoops) {
      loopCount++
      const completion: any = await zai.chat.completions.create({
        messages: history as any,
        tools: toolSpecs as any,
        tool_choice: 'auto',
        temperature: 0.7,
      })

      const assistantMessage = completion.choices?.[0]?.message
      if (!assistantMessage) break

      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        finalContent = assistantMessage.content || ''
        // Save final assistant message
        await db.agentMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: finalContent,
          },
        })
        break
      }

      // Save the assistant message with tool calls
      await db.agentMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantMessage.content || '',
          toolCalls: JSON.stringify(assistantMessage.tool_calls),
        },
      })

      // Add assistant message to history
      history.push(assistantMessage)

      // Execute each tool call and add results to history
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}')
        toolsUsed.push(toolName)

        let toolResult: any
        try {
          const tool = getToolByName(toolName)
          if (!tool) {
            toolResult = { error: `Unknown tool: ${toolName}` }
          } else {
            toolResult = await tool.handler(toolArgs)
          }
        } catch (err: any) {
          toolResult = { error: err?.message || String(err) }
        }

        const toolResultStr = JSON.stringify(toolResult).slice(0, 8000)  // truncate huge results
        // Save tool message
        await db.agentMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'tool',
            content: toolResultStr,
            toolCallId: toolCall.id,
            toolName,
          },
        })
        // Add to history
        history.push({
          role: 'tool' as const,
          content: toolResultStr,
          tool_call_id: toolCall.id,
        })

        // Emit event for UI to refresh
        emit({ type: 'agent.tool_used', data: { tool: toolName, args: toolArgs }, timestamp: Date.now() })
      }
      // Loop continues — LLM will see the tool results and either call more tools or respond
    }

    if (!finalContent) {
      finalContent = "I ran into an issue processing that request. Please try again."
      await db.agentMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: finalContent,
        },
      })
    }

    return NextResponse.json({
      conversationId: conversation.id,
      content: finalContent,
      toolsUsed,
    })
  } catch (err: any) {
    console.error('Agent chat error:', err)
    return NextResponse.json({ error: err?.message || 'Agent failed' }, { status: 500 })
  }
}
