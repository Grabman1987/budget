import { type XmlNode } from './xml';

/**
 * XStream reference resolution (`docs/migration/pp-export.md` §References). XStream writes an
 * object graph as a tree: the first time an object is met it is written in full, every later use
 * is an empty element with a `reference` attribute. PP uses relative XPath-style paths
 * (`../../securities/security[3]`), resolved from the element that carries the attribute:
 * `..` is the parent, `name` the first child of that name, `name[n]` the n-th (1-based).
 * Absolute paths (`/client/...`) and id references (`id="n"` / `reference="n"`) are also handled.
 */

const MAX_CHAIN = 16;

export class ReferenceError_ extends Error {
  constructor(
    readonly code: 'unresolved' | 'loop',
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceError';
  }
}

export interface Resolver {
  /** The element an element stands for: itself, or the target of its `reference` attribute. */
  resolve(node: XmlNode): XmlNode;
}

function step(node: XmlNode, segment: string): XmlNode | undefined {
  if (segment === '..') return node.parent ?? undefined;
  if (segment === '.' || segment === '') return node;
  const m = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(segment);
  if (!m) return undefined;
  const want = Number(m[2] ?? 1);
  let seen = 0;
  for (const c of node.children) {
    if (c.name === m[1]) {
      seen += 1;
      if (seen === want) return c;
    }
  }
  return undefined;
}

export function createResolver(root: XmlNode): Resolver {
  let byId: Map<string, XmlNode> | null = null;
  const idIndex = (): Map<string, XmlNode> => {
    if (byId) return byId;
    byId = new Map();
    const stack: XmlNode[] = [root];
    while (stack.length > 0) {
      const n = stack.pop() as XmlNode;
      const id = n.attrs.id;
      if (id !== undefined && !byId.has(id)) byId.set(id, n);
      for (let k = n.children.length - 1; k >= 0; k--) stack.push(n.children[k] as XmlNode);
    }
    return byId;
  };

  const follow = (node: XmlNode): XmlNode => {
    const ref = node.attrs.reference;
    if (ref === undefined) return node;
    let target: XmlNode | undefined;
    if (/^\d+$/.test(ref)) target = idIndex().get(ref);
    else {
      const absolute = ref.startsWith('/');
      const segments = ref.split('/');
      if (absolute) {
        segments.shift();
        if (segments.shift() !== root.name) target = undefined;
        else target = segments.reduce<XmlNode | undefined>((n, s) => n && step(n, s), root);
      } else {
        target = segments.reduce<XmlNode | undefined>((n, s) => n && step(n, s), node);
      }
    }
    if (!target) throw new ReferenceError_('unresolved', `Reference "${ref}" does not resolve`);
    return target;
  };

  return {
    resolve(node) {
      let current = node;
      for (let hops = 0; hops < MAX_CHAIN; hops++) {
        if (current.attrs.reference === undefined) return current;
        current = follow(current);
      }
      throw new ReferenceError_('loop', 'Reference chain is too long or circular');
    },
  };
}
