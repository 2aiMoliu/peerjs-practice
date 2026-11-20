/**
 * Camera-side media tree (PLAN addendum, R1–R3). Pure logic — no PeerJS.
 *
 * The root is the Camera itself. Every node holds at most `MAX_CHILDREN`
 * (fanout 4). New Viewers attach breadth-first: the shallowest node with a
 * free slot, so the tree stays balanced. There is no depth cap; only a
 * defensive node limit that maps to the `full` message.
 */

export interface FeedTree {
  /** Attach a Viewer (new, or an orphan root with its own subtree).
   *  Returns the parent's id, or null when the defensive limit is hit. */
  attach(id: string): string | null
  /** Detach a Viewer from its parent — its children stay attached to it —
   *  then re-attach it elsewhere (need-parent move). Excludes its own
   *  subtree, so it can never become its own ancestor. */
  move(id: string): string | null
  /** Remove a Viewer entirely (it left). Returns its direct children, each
   *  still owning its subtree — the Camera re-attaches every one of them. */
  remove(id: string): string[]
  /** Parent's id, or null for the root / detached nodes. */
  parentId(id: string): string | null
  /** Direct children ids (empty for unknown nodes). */
  childIds(id: string): readonly string[]
  /** Number of Viewers (excludes the root). */
  size(): number
}

interface Node {
  parent: string | null
  children: string[]
}

/** Fanout 4 at every node (R1). Depth ≤ 2 holds 20 Viewers, ≤ 3 holds 84. */
export const MAX_CHILDREN = 4
/** Defensive only (R1): "Camera is full" never shows in normal use. */
export const MAX_VIEWERS = 64

export function createFeedTree(rootId: string): FeedTree {
  const nodes = new Map<string, Node>([
    [rootId, { parent: null, children: [] }],
  ])

  function isInSubtree(subtreeRoot: string, id: string): boolean {
    let current: string | null = id
    while (current !== null) {
      if (current === subtreeRoot) return true
      current = nodes.get(current)?.parent ?? null
    }
    return false
  }

  /** Breadth-first: shallowest node with a free slot, outside `excludeSubtreeOf`. */
  function findSlot(excludeSubtreeOf: string | null): string | null {
    const queue = [rootId]
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodes.get(id)
      if (!node) continue
      if (!excludeSubtreeOf || !isInSubtree(excludeSubtreeOf, id)) {
        if (node.children.length < MAX_CHILDREN) return id
      }
      for (const child of node.children) queue.push(child)
    }
    return null
  }

  function link(parent: string, child: string) {
    nodes.get(parent)!.children.push(child)
    nodes.set(child, { parent, children: nodes.get(child)?.children ?? [] })
  }

  function unlink(id: string) {
    const node = nodes.get(id)
    if (!node) return
    const parent = nodes.get(node.parent!)
    if (parent) parent.children = parent.children.filter((c) => c !== id)
    node.parent = null
  }

  return {
    attach(id) {
      if (id === rootId) return null
      const existing = nodes.get(id)
      if (existing && existing.parent !== null) return null // already attached
      // A detached orphan is already counted; only brand-new nodes hit the cap.
      if (!existing && nodes.size - 1 >= MAX_VIEWERS) return null
      const parent = findSlot(null)
      if (parent === null) return null
      link(parent, id)
      return parent
    },

    move(id) {
      const node = nodes.get(id)
      if (!node || node.parent === null) return null
      const oldParent = node.parent
      unlink(id)
      const parent = findSlot(id) ?? oldParent
      link(parent, id)
      return parent
    },

    remove(id) {
      const node = nodes.get(id)
      if (!node) return []
      unlink(id)
      const orphans = [...node.children]
      for (const orphan of orphans) {
        nodes.get(orphan)!.parent = null // keeps its own subtree
      }
      nodes.delete(id)
      return orphans
    },

    parentId(id) {
      return nodes.get(id)?.parent ?? null
    },

    childIds(id) {
      return nodes.get(id)?.children ?? []
    },

    size() {
      return nodes.size - 1
    },
  }
}
