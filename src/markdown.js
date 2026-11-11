import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// Image mirroring changes only the rendered URL. The exact original Markdown
// remains in SQLite and in the source backup for verification and rollback.
export function renderMarkdown(markdown = '', imageMap = {}) {
  const resolveImage = source => {
    const mapped = imageMap && Object.hasOwn(imageMap, source) ? imageMap[source] : undefined;
    return typeof mapped === 'string' && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(mapped) ? mapped : source;
  };
  const imageHtml = (token, block = false) => {
    const image = `<img src="${escapeHtml(resolveImage(token.href))}" alt="${escapeHtml(token.text)}"${token.title ? ` title="${escapeHtml(token.title)}"` : ''} loading="lazy">`;
    if (block) return `<figure>${image}${token.title ? `<figcaption>${escapeHtml(token.title)}</figcaption>` : ''}</figure>`;
    return `<span class="inline-figure">${image}${token.title ? `<span class="image-caption">${escapeHtml(token.title)}</span>` : ''}</span>`;
  };
  const renderer = new marked.Renderer();
  renderer.image = token => imageHtml(token);
  renderer.paragraph = function({ tokens }) {
    // A standalone image gets semantic figure markup without an invalid figure
    // inside a paragraph. Images within a sentence keep valid inline markup.
    const onlyImages = tokens.some(token => token.type === 'image') && tokens.every(token => token.type === 'image' || token.type === 'br' || (token.type === 'text' && !token.text.trim()));
    if (onlyImages) return tokens.filter(token => token.type === 'image').map(token => imageHtml(token, true)).join('\n') + '\n';
    return `<p>${this.parser.parseInline(tokens)}</p>\n`;
  };
  return sanitizeHtml(marked.parse(String(markdown), { gfm: true, breaks: true, async: false, renderer }), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'details', 'summary'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      a: ['href', 'name', 'target', 'rel', 'title'],
      span: ['class'],
      '*': ['id']
    },
    allowedClasses: { span: ['inline-figure', 'image-caption'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: resolveImage(attribs.src), loading: 'lazy' } })
    }
  });
}
