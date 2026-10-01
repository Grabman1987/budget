/**
 * Minimal, safe XML reader for Portfolio Performance files (`docs/migration/pp-export.md`).
 *
 * Safety by construction, not by configuration: there is no DTD support at all. A `<!DOCTYPE>` is
 * refused, so external entities, parameter entities and entity-expansion bombs cannot exist. Only
 * the five predefined entities and numeric character references are decoded. Size and nesting
 * depth are limited. Errors carry a code and a line, never file contents.
 */

export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
export const MAX_DEPTH = 512;

export type XmlErrorCode =
  'too-large' | 'encoding' | 'doctype' | 'entity' | 'syntax' | 'depth' | 'empty';

export class XmlError extends Error {
  constructor(
    readonly code: XmlErrorCode,
    readonly line: number,
    message: string,
  ) {
    super(`XML line ${line}: ${message}`);
    this.name = 'XmlError';
  }
}

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated character data directly inside this element (not trimmed). */
  text: string;
  parent: XmlNode | null;
  /** 1-based position among the parent's children of the same name. */
  index: number;
  line: number;
}

/** Strict UTF-8 decoding (BOM dropped) with a size limit; throws `XmlError` otherwise. */
export function decodeXml(bytes: Uint8Array, maxBytes = DEFAULT_MAX_BYTES): string {
  if (bytes.length > maxBytes)
    throw new XmlError('too-large', 0, `File is larger than ${maxBytes} bytes`);
  const b0 = bytes[0];
  const b1 = bytes[1];
  if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff))
    throw new XmlError('encoding', 1, 'UTF-16 is not supported, expected UTF-8');
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    throw new XmlError('encoding', 1, 'Invalid UTF-8');
  }
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(raw: string, line: number): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(
    /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]*);/g,
    (_m, body: string) => {
      if (body.startsWith('#')) {
        const cp = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
          throw new XmlError('entity', line, 'Invalid character reference');
        return String.fromCodePoint(cp);
      }
      const value = NAMED[body];
      if (value === undefined) throw new XmlError('entity', line, `Unknown entity &${body};`);
      return value;
    },
  );
}

const isSpace = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;
const isNameStart = (c: number) =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58 || c >= 0xc0;
const isNameChar = (c: number) =>
  isNameStart(c) || (c >= 48 && c <= 57) || c === 46 || c === 45 || c === 0xb7;

