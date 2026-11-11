'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const fields = {title: $('post-title'), excerpt: $('post-excerpt'), body: $('post-body'), slug: $('post-slug'), cover: $('post-cover'), cover_alt: $('post-cover-alt'), category: $('post-category'), tags: $('post-tags'), author: $('post-author'), date: $('post-date')};
  let csrfToken = '', posts = [], current = null, dirty = false, filter = 'all', mode = 'markdown', quill = null, turndown = null;
  let saving = false, dateChanged = false, bodyChanged = false, slugTouched = false, media = [], selectedMedia = new Set(), activeMediaId = null, mediaTarget = 'body', selectedFiles = [];
  const dateFormatter = new Intl.DateTimeFormat('tr-TR', {day: 'numeric', month: 'short', year: 'numeric'});
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const slugify = (value) => value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160);
  const readableCategory = (v) => ({edebiyat: 'Edebiyat', siir: 'Şiir', gunluk: 'Günlük', 'bir-cumle': 'Bir Cümle'}[v] || v || 'Kategorisiz');
  const formatDate = (v) => {const d = new Date(v); return Number.isNaN(+d) ? '' : dateFormatter.format(d);};
  const localDate = (value) => {const date = new Date(value); if (Number.isNaN(+date)) return ''; return new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);};
  const mediaUrl = (item) => item.url || `/uploads/${encodeURIComponent(item.file_name)}`;
  function safeImage(value) {try {const u = new URL(value, location.origin); return ['http:', 'https:'].includes(u.protocol) ? u.href : '';} catch {return '';}}

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {...options.headers};
    if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (options.body && !(options.body instanceof FormData)) {headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body);}
    let response;
    try {response = await fetch(path, {...options, method, headers, credentials: 'same-origin'});} catch {throw new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.');}
    let data;
    try {data = await response.json();} catch {throw new Error(`Sunucudan beklenmeyen yanıt alındı (${response.status}).`);}
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/admin/login') showLogin('Oturumunuz sona erdi. Yeniden giriş yapın.');
      const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
      throw new Error(message || (response.status === 409 ? 'Bu yazı başka bir pencerede değiştirildi. Metninizi kopyalayın ve yazıyı yeniden açın.' : `İşlem tamamlanamadı (${response.status}).`));
    }
    return data;
  }
  function notice(message, error = false) {$('notice').textContent = message; $('notice').classList.toggle('is-error', error); $('notice').hidden = !message;}
  function mediaNotice(message, error = false) {$('media-status').textContent = message; $('media-status').classList.toggle('is-error', error);}
  function showLogin(error = '') {
    $('loading').hidden = true; $('app').hidden = true; $('login-view').hidden = false;
    $('login-error').textContent = error; $('login-error').hidden = !error;
    csrfToken = '';
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  }
  async function showApp(session) {
    csrfToken = session.csrfToken;
    $('account-name').textContent = typeof session.user === 'string' ? session.user : session.user?.username || 'Yönetici';
    $('login-view').hidden = true; $('loading').hidden = true; $('app').hidden = false; $('password').value = '';
    $('posts-view').hidden = false; $('editor-view').hidden = true;
    try {await loadPosts();} catch (error) {notice(error.message, true);}
  }
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').hidden = true;
    try {const data = await api('/api/admin/login', {method: 'POST', body: {username: $('username').value.trim(), password: $('password').value}}); await showApp(data);} catch (error) {$('login-error').textContent = error.message; $('login-error').hidden = false;} finally {button.disabled = false;}
  });
  $('logout').addEventListener('click', async () => {
    if (!canLeave()) return;
    try {await api('/api/admin/logout', {method: 'POST'}); dirty = false; current = null; posts = []; for (const input of Object.values(fields)) input.value = ''; showLogin(); $('username').focus();} catch (error) {notice(error.message, true);}
  });
  async function loadPosts() {const data = await api('/api/admin/posts'); posts = data.posts || []; renderPosts();}
  function renderPosts() {
    $('count-all').textContent = posts.length;
    $('count-published').textContent = posts.filter(p => p.status === 'published').length;
    $('count-draft').textContent = posts.filter(p => p.status !== 'published').length;
    const query = $('post-search').value.trim().toLocaleLowerCase('tr-TR');
    const list = posts.filter(p => (filter === 'all' || p.status === filter) && `${p.title} ${p.excerpt || ''} ${p.category || ''}`.toLocaleLowerCase('tr-TR').includes(query));
    $('posts-list').innerHTML = list.length ? list.map(post => `<article class="post-row">${post.cover && safeImage(post.cover) ? `<img class="post-thumb" src="${escape(safeImage(post.cover))}" alt="" loading="lazy">` : '<div class="post-thumb post-placeholder" aria-hidden="true">h.</div>'}<div class="post-info"><h2><button type="button" data-edit="${escape(post.id)}">${escape(post.title)}</button></h2><p>${escape(readableCategory(post.category))} <span aria-hidden="true">·</span> ${escape(post.author || 'Eşref Akbaş')}</p></div><span class="status-badge ${post.status === 'published' ? 'published' : ''}">${post.status === 'published' ? 'Yayında' : 'Taslak'}</span><time class="post-date" datetime="${escape(post.created_at)}">${escape(formatDate(post.created_at))}</time><button class="row-edit" type="button" data-edit="${escape(post.id)}" aria-label="${escape(post.title)} yazısını düzenle">↗</button></article>`).join('') : `<div class="empty-state"><h2>${posts.length ? 'Bu sayfa henüz sessiz.' : 'Defteriniz hazır.'}</h2><p>${posts.length ? 'Başka bir kelime arayın veya durum filtresini değiştirin.' : '“Yeni yazı” ile ilk sayfanızı hazırlayabilirsiniz.'}</p></div>`;
  }
  $('posts-list').addEventListener('click', (event) => {const button = event.target.closest('[data-edit]'); if (button) openPost(button.dataset.edit);});
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => {b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button));}); renderPosts();}));
  $('post-search').addEventListener('input', renderPosts);
  function canLeave() {return !dirty || window.confirm('Kaydedilmemiş değişiklikleriniz var. Bu değişiklikleri bırakıp devam etmek istiyor musunuz?');}
  function markDirty() {dirty = true; $('save-state').textContent = 'Kaydedilmemiş değişiklikler var';}
  function backToPosts() {if (!canLeave()) return; dirty = false; $('posts-view').hidden = false; $('editor-view').hidden = true; $('breadcrumb').textContent = 'Hindiba / Yazılarım'; notice(''); $('posts-title').tabIndex = -1; $('posts-title').focus();}
  $('nav-posts').addEventListener('click', backToPosts); $('back-posts').addEventListener('click', backToPosts);
  $('new-post').addEventListener('click', () => {if (canLeave()) fillEditor(null);});
  async function openPost(id) {
    if (!canLeave()) return;
    try {const data = await api(`/api/admin/posts/${encodeURIComponent(id)}`); fillEditor(data.post);} catch (error) {notice(error.message, true);}
  }
  function fillEditor(post) {
    current = post; dirty = false; dateChanged = false; bodyChanged = false; slugTouched = Boolean(post?.slug); mode = 'markdown';
    fields.title.value = post?.title || ''; fields.excerpt.value = post?.excerpt || ''; fields.body.value = post?.body ?? '';
    fields.slug.value = post?.slug || ''; fields.cover.value = post?.cover || ''; fields.cover_alt.value = post?.cover_alt || '';
    fields.category.value = post?.category || 'gunluk'; fields.tags.value = Array.isArray(post?.tags) ? post.tags.join(', ') : '';
    fields.author.value = post?.author || 'Eşref Akbaş'; fields.date.value = localDate(post?.created_at || new Date().toISOString());
    $('editor-title').textContent = post ? 'Yazınızı yeniden düşünün.' : 'Yeni bir sayfa.';
    $('save-state').textContent = post ? `Son kayıt: ${new Date(post.updated_at).toLocaleString('tr-TR')}` : 'Henüz kaydedilmedi';
    $('breadcrumb').textContent = post ? 'Hindiba / Yazıyı düzenle' : 'Hindiba / Yeni yazı';
    $('posts-view').hidden = true; $('editor-view').hidden = false; $('rich-warning').hidden = true;
    updateMode(); updateStatus(); updateCover(); updateWordCount(); notice('');
    window.scrollTo({top: 0, behavior: 'instant'}); fields.title.focus();
  }
  function updateStatus() {
    const published = current?.status === 'published';
    $('post-status').textContent = published ? 'Yayında' : 'Taslak'; $('post-status').classList.toggle('published', published);
    $('save-post').textContent = published ? 'Değişiklikleri kaydet' : 'Taslağı kaydet';
    $('publish-post').hidden = published; $('unpublish-post').hidden = !published;
  }
  function updateCover() {
    const url = safeImage(fields.cover.value.trim()); const box = $('cover-preview');
    box.replaceChildren();
    if (url) {const img = document.createElement('img'); img.src = url; img.alt = fields.cover_alt.value; img.addEventListener('error', () => {box.textContent = 'Görsel yüklenemedi. Adresi kontrol edin.';}, {once:true}); box.append(img);} else {box.innerHTML = '<span aria-hidden="true">▧</span><p>Yazınıza bir pencere açın.</p>';}
    $('remove-cover').hidden = !fields.cover.value;
  }
  $('editor-form').addEventListener('input', (event) => {
    markDirty();
    if (event.target === fields.date) dateChanged = true;
    if (event.target === fields.slug) slugTouched = true;
    if (event.target === fields.title && !slugTouched && !current) fields.slug.value = slugify(fields.title.value);
    if (event.target === fields.cover || event.target === fields.cover_alt) updateCover();
    if (event.target === fields.body) {bodyChanged = true; updateWordCount();}
  });
  $('editor-form').addEventListener('submit', (event) => {event.preventDefault(); savePost(current?.status || 'draft');});
  fields.body.addEventListener('keydown', (event) => {if (event.key === 'Tab') {event.preventDefault(); const start = fields.body.selectionStart; fields.body.setRangeText('  ', start, fields.body.selectionEnd, 'end'); bodyChanged = true; markDirty();}});
  function readBody() {return mode === 'rich' ? turndown.turndown(quill.getSemanticHTML()) : current && !bodyChanged ? current.body : fields.body.value;}
  function updateWordCount() {let text = mode === 'rich' && quill ? quill.getText() : fields.body.value; const words = text.trim() ? text.trim().split(/\s+/).length : 0; $('word-count').textContent = `${words.toLocaleString('tr-TR')} kelime · ${Math.max(1, Math.ceil(words / 200))} dk okuma`;}
  function updateMode() {$('post-body').hidden = mode !== 'markdown'; $('rich-container').hidden = mode !== 'rich'; $('mode-markdown').classList.toggle('active', mode === 'markdown'); $('mode-markdown').setAttribute('aria-pressed', String(mode === 'markdown')); $('mode-rich').classList.toggle('active', mode === 'rich'); $('mode-rich').setAttribute('aria-pressed', String(mode === 'rich'));}
  $('mode-rich').addEventListener('click', () => {if (mode !== 'rich') {$('rich-warning').hidden = false; $('enable-rich').focus();}});
  $('cancel-rich').addEventListener('click', () => {$('rich-warning').hidden = true; $('mode-markdown').focus();});
  $('mode-markdown').addEventListener('click', () => {if (mode === 'rich') {fields.body.value = readBody(); mode = 'markdown'; bodyChanged = true; markDirty(); updateMode(); updateWordCount();} $('rich-warning').hidden = true; fields.body.focus();});
  function setupRichEditor() {
    if (quill) return;
    if (!window.Quill || !window.TurndownService) throw new Error('Zengin editör dosyaları yüklenemedi. Markdown ile yazmaya devam edebilirsiniz.');
    const BaseImage = Quill.import('formats/image');
    class AccessibleImage extends BaseImage {
      static create(value) {const node = super.create(typeof value === 'object' ? value.src : value); if (typeof value === 'object') {node.setAttribute('alt', value.alt || ''); if (value.title) node.setAttribute('title', value.title);} return node;}
      static formats(node) {return {...super.formats(node), alt: node.getAttribute('alt') || '', title: node.getAttribute('title') || ''};}
      format(name, value) {if (['alt', 'title'].includes(name)) {if (value) this.domNode.setAttribute(name, value); else this.domNode.removeAttribute(name);} else super.format(name, value);}
    }
    Quill.register('formats/image', AccessibleImage, true);
    quill = new Quill('#rich-editor', {theme: 'snow', placeholder: 'İçinizden geldiği gibi yazın…', modules: {toolbar: {container: [[{header: [2, 3, false]}], ['bold', 'italic', 'underline'], ['blockquote', 'code-block'], [{list: 'ordered'}, {list: 'bullet'}], ['link', 'image'], ['clean']], handlers: {image: () => openMedia('body')}}}});
    quill.root.setAttribute('aria-label', 'Yazının zengin metin içeriği'); quill.root.setAttribute('role', 'textbox'); quill.root.setAttribute('aria-multiline', 'true');
    turndown = new TurndownService({headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-'});
    turndown.addRule('accessibleImages', {filter: 'img', replacement: (_content, node) => imageMarkdown({url: node.getAttribute('src'), alt: node.getAttribute('alt'), caption: node.getAttribute('title')})});
    quill.on('text-change', (_delta, _old, source) => {if (source === 'user') {markDirty(); updateWordCount();}});
  }
  $('enable-rich').addEventListener('click', async () => {
    const button = $('enable-rich'); button.disabled = true;
    try {setupRichEditor(); const {html} = await api('/api/admin/preview', {method: 'POST', body: {body: fields.body.value}}); const richDocument = new DOMParser().parseFromString(html, 'text/html'); for (const caption of richDocument.querySelectorAll('figcaption, .image-caption')) {const image = caption.parentElement.querySelector('img'); if (image?.getAttribute('title') === caption.textContent) caption.remove();} quill.setContents([]); quill.clipboard.dangerouslyPasteHTML(richDocument.body.innerHTML); mode = 'rich'; bodyChanged = true; $('rich-warning').hidden = true; updateMode(); markDirty(); updateWordCount(); quill.focus();} catch (error) {notice(error.message, true);} finally {button.disabled = false;}
  });
  function payload(status) {
    let createdAt = current?.created_at || new Date().toISOString();
    if (!current || dateChanged) {const parsed = new Date(fields.date.value); if (Number.isNaN(+parsed)) throw new Error('Geçerli bir yazı tarihi seçin.'); createdAt = parsed.toISOString();}
    return {title: fields.title.value.trim(), excerpt: fields.excerpt.value.trim(), body: readBody(), slug: fields.slug.value.trim(), cover: fields.cover.value.trim(), cover_alt: fields.cover_alt.value.trim(), category: fields.category.value.trim(), tags: fields.tags.value.split(',').map(s => s.trim()).filter(Boolean), author: fields.author.value.trim(), created_at: createdAt, status, ...(current ? {updated_at: current.updated_at} : {})};
  }
  async function savePost(status) {
    if (saving || !$('editor-form').reportValidity()) return;
    if (!fields.title.value.trim()) {notice('Yazınıza bir başlık ekleyin.', true); fields.title.focus(); return;}
    const buttons = ['save-post', 'publish-post', 'unpublish-post', 'preview-post', 'back-posts', 'nav-posts', 'nav-media', 'logout']; saving = true; buttons.forEach(id => $(id).disabled = true);
    const editorControls = [...document.querySelectorAll('#editor-form input, #editor-form textarea, #editor-form button')]; editorControls.forEach(control => control.disabled = true); if (quill && mode === 'rich') quill.enable(false);
    try {
      const data = payload(status); const path = current ? `/api/admin/posts/${encodeURIComponent(current.id)}` : '/api/admin/posts';
      const result = await api(path, {method: current ? 'PUT' : 'POST', body: data}); current = result.post; dirty = false; dateChanged = false; bodyChanged = false; slugTouched = true; fields.slug.value = current.slug;
      $('save-state').textContent = `Kaydedildi · ${new Date(current.updated_at).toLocaleString('tr-TR')}`; $('editor-title').textContent = 'Yazınızı yeniden düşünün.'; updateStatus();
      notice(status === 'published' ? 'Yazınız yayımlandı. Blogunuzda okunmaya hazır.' : 'Yazınız taslak olarak kaydedildi. Yalnızca yönetim panelinde görünür.');
      await loadPosts();
    } catch (error) {notice(error.message, true); $('notice').scrollIntoView({block: 'nearest'});} finally {saving = false; buttons.forEach(id => $(id).disabled = false); editorControls.forEach(control => control.disabled = false); if (quill) quill.enable(true);}
  }
  $('save-post').addEventListener('click', () => savePost(current?.status || 'draft'));
  $('publish-post').addEventListener('click', () => savePost('published'));
  $('unpublish-post').addEventListener('click', () => savePost('draft'));
  $('preview-post').addEventListener('click', async () => {
    const button = $('preview-post'); button.disabled = true;
    try {
      const {html} = await api('/api/admin/preview', {method: 'POST', body: {body: readBody()}});
      $('preview-heading').textContent = fields.title.value || 'Başlıksız yazı'; $('preview-category').textContent = readableCategory(fields.category.value); $('preview-meta').textContent = `${fields.author.value} · ${formatDate(fields.date.value)}`;
      $('preview-content').innerHTML = html;
      const url = safeImage(fields.cover.value.trim()); $('preview-cover').hidden = !url; $('preview-cover').src = url; $('preview-cover').alt = fields.cover_alt.value;
      $('preview-dialog').showModal();
    } catch (error) {notice(error.message, true);} finally {button.disabled = false;}
  });
  document.querySelectorAll('.preview-close').forEach(button => button.addEventListener('click', () => $('preview-dialog').close()));
  $('remove-cover').addEventListener('click', () => {fields.cover.value = ''; fields.cover_alt.value = ''; updateCover(); markDirty();});
  $('choose-cover').addEventListener('click', () => openMedia('cover')); $('insert-image').addEventListener('click', () => openMedia('body')); $('nav-media').addEventListener('click', () => openMedia('library'));

  async function openMedia(target) {
    mediaTarget = target; selectedMedia = new Set(); activeMediaId = null; $('media-details').hidden = true;
    $('use-media').hidden = target === 'library'; $('use-media').textContent = target === 'cover' ? 'Kapak olarak kullan' : 'Yazıya ekle';
    $('media-grid').replaceChildren(); $('selection-label').textContent = 'Bir fotoğraf seçin.'; $('use-media').disabled = true; mediaNotice('Fotoğraflar yükleniyor…');
    $('media-dialog').showModal();
    try {await loadMedia(); mediaNotice(media.length ? `${media.length} fotoğraf · birden fazla fotoğraf seçebilirsiniz.` : 'İlk fotoğrafınızı yukarıdan yükleyebilirsiniz.');} catch (error) {mediaNotice(error.message, true);}
  }
  document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => $('media-dialog').close()));
  async function loadMedia() {const data = await api('/api/admin/media'); media = data.media || []; renderMedia();}
  function renderMedia() {
    $('media-grid').innerHTML = media.length ? media.map(item => `<button class="media-tile ${selectedMedia.has(item.id) ? 'selected' : ''}" type="button" data-media="${escape(item.id)}" aria-pressed="${selectedMedia.has(item.id)}" aria-label="${escape(item.alt || item.caption || 'Fotoğrafı seç')}"><img src="${escape(mediaUrl(item))}" alt="${escape(item.alt || '')}" loading="lazy"><span>${escape(item.caption || item.alt || `${item.width} × ${item.height}`)}</span></button>`).join('') : '<p class="media-empty">Henüz bir fotoğraf yüklenmedi.</p>';
    $('selection-label').textContent = selectedMedia.size ? `${selectedMedia.size} fotoğraf seçildi.` : 'Bir fotoğraf seçin.';
    $('use-media').disabled = selectedMedia.size === 0;
  }
  $('media-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-media]'); if (!button) return;
    const id = button.dataset.media, item = media.find(m => String(m.id) === id); if (!item) return;
    if (mediaTarget === 'cover') {selectedMedia.clear(); selectedMedia.add(item.id);} else if (selectedMedia.has(item.id)) selectedMedia.delete(item.id); else selectedMedia.add(item.id);
    activeMediaId = item.id; $('media-details').hidden = false; $('selected-preview').src = mediaUrl(item); $('selected-preview').alt = item.alt || '';
    $('selected-dimensions').textContent = `${item.width} × ${item.height} piksel · WebP`; $('selected-alt').value = item.alt || ''; $('selected-caption').value = item.caption || ''; $('selected-url').value = mediaUrl(item); renderMedia();
  });
  async function saveMediaMetadata() {
    if (!activeMediaId) return;
    const item = media.find(m => m.id === activeMediaId); if (!item) return;
    const alt = $('selected-alt').value.trim(), caption = $('selected-caption').value.trim();
    if (alt === (item.alt || '') && caption === (item.caption || '')) return;
    const data = await api(`/api/admin/media/${encodeURIComponent(item.id)}`, {method: 'PUT', body: {alt, caption}});
    const updated = data.media || {...item, alt, caption}; media = media.map(m => m.id === item.id ? {...item, ...updated} : m); $('selected-preview').alt = alt; renderMedia();
  }
  $('media-details').addEventListener('submit', async (event) => {event.preventDefault(); const button = event.submitter; button.disabled = true; try {await saveMediaMetadata(); mediaNotice('Fotoğraf bilgileri kaydedildi.');} catch (error) {mediaNotice(error.message, true);} finally {button.disabled = false;}});
  function setFiles(files) {selectedFiles = [...files]; $('files-label').textContent = selectedFiles.length ? selectedFiles.map(file => file.name).join(', ') : 'JPEG, PNG, WebP veya GIF · dosya başına en fazla 10 MB';}
  $('upload-files').addEventListener('change', (event) => setFiles(event.target.files));
  const dropZone = $('drop-zone');
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, (event) => {event.preventDefault(); dropZone.classList.add('dragging');}));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, (event) => {event.preventDefault(); dropZone.classList.remove('dragging');}));
  dropZone.addEventListener('drop', (event) => setFiles(event.dataTransfer.files));
  $('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!selectedFiles.length) {mediaNotice('Önce bir veya daha fazla fotoğraf seçin.', true); return;}
    for (const file of selectedFiles) {if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {mediaNotice(`“${file.name}” desteklenmeyen bir dosya türü. JPEG, PNG, WebP veya GIF seçin.`, true); return;} if (file.size > 10 * 1024 * 1024) {mediaNotice(`“${file.name}” 10 MB sınırını aşıyor. Daha küçük bir fotoğraf seçin.`, true); return;}}
    $('upload-submit').disabled = true; const uploaded = [], failed = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]; mediaNotice(`${i + 1}/${selectedFiles.length} yükleniyor: ${file.name}`);
      try {const form = new FormData(); form.append('file', file); form.append('alt', $('upload-alt').value.trim()); form.append('caption', $('upload-caption').value.trim()); const result = await api('/api/admin/media', {method: 'POST', body: form}); uploaded.push(result.media); if (mediaTarget === 'cover') {selectedMedia.clear(); selectedMedia.add(result.media.id);} else selectedMedia.add(result.media.id);} catch (error) {failed.push({file, error: error.message});}
    }
    try {await loadMedia();} catch (error) {mediaNotice(error.message, true);}
    setFiles(failed.map(f => f.file)); $('upload-files').value = ''; $('upload-submit').disabled = false;
    mediaNotice(failed.length ? `${uploaded.length} fotoğraf yüklendi. ${failed.map(f => `${f.file.name}: ${f.error}`).join('\n')}` : `${uploaded.length} fotoğraf yüklendi ve seçildi. Fotoğraf bilgilerini arşivden düzenleyebilirsiniz.`, failed.length > 0);
  });
  function imageMarkdown(item) {
    const alt = String(item.alt || '').replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
    const caption = String(item.caption || '').replace(/[\r\n]/g, ' ');
    const url = item.url || mediaUrl(item);
    const title = caption ? ` "${caption.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '';
    return `![${alt}](<${url}>${title})`;
  }
  $('use-media').addEventListener('click', async () => {
    if (!selectedMedia.size) return; $('use-media').disabled = true;
    try {
      await saveMediaMetadata(); const items = media.filter(item => selectedMedia.has(item.id)); if (!items.length) return;
      if (mediaTarget === 'cover') {fields.cover.value = mediaUrl(items[0]); fields.cover_alt.value = items[0].alt || ''; updateCover();}
      else if (mode === 'rich') {
        let index = quill.getSelection(true)?.index ?? quill.getLength() - 1;
        for (const item of items) {quill.insertText(index++, '\n', 'user'); quill.insertEmbed(index++, 'image', {src: mediaUrl(item), alt: item.alt || '', title: item.caption || ''}, 'user'); quill.insertText(index++, '\n', 'user');}
        quill.setSelection(index, 0);
      } else {
        const start = fields.body.selectionStart, end = fields.body.selectionEnd;
        const text = `\n\n${items.map(item => imageMarkdown({...item, url: mediaUrl(item)})).join('\n\n')}\n\n`;
        fields.body.setRangeText(text, start, end, 'end'); bodyChanged = true;
      }
      markDirty(); updateWordCount(); $('media-dialog').close(); if (mediaTarget === 'body' && mode === 'markdown') fields.body.focus();
    } catch (error) {mediaNotice(error.message, true);} finally {$('use-media').disabled = selectedMedia.size === 0;}
  });
  document.addEventListener('keydown', (event) => {if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !$('editor-view').hidden && !document.querySelector('dialog[open]')) {event.preventDefault(); savePost(current?.status || 'draft');}});
  window.addEventListener('beforeunload', (event) => {if (dirty) {event.preventDefault(); event.returnValue = '';}});
  api('/api/admin/session').then(session => session.authenticated ? showApp(session) : showLogin()).catch(error => showLogin(error.message));
})();
