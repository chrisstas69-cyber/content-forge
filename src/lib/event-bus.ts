import { EventEmitter } from 'events'

export interface JobEvent {
  type: 'video.status' | 'video.progress' | 'job.update' | 'post.update' | 'log'
  videoId?: string
  jobId?: string
  postId?: string
  data: any
  timestamp: number
}

class TypedEmitter extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args)
  }
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener)
  }
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener)
  }
}

// Singleton event bus — shared across all requests in the same Node.js process
declare global {
  var __automationBus: TypedEmitter | undefined
}

export const bus: TypedEmitter = globalThis.__automationBus || new TypedEmitter()
if (!globalThis.__automationBus) {
  globalThis.__automationBus = bus
  bus.setMaxListeners(100)
}

export function emit(event: JobEvent) {
  bus.emit('event', event)
}

export function subscribe(listener: (event: JobEvent) => void): () => void {
  bus.on('event', listener)
  return () => bus.off('event', listener)
}
