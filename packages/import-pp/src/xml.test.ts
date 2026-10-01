import { describe, expect, it } from 'vitest';
import { createResolver } from './refs';
import {
  MAX_DEPTH,
  XmlError,
  child,
  childrenNamed,
  decodeXml,
  parseXml,
  pathOf,
  type XmlNode,
} from './xml';

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof XmlError) return e.code;
    throw e;
  }
  return undefined;
};

describe('parseXml', () => {
  it('reads elements, attributes, text, CDATA, comments and entities', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y='q'><b>t&lt;1&#65;&#x42;</b><c/><![CDATA[<raw>]]></a>`,
    );
    expect(root.attrs).toEqual({ x: '1 & 2', y: 'q' });
    expect(child(root, 'b')?.text).toBe('t<1AB');
    expect(child(root, 'c')?.children).toEqual([]);
    expect(root.text).toBe('<raw>');
  });

  it('numbers siblings of the same name and builds paths', () => {
    const root = parseXml('<a><b/><c/><b><d/></b></a>');
    const b2 = childrenNamed(root, 'b')[1] as XmlNode;
    expect(b2.index).toBe(2);
    expect(pathOf(child(b2, 'd') as XmlNode)).toBe('a/b[2]/d');
  });

  it('reports the line of a syntax error without echoing content', () => {
    let error: XmlError | undefined;
    try {
      parseXml('<a>\n  <b>secret</c>\n</a>');
    } catch (e) {
      error = e as XmlError;
    }
    expect(error?.code).toBe('syntax');
    expect(error?.line).toBe(2);
    expect(error?.message).not.toContain('secret');
  });

  it.each([
    ['unclosed element', '<a><b></a>'],
    ['no root', '   '],
    ['two roots', '<a/><b/>'],
    ['text outside the root', 'x<a/>'],
    ['unquoted attribute', '<a x=1/>'],
    ['duplicate attribute', '<a x="1" x="2"/>'],
    ['unterminated comment', '<a><!-- x</a>'],
  ])('refuses broken XML: %s', (_name, xml) => {
    expect(code(() => parseXml(xml))).toMatch(/syntax|empty/);
  });

  it('refuses unknown and declared entities and invalid character references', () => {
    expect(code(() => parseXml('<a>&nbsp;</a>'))).toBe('entity');
    expect(code(() => parseXml('<a>&#0;</a>'))).toBe('entity');
    expect(code(() => parseXml('<a>&#xD800;</a>'))).toBe('entity');
  });

  it('refuses a DOCTYPE, so external entities (XXE) and entity bombs cannot exist', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE client [<!ENTITY x SYSTEM "file:///etc/passwd">]><client>&x;</client>`;
    expect(code(() => parseXml(xxe))).toBe('doctype');
    const bomb = `<!DOCTYPE z [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><z>&b;</z>`;
    expect(code(() => parseXml(bomb))).toBe('doctype');
    expect(
      code(() => parseXml('<!DOCTYPE client SYSTEM "http://example.invalid/x.dtd"><client/>')),
    ).toBe('doctype');
    expect(code(() => parseXml('<client><!ENTITY x "y"></client>'))).toBe('doctype');
  });

  it('never reads a referenced entity even in attribute values', () => {
    expect(code(() => parseXml('<a x="&ext;"/>'))).toBe('entity');
  });

  it('limits nesting depth', () => {
    const deep = '<a>'.repeat(MAX_DEPTH + 1) + '</a>'.repeat(MAX_DEPTH + 1);
    expect(code(() => parseXml(deep))).toBe('depth');
    const ok = '<a>'.repeat(MAX_DEPTH) + '</a>'.repeat(MAX_DEPTH);
    expect(code(() => parseXml(ok))).toBeUndefined();
  });
});

describe('decodeXml', () => {
  it('rejects files over the size limit before reading them', () => {
    expect(code(() => decodeXml(new Uint8Array(11), 10))).toBe('too-large');
  });
  it('drops a BOM and rejects invalid UTF-8 and UTF-16', () => {
    expect(decodeXml(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e]))).toBe('<a/>');
    expect(code(() => decodeXml(new Uint8Array([0x3c, 0xff, 0x3e])))).toBe('encoding');
    expect(code(() => decodeXml(new Uint8Array([0xff, 0xfe, 0x3c, 0x00])))).toBe('encoding');
  });
});

describe('reference resolver', () => {
  const root = parseXml(
    `<client><securities><security id="7"><uuid>s1</uuid></security><security><uuid>s2</uuid></security></securities>
      <accounts><account><transactions>
        <tx><security reference="../../../../../securities/security[2]"/></tx>
        <tx><security reference="../../../../../securities/security"/></tx>
        <tx><security reference="/client/securities/security[2]"/></tx>
        <tx><security reference="7"/></tx>
        <tx><security reference="../../../../../securities/security[9]"/></tx>
        <tx><security reference="../../../../../../.."/></tx>
      </transactions></account></accounts></client>`,
  );
  const txs = childrenNamed(
    child(
      child(child(root, 'accounts') as XmlNode, 'account') as XmlNode,
      'transactions',
    ) as XmlNode,
    'tx',
  );
  const uuidOf = (i: number) => {
    const target = createResolver(root).resolve(child(txs[i] as XmlNode, 'security') as XmlNode);
    return child(target, 'uuid')?.text;
  };

  it('resolves relative, indexed, absolute and id references', () => {
    expect(uuidOf(0)).toBe('s2');
    expect(uuidOf(1)).toBe('s1');
    expect(uuidOf(2)).toBe('s2');
    expect(uuidOf(3)).toBe('s1');
  });
  it('throws on a reference that does not resolve', () => {
    expect(() => uuidOf(4)).toThrow(/does not resolve/);
    expect(() => uuidOf(5)).toThrow(/does not resolve/);
  });
  it('returns an element without a reference unchanged', () => {
    expect(createResolver(root).resolve(root)).toBe(root);
  });
});
