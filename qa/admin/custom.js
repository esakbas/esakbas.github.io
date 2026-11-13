'use strict';
// This external script must load before decap-cms.js. Never embed OAuth secrets here.
window.CMS_MANUAL_INIT = true;

(() => {
  // Root-relative public URLs bypass Decap's private-media resolver. Pass a
  // relative filename to that resolver while keeping the saved URL unchanged.
  const mediaAsset = (getAsset, value, field) => getAsset(typeof value === 'string' && value.startsWith('/uploads/') ? value.slice('/uploads/'.length) : value, field);
  const mediaResolvers = new WeakMap();
  const mediaResolver = getAsset => {
    if (!mediaResolvers.has(getAsset)) mediaResolvers.set(getAsset, (value, field) => mediaAsset(getAsset, value, field));
    return mediaResolvers.get(getAsset);
  };
  const categoryNames = { edebiyat: 'Edebiyat', siir: 'Şiir', gunluk: 'Günlük', 'bir-cumle': 'Bir Cümle' };
  const slugify = value => String(value || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150).replace(/-$/, '');
  const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(+date) ? '' : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(date);
  };
  function showError(message) {
    const status = document.getElementById('cms-startup');
    status.replaceChildren();
    const title = document.createElement('h1'); title.textContent = 'Yazı masası açılamadı.';
    const detail = document.createElement('p'); detail.textContent = message;
    const back = document.createElement('a'); back.href = '/'; back.textContent = 'Bloga dön';
    status.append(title, detail, back); status.hidden = false; status.setAttribute('role', 'alert');
  }
  function registerMarkdown(CMS) {
    const native = CMS.getWidget('markdown');
    // Preserve the standard editor; reset its saved mode before each new field mounts.
    // This avoids silently opening an imported article in a previously chosen rich mode.
    const RawFirstMarkdown = window.createClass({
      displayName: 'HindibaRawFirstMarkdown',
      getInitialState() { try { localStorage.setItem('cms.md-mode', 'raw'); } catch {} return {}; },
      focus() { this.control?.focus(); },
      render() { return window.h(native.control, { ...this.props, getAsset: mediaResolver(this.props.getAsset), ref: control => { this.control = control; } }); }
    });
    const MarkdownPreview = props => window.h(native.preview, { ...props, getAsset: mediaResolver(props.getAsset) });
    CMS.registerWidget('markdown', RawFirstMarkdown, MarkdownPreview, native.schema);
  }
  function registerImages(CMS) {
    const native = CMS.getWidget('image');
    const ImageControl = window.createClass({
      displayName: 'HindibaPrivateImage',
      focus() { this.control?.focus?.(); },
      getValidateValue() { return this.control?.getValidateValue?.() ?? this.props.value; },
      shouldComponentUpdate(nextProps) {
        return this.control?.shouldComponentUpdate?.({ ...nextProps, getAsset: mediaResolver(nextProps.getAsset) }) ?? true;
      },
      render() { return window.h(native.control, { ...this.props, getAsset: mediaResolver(this.props.getAsset), ref: control => { this.control = control; } }); }
    });
    const ImagePreview = props => window.h(native.preview, { ...props, getAsset: mediaResolver(props.getAsset) });
    CMS.registerWidget('image', ImageControl, ImagePreview, native.schema);
  }
  function labelEditorSwitches() {
    const root = document.getElementById('nc-root');
    const label = () => root.querySelectorAll('.cms-editor-raw [role="switch"], .cms-editor-visual [role="switch"]').forEach(control => {
      // The upstream toggle drops its aria-label prop. Name the actual mounted
      // element without replacing the native editor or its keyboard behavior.
      control.setAttribute('aria-label', control.closest('.cms-editor-raw') ? 'Zengin metin moduna geç' : 'Markdown moduna geç');
    });
    new MutationObserver(label).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
    label();
  }
  function registerPhoto(CMS) {
    const escapeAlt = text => String(text || '').replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
    const escapeTitle = text => String(text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
    CMS.registerEditorComponent({
      id: 'image',
      label: 'Fotoğraf',
      pattern: /^!\[((?:\\.|[^\]])*)\]\((.*?)(?:\s+"((?:\\.|[^"])*)")?\)/,
      fromBlock: match => ({ image: match[2], alt: match[1].replace(/\\([\\\[\]])/g, '$1'), title: (match[3] || '').replace(/\\([\\"])/g, '$1') }),
      toBlock: ({ image, alt, title }) => `![${escapeAlt(alt)}](${String(image || '').replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')}${title ? ` "${escapeTitle(title)}"` : ''})`,
      toPreview: ({ image, alt, title }, getAsset, fields) => {
        const imageField = fields?.find(field => field.get('widget') === 'image');
        return window.h('figure', { className: 'hindiba-photo' }, window.h('img', { src: mediaAsset(getAsset, image, imageField) || '', alt: alt || '', title: title || '' }), title ? window.h('figcaption', {}, title) : null);
      },
      fields: [
        { label: 'Fotoğraf', name: 'image', widget: 'image', choose_url: false, media_library: { allow_multiple: false, config: { max_file_size: 10485760 } } },
        { label: 'Alternatif metin', name: 'alt', widget: 'string', required: false, hint: 'Görselde ne olduğunu kısaca tarif edin.' },
        { label: 'Görsel açıklaması', name: 'title', widget: 'string', required: false, hint: 'Yayımlanan yazıda fotoğrafın altında görünür.' }
      ]
    });
  }
  function registerPreview(CMS) {
    CMS.registerPreviewStyle('/admin/custom.css');
    CMS.registerPreviewTemplate('posts', window.createClass({
      displayName: 'HindibaPostPreview',
      render() {
        const { entry, getAsset, widgetFor } = this.props;
        const data = entry.get('data');
        const cover = data.get('cover');
        const bodyWidget = widgetFor('body');
        // Decap memoizes this outer widget on getAsset. A saved article's
        // asynchronous media load must invalidate its initial placeholder.
        const bodyPreview = bodyWidget ? window.h(bodyWidget.type, { ...bodyWidget.props, getAsset: (value, field) => mediaAsset(getAsset, value, field) }) : null;
        return window.h('article', { className: 'hindiba-preview' },
          window.h('div', { className: 'preview-brand', 'aria-hidden': true }, 'hindiba.'),
          window.h('p', { className: 'preview-eyebrow' }, `${categoryNames[data.get('category')] || data.get('category') || 'HATIRA DEFTERİNDEN'} · ÖNİZLEME`),
          window.h('h1', {}, data.get('title') || 'Yeni bir sayfa.'),
          data.get('description') ? window.h('p', { className: 'preview-description' }, data.get('description')) : null,
          window.h('p', { className: 'preview-meta' }, `${data.get('author') || 'Eşref Akbaş'} · ${dateLabel(data.get('created_at'))}`),
          cover ? window.h('figure', { className: 'preview-cover' }, window.h('img', { src: mediaAsset(getAsset, cover) || '', alt: data.get('cover_alt') || '' })) : null,
          window.h('div', { className: 'preview-prose' }, bodyPreview),
          window.h('footer', { className: 'preview-end' }, 'Yavaşça oku, kendinden bir şey bul.')
        );
      }
    }));
  }
  function registerSave(CMS) {
    CMS.registerEventListener({ name: 'preSave', handler: ({ entry }) => {
      if (entry.get('collection') !== 'posts') return;
      let data = entry.get('data');
      const now = new Date().toISOString();
      const id = data.get('id') || crypto.randomUUID();
      const title = String(data.get('title') || '').trim();
      if (!title) throw new Error('Yazınıza bir başlık ekleyin.');
      const givenSlug = String(data.get('slug') || '').trim();
      if (givenSlug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(givenSlug) || givenSlug.length > 160)) {
        throw new Error('Yazı adresinde yalnızca küçük Latin harfleri, rakam ve tire kullanın; adres en fazla 160 karakter olabilir.');
      }
      // The filename and public URL are separate. A short stable ID suffix makes
      // automatically generated public URLs distinct even when titles repeat.
      const shortId = String(id).replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase();
      const slug = givenSlug || `${slugify(title) || 'yazi'}-${shortId}`;
      if (String(data.get('body') || '').length > 2_000_000) throw new Error('Yazı metni en fazla 2 milyon karakter olabilir.');
      // Do not trim, reformat, normalize or rehash the original article body/dates.
      data = data.set('id', id).set('title', title).set('slug', slug).set('updated_at', now);
      if (!data.get('created_at')) data = data.set('created_at', now);
      if (!data.get('published_at')) data = data.set('published_at', data.get('created_at'));
      if (!data.get('status')) data = data.set('status', 'published');
      return data;
    } });
  }
  async function initialize() {
    try {
      if (!window.CMS || !window.h || !window.createClass) throw new Error('Editör dosyaları yüklenemedi. Sayfayı yenileyip yeniden deneyin.');
      const response = await fetch('/admin/config.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Yönetim yapılandırması bulunamadı. Site derlemesini kontrol edin.');
      const config = await response.json();
      if (config.backend?.name !== 'github' || config.backend.repo !== 'esakbas/hindiba-blog' || config.backend.branch !== 'main') throw new Error('Yönetim panelinin özel depo yapılandırması geçersiz.');
      config.load_config_file = false;
      config.backend = { ...config.backend, base_url: location.origin, site_domain: location.host, auth_endpoint: 'auth', auth_scope: 'repo', open_authoring: false };
      if (!/^https?:\/\//.test(config.site_url || '')) config.site_url = location.origin;
      config.display_url = config.site_url;
      const CMS = window.CMS;
      // Decap's Turkish catalog omits these switch labels. Keep both editor
      // modes named for keyboard and screen-reader users.
      const turkish = CMS.getLocale('tr') || {};
      const editor = turkish.editor || {};
      const widgets = editor.editorWidgets || {};
      CMS.registerLocale('tr', { ...turkish, editor: { ...editor, editorWidgets: {
        ...widgets, markdown: { ...widgets.markdown, toggleMode: {
          rich: 'Zengin metin moduna geç', markdown: 'Markdown moduna geç'
        } }
      } } });
      registerImages(CMS); registerMarkdown(CMS); registerPhoto(CMS); registerPreview(CMS); registerSave(CMS);
      labelEditorSwitches();
      CMS.init({ config });
      document.getElementById('cms-startup').hidden = true;
    } catch (error) { showError(error.message || 'Panel başlatılamadı.'); }
  }
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