/** Parses a document into its root element. */
export function parseXml(text: string): XmlNode {
  let i = 0;
  let line = 1;
  const n = text.length;
  const syntax = (msg: string): never => {
    throw new XmlError('syntax', line, msg);
  };
  const countLines = (from: number, to: number) => {
    for (let k = text.indexOf('\n', from); k !== -1 && k < to; k = text.indexOf('\n', k + 1))
      line += 1;
  };
  const skipTo = (marker: string, what: string) => {
    const end = text.indexOf(marker, i);
    if (end === -1) syntax(`Unterminated ${what}`);
    countLines(i, end);
    i = end + marker.length;
  };

  let root: XmlNode | null = null;
  let current: XmlNode | null = null;
  // Per open element: how many children of each name it has so far (O(1) sibling numbering).
  const counts: Map<string, number>[] = [];
  let depth = 0;

  while (i < n) {
    const lt = text.indexOf('<', i);
    const chunkEnd = lt === -1 ? n : lt;
    if (chunkEnd > i) {
      const chunk = text.slice(i, chunkEnd);
      if (current) current.text += decodeEntities(chunk, line);
      else if (chunk.trim() !== '') syntax('Text outside the root element');
      countLines(i, chunkEnd);
      i = chunkEnd;
    }
    if (lt === -1) break;

    if (text.startsWith('<!--', i)) {
      i += 4;
      skipTo('-->', 'comment');
    } else if (text.startsWith('<![CDATA[', i)) {
      if (!current) syntax('CDATA outside the root element');
      const start = i + 9;
      const end = text.indexOf(']]>', start);
      if (end === -1) syntax('Unterminated CDATA');
      (current as XmlNode).text += text.slice(start, end);
      countLines(i, end);
      i = end + 3;
    } else if (text.startsWith('<?', i)) {
      i += 2;
      skipTo('?>', 'processing instruction');
    } else if (text.startsWith('<!', i)) {
      // <!DOCTYPE, <!ENTITY, <!ELEMENT ...: DTDs are never read, see the header comment.
      throw new XmlError('doctype', line, 'DOCTYPE and entity declarations are not allowed');
    } else if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i);
      if (end === -1) syntax('Unterminated end tag');
      const name = text.slice(i + 2, end).trim();
      if (!current || current.name !== name) syntax(`Unexpected end tag </${name}>`);
      current = (current as XmlNode).parent;
      depth -= 1;
      i = end + 1;
    } else {
      i += 1;
      const nameStart = i;
      if (!isNameStart(text.charCodeAt(i))) syntax('Invalid element name');
      while (i < n && isNameChar(text.charCodeAt(i))) i += 1;
      const name = text.slice(nameStart, i);
      const attrs: Record<string, string> = {};
      const startLine = line;
      let selfClosing = false;
      for (;;) {
        while (i < n && isSpace(text.charCodeAt(i))) {
          if (text.charCodeAt(i) === 10) line += 1;
          i += 1;
        }
        const c = text[i];
        if (c === undefined) syntax('Unterminated start tag');
        if (c === '>') {
          i += 1;
          break;
        }
        if (c === '/' && text[i + 1] === '>') {
          selfClosing = true;
          i += 2;
          break;
        }
        const aStart = i;
        while (i < n && isNameChar(text.charCodeAt(i))) i += 1;
        if (i === aStart) syntax('Invalid attribute');
        const aName = text.slice(aStart, i);
        while (i < n && isSpace(text.charCodeAt(i))) i += 1;
        if (text[i] !== '=') syntax('Attribute without value');
        i += 1;
        while (i < n && isSpace(text.charCodeAt(i))) i += 1;
        const quote = text[i];
        if (quote !== '"' && quote !== "'") syntax('Attribute value must be quoted');
        const vEnd = text.indexOf(quote as string, i + 1);
        if (vEnd === -1) syntax('Unterminated attribute value');
        if (Object.hasOwn(attrs, aName)) syntax(`Duplicate attribute ${aName}`);
        attrs[aName] = decodeEntities(text.slice(i + 1, vEnd), line);
        countLines(i, vEnd);
        i = vEnd + 1;
      }
      const node: XmlNode = {
        name,
        attrs,
        children: [],
        text: '',
        parent: current,
        index: 1,
        line: startLine,
      };
      if (current) {
        const map = (counts[depth - 1] ??= new Map());
        node.index = (map.get(name) ?? 0) + 1;
        map.set(name, node.index);
        current.children.push(node);
      } else if (root) syntax('More than one root element');
      else root = node;
      if (!selfClosing) {
        counts[depth] = undefined as unknown as Map<string, number>;
        depth += 1;
        if (depth > MAX_DEPTH) throw new XmlError('depth', line, 'Nesting is too deep');
        current = node;
      }
    }
  }
  if (current) syntax(`Unclosed element <${current.name}>`);
  if (!root) throw new XmlError('empty', line, 'No root element');
  return root;
}

/** Slash path of a node with 1-based indexes where needed, e.g. `client/accounts/account[2]`. */
export function pathOf(node: XmlNode): string {
  const parts: string[] = [];
  for (let n: XmlNode | null = node; n; n = n.parent) {
    parts.push(n.parent && n.index > 1 ? `${n.name}[${n.index}]` : n.name);
  }
  return parts.reverse().join('/');
}

export const child = (node: XmlNode, name: string): XmlNode | undefined =>
  node.children.find((c) => c.name === name);
export const childrenNamed = (node: XmlNode, name: string): XmlNode[] =>
  node.children.filter((c) => c.name === name);
