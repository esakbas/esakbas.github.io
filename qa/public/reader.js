'use strict';
const $ = s => document.querySelector(s);
const stored = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
function toast(message) { const el=$('#toast');if(!el)return;el.textContent=message;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>{el.textContent='';},3500); }
const theme = $('#theme-toggle');
function setTheme(value) {
 const selected=value==='light'?'light':'dark';
 document.documentElement.dataset.theme=selected;
 $('meta[name="theme-color"]')?.setAttribute('content',selected==='light'?'#e6eaff':'#070a1a');
 theme?.setAttribute('aria-label',selected==='dark'?'Açık temaya geç':'Koyu temaya geç');
}
setTheme(stored('theme','dark'));
theme?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';save('theme',next);setTheme(next);});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)&&!document.activeElement?.isContentEditable){const search=$('#search');if(search){event.preventDefault();search.focus();}else location.assign('/ara');}});
async function legacyRoute(){ const match=location.hash.match(/^#post-(\d+)$/);if(!match)return;try{const response=await fetch('/assets/legacy.json');if(!response.ok)throw Error();const data=await response.json(),path=(data.map||data)[match[1]];if(path&&path.startsWith('/yazi/'))location.replace(path);else toast('Bu eski yazının tam metni mevcut yedekte bulunamadı.');}catch{toast('Eski yazı bağlantısı şu anda açılamadı. Lütfen yeniden deneyin.');} }
legacyRoute();window.addEventListener('hashchange',legacyRoute);
$('#saved-filter')?.addEventListener('click',event=>{event.preventDefault();let ids=[];try{const data=JSON.parse(stored('savedPosts','[]'));if(Array.isArray(data))ids=data.map(String).slice(0,500);}catch{}location.assign('/?'+new URLSearchParams({kayitlar:ids.join(',')||'none'}));});
const article=$('.article');
if(article){
 const title=$('.article h1')?.textContent||'', id=article.dataset.postId;
 save('lastReadPostId',id);save('lastReadPostTitle',title);save('hindiba-last-path',location.pathname);
 let size=Math.min(1.6,Math.max(.9,Number(stored('readingFontSize','1.12'))||1.12));
 const resize=()=>{document.documentElement.style.setProperty('--reading',size+'rem');save('readingFontSize',String(size));};resize();
 $('#font-smaller')?.addEventListener('click',()=>{size=Math.max(.9,size-.08);resize();});$('#font-larger')?.addEventListener('click',()=>{size=Math.min(1.6,size+.08);resize();});
 let saved=[];try{const data=JSON.parse(stored('savedPosts','[]'));saved=Array.isArray(data)?data.map(String):[];}catch{}
 const bookmark=$('#save-post');function updateBookmark(){const isSaved=saved.includes(String(id));bookmark?.setAttribute('aria-pressed',String(isSaved));bookmark?.setAttribute('aria-label',isSaved?'Yazıyı kayıtlardan kaldır':'Yazıyı kaydet');if(bookmark)bookmark.textContent=isSaved?'♥':'♡';}updateBookmark();
 bookmark?.addEventListener('click',()=>{saved=saved.includes(id)?saved.filter(v=>v!==id):[...saved,id];save('savedPosts',JSON.stringify(saved));updateBookmark();toast(saved.includes(id)?'Yazı bu cihazda kaydedildi.':'Yazı kayıtlardan kaldırıldı.');});
 $('#copy-link')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('link[rel=canonical]').href);toast('Bağlantı kopyalandı.');}catch{toast('Bağlantıyı adres çubuğundan kopyalayabilirsiniz.');}});
 const headings=[...document.querySelectorAll('#article-body h2,#article-body h3')];
 if(headings.length>2){const toc=$('#toc'),label=document.createElement('strong');label.textContent='BU SAYFADA';toc.append(label);headings.forEach((h,i)=>{h.id='bolum-'+i;const link=document.createElement('a');link.href='#'+h.id;link.textContent=h.textContent;toc.append(link);});toc.hidden=false;}
 document.querySelectorAll('#article-body img[title]').forEach(img=>{if(img.closest('figure,.inline-figure'))return;const caption=img.title;if(!caption)return;const figure=document.createElement('figure'),figcaption=document.createElement('figcaption');img.before(figure);figure.append(img);figcaption.textContent=caption;figure.append(figcaption);});
 const progress=()=>{const rect=article.getBoundingClientRect(),den=Math.max(1,article.offsetHeight-innerHeight);$('#reading-progress').style.width=Math.max(0,Math.min(100,-rect.top/den*100))+'%';};window.addEventListener('scroll',progress,{passive:true});progress();
}
const lastPath=stored('hindiba-last-path'),lastTitle=stored('lastReadPostTitle');if(lastPath?.startsWith('/yazi/')&&lastTitle&&$('#continue-reading')){$('#continue-reading').hidden=false;$('#last-read-link').href=lastPath;$('#last-read-link').textContent=lastTitle;}

