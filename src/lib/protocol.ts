/**
 * Control-line protocol (PLAN addendum). One typed JSON object per message.
 *
 * The control line is a star: every Viewer holds one DataConnection to the
 * Camera for the whole Session. Media flows Camera → Viewers as a tree
 * (fanout 4); control and chat never ride the media path.
 */

/** Max characters per chat message, enforced on both ends (R7). */
export const MAX_CHAT_TEXT = 500
/** History replay length kept by the Camera (R4). */
export const CHAT_HISTORY_LIMIT = 50

/** Who a chat message is from. Rendered locally so each side localizes it. */
export type SenderLabel =
  | { role: 'camera' }
  | { role: 'viewer'; n: number }

export interface ChatMessage {
  from: SenderLabel
  text: string
  ts: number
}

/** Camera → Viewer. */
export type ToViewer =
  /** You joined: your Viewer number and your media parent's peer id
   *  (the Join code when the parent is the Camera itself). */
  | { type: 'assign'; viewerNumber: number; parentId: string }
  /** Your media parent changed: expect a call from this peer id. */
  | { type: 'reassign'; parentId: string }
  /** To a Relay: call this peer id with your Feed. */
  | { type: 'adopt'; childId: string }
  /** Chat history replay on join (R4, last 50, in order). */
  | { type: 'history'; messages: ChatMessage[] }
  /** One chat message, in the Camera's broadcast order. */
  | { type: 'chat'; message: ChatMessage }
  /** Total Viewers on this Feed (R7). */
  | { type: 'count'; n: number }
  /** The Camera ended the Session. */
  | { type: 'ended' }
  /** Defensive: tree capacity reached. Never shown in normal use. */
  | { type: 'full' }

/** Viewer → Camera. */
export type ToCamera =
  | { type: 'chat'; text: string }
  /** Media died but the control line lives — ask for a new parent. */
  | { type: 'need-parent' }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseSender(v: unknown): SenderLabel | null {
  if (!isRecord(v)) return null
  if (v.role === 'camera') return { role: 'camera' }
  if (v.role === 'viewer' && typeof v.n === 'number') return { role: 'viewer', n: v.n }
  return null
}

function parseChatMessage(v: unknown): ChatMessage | null {
  if (!isRecord(v)) return null
  const from = parseSender(v.from)
  if (!from || typeof v.text !== 'string' || typeof v.ts !== 'number') return null
  return { from, text: v.text, ts: v.ts }
}

/** Validate unknown data as a Camera → Viewer message. */
export function parseToViewer(data: unknown): ToViewer | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null
  switch (data.type) {
    case 'assign':
      if (typeof data.viewerNumber === 'number' && typeof data.parentId === 'string') {
        return { type: 'assign', viewerNumber: data.viewerNumber, parentId: data.parentId }
      }
      return null
    case 'reassign':
      if (typeof data.parentId === 'string') return { type: 'reassign', parentId: data.parentId }
      return null
    case 'adopt':
      if (typeof data.childId === 'string') return { type: 'adopt', childId: data.childId }
      return null
    case 'history':
      if (Array.isArray(data.messages)) {
        const messages = data.messages.map(parseChatMessage)
        if (messages.some((m) => m === null)) return null
        return { type: 'history', messages: messages as ChatMessage[] }
      }
      return null
    case 'chat': {
      const message = parseChatMessage(data.message)
      return message ? { type: 'chat', message } : null
    }
    case 'count':
      if (typeof data.n === 'number') return { type: 'count', n: data.n }
      return null
    case 'ended':
      return { type: 'ended' }
    case 'full':
      return { type: 'full' }
    default:
      return null
  }
}

/** Validate unknown data as a Viewer → Camera message. */
export function parseToCamera(data: unknown): ToCamera | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null
  switch (data.type) {
    case 'chat':
      if (typeof data.text === 'string') return { type: 'chat', text: data.text }
      return null
    case 'need-parent':
      return { type: 'need-parent' }
    default:
      return null
  }
}
