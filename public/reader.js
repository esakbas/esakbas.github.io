'use strict';
const $ = s => document.querySelector(s);
const stored = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
function toast(message) { const el=$('#toast');if(!el)return;el.textContent=message;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>{el.textContent='';},3500); }
const theme = $('#theme-toggle');
function setTheme(value) { document.documentElement.dataset.theme=value;theme?.setAttribute('aria-label',value==='dark'?'Açık temaya geç':'Koyu temaya geç');theme?.setAttribute('aria-pressed',String(value==='dark')); }
setTheme(stored('theme',window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
theme?.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';save('theme',next);setTheme(next);});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)&&!document.activeElement?.isContentEditable){const search=$('#search');if(search){event.preventDefault();search.focus();}else location.assign('/ara');}});
async function legacyRoute(){ const match=location.hash.match(/^#post-(\d+)$/);if(!match)return;try{const response=await fetch('/api/legacy');if(!response.ok)throw Error();const data=await response.json(),path=(data.map||data)[match[1]];if(path&&path.startsWith('/yazi/'))location.replace(path);else toast('Bu eski yazının tam metni mevcut yedekte bulunamadı.');}catch{toast('Eski yazı bağlantısı şu anda açılamadı. Lütfen yeniden deneyin.');} }
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