// Search and filters run against published-only build data on the static host.
const searchForm = document.querySelector('.search-form');
if (searchForm) {
  let indexPromise;
  const getIndex = () => indexPromise ||= fetch('/assets/search-index.json').then(response => {
    if (!response.ok) throw new Error('Arama dizini yüklenemedi.');return response.json();
  });
  const basePath = location.pathname.replace(/sayfa\/\d+\/?$/, '') || '/';
  const params = new URLSearchParams(location.search);
  const input = searchForm.querySelector('[name=q]'), year = searchForm.querySelector('[name=yil]'), sort = searchForm.querySelector('[name=sira]');
  if (input) input.value = params.get('q') || '';
  if (year) year.value = params.get('yil') || '';
  if (sort) sort.value = params.get('sira') || 'yeni';
  async function filterPosts(next, page = 1) {
    const list = document.querySelector('.posts-list');
    if (!list) return;
    try {
      let posts = [...await getIndex()];
      const parts = basePath.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts[0] === 'kategori') posts = posts.filter(p => p.category === parts[1] || p.tags.includes(parts[1]));
      if (parts[0] === 'etiket') posts = posts.filter(p => p.tags.includes(parts[1]));
      const q = (next.get('q') || '').trim().slice(0, 200).toLocaleLowerCase('tr');
      if (q) posts = posts.filter(p => `${p.title} ${p.body}`.toLocaleLowerCase('tr').includes(q));
      if (next.get('yil')) posts = posts.filter(p => String(new Date(p.created_at).getFullYear()) === next.get('yil'));
      if (next.has('kayitlar')) {const ids = new Set((next.get('kayitlar') || '').split(','));posts = posts.filter(p => ids.has(String(p.id)));}
      if (next.get('sira') === 'eski') posts.reverse();
      const count = document.querySelector('.post-count');if (count) count.textContent = `${posts.length} yazı`;
      const heading = document.querySelector('.section-heading h2');
      if (heading && q) heading.textContent = `“${next.get('q').trim().slice(0,200)}” için sonuçlar`;
      else if (heading && next.has('kayitlar')) heading.textContent = 'Kaydettiğin sayfalar.';
      const pageCount = Math.max(1, Math.ceil(posts.length / 6));page = Math.min(pageCount, Math.max(1, page));
      const shown = posts.slice((page - 1) * 6, page * 6);
      if (shown.length) list.innerHTML = shown.map(p => p.html).join('');
      else {
        const box = document.createElement('div');box.className = 'empty-state';
        const title = document.createElement('h3');title.textContent = 'Bu aramada bir yazı bulunamadı.';
        const link = document.createElement('a');link.href = basePath;link.textContent = 'Filtreleri temizle →';box.append(title, link);list.replaceChildren(box);
      }
      let nav = document.querySelector('.pagination');
      if (!nav) {nav = document.createElement('nav');nav.className = 'pagination';nav.setAttribute('aria-label','Sayfalama');list.after(nav);}
      nav.replaceChildren();nav.hidden = pageCount <= 1;
      for (let i = 1; i <= pageCount; i++) {
        const link = document.createElement('a'), target = new URLSearchParams(next);if (i > 1) target.set('p', String(i));else target.delete('p');
        link.href = basePath + (target.size ? '?' + target : '');link.textContent = String(i).padStart(2,'0');
        if (i === page) link.setAttribute('aria-current','page');
        link.addEventListener('click', event => {event.preventDefault();history.replaceState(null,'',link.href);filterPosts(next,i);});nav.append(link);
      }
      let status = document.getElementById('search-results-status');
      if (!status) {status = document.createElement('p');status.id = 'search-results-status';status.className = 'sr-only';status.setAttribute('role','status');status.setAttribute('aria-live','polite');list.before(status);}
      status.textContent = `${posts.length} yazı bulundu, ${page}. sayfa.`;
    } catch (error) {list.textContent = error.message + ' Sayfayı yeniden yükleyin.';}
  }
  searchForm.addEventListener('submit', event => {
    event.preventDefault();const next = new URLSearchParams();
    if (input?.value.trim()) next.set('q',input.value.trim().slice(0,200));
    if (year?.value) next.set('yil',year.value);
    if (sort?.value === 'eski') next.set('sira','eski');
    history.replaceState(null,'',basePath + (next.size ? '?' + next : ''));filterPosts(next);
  });
  if ([...params.keys()].some(k => ['q','yil','sira','kayitlar','p'].includes(k))) filterPosts(params, Number(params.get('p')) || 1);
}
