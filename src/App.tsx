import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type View = 'home'|'browse'|'detail'|'reader'|'library'|'profile'|'studio'|'admin'
type Comic = { id:string; title:string; slug:string; description:string; cover_path:string|null; average_rating:number; rating_count:number; followers:number; views:number; status:string; content_status:string; is_featured:boolean; created_by:string; chapters_count:number; last_episode_at:string|null }
type Episode = { id:string; comic_id:string; episode_number:number; title:string; description:string; content_status:string; published_at:string|null; views:number; created_by:string }
type Page = { id:string; episode_id:string; page_number:number; storage_path:string; alt_text:string }
type Profile = { id:string; username:string; display_name:string; avatar_url:string|null; bio:string|null; role:string; creator_approved:boolean; is_banned:boolean; banned_until:string|null }
type Comment = { id:string; user_id:string; comic_id:string; episode_id:string|null; parent_id:string|null; body:string; created_at:string }
type Review = { id:string; user_id:string; comic_id:string; body:string; created_at:string; updated_at:string }
type HistoryRow = { user_id:string; comic_id:string; episode_id:string; last_read_at:string }

const demo:Comic[] = [
 {id:'demo-1',title:'Neon Hearts',slug:'neon-hearts',description:'A runaway android and a street artist uncover a conspiracy hidden beneath the city.',cover_path:null,average_rating:4.8,rating_count:184,followers:18200,views:92000,status:'ongoing',content_status:'published',is_featured:true,created_by:'',chapters_count:24,last_episode_at:null},
 {id:'demo-2',title:'Kingdom of Ash',slug:'kingdom-of-ash',description:'An exiled heir returns to a kingdom where magic has become a weapon.',cover_path:null,average_rating:4.7,rating_count:139,followers:14300,views:81000,status:'ongoing',content_status:'published',is_featured:false,created_by:'',chapters_count:18,last_episode_at:null},
 {id:'demo-3',title:'Midnight Classroom',slug:'midnight-classroom',description:'Every night at midnight, one classroom opens to students from another world.',cover_path:null,average_rating:4.6,rating_count:91,followers:9700,views:54000,status:'ongoing',content_status:'published',is_featured:false,created_by:'',chapters_count:14,last_episode_at:null},
 {id:'demo-4',title:'After the Rain',slug:'after-the-rain',description:'Two strangers rebuild their lives in a coastal town where everyone has a secret.',cover_path:null,average_rating:4.5,rating_count:72,followers:7600,views:41000,status:'completed',content_status:'published',is_featured:false,created_by:'',chapters_count:32,last_episode_at:null},
]
const asset=(bucket:string,path:string|null)=>path?supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl:null
const slugify=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80)
const maxCover=10*1024*1024,maxPage=50*1024*1024,maxPages=250
const validImage=(f:File,max:number)=>['image/jpeg','image/png','image/webp','image/avif'].includes(f.type)&&f.size>0&&f.size<=max

export default function App(){
 const [session,setSession]=useState<Session|null>(null)
 const [profile,setProfile]=useState<Profile|null>(null)
 const [comics,setComics]=useState<Comic[]>([])
 const [selected,setSelected]=useState<Comic|null>(null)
 const [episodes,setEpisodes]=useState<Episode[]>([])
 const [pages,setPages]=useState<Page[]>([])
 const [comments,setComments]=useState<Comment[]>([])
 const [reviews,setReviews]=useState<Review[]>([])
 const [query,setQuery]=useState('')
 const [view,setView]=useState<View>('home')
 const [episode,setEpisode]=useState<Episode|null>(null)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [bookmarked,setBookmarked]=useState(false)
 const [followed,setFollowed]=useState(false)
 const [myRating,setMyRating]=useState<number|null>(null)
 const [reviewBody,setReviewBody]=useState('')
 const [commentBody,setCommentBody]=useState('')
 const [likedComments,setLikedComments]=useState<Set<string>>(new Set())
 const [history,setHistory]=useState<HistoryRow[]>([])
 const [navOpen,setNavOpen]=useState(false)

 const notify=(m:string)=>{setMessage(m);window.setTimeout(()=>setMessage(''),5000)}
 const refreshComics=async()=>{
   const {data,error}=await supabase.from('comics').select('id,title,slug,description,cover_path,average_rating,rating_count,followers,views,status,content_status,is_featured,created_by,chapters_count,last_episode_at').eq('content_status','published').order('ranking_score',{ascending:false}).limit(48)
   if(error){notify(error.message);return}
   setComics(data?.length?(data as Comic[]):demo)
 }
 async function loadProfile(id:string){
   const {data,error}=await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,role,creator_approved,is_banned,banned_until').eq('id',id).maybeSingle()
   if(error){notify(error.message);return}
   setProfile((data as Profile)|null)
 }
 async function loadUserData(id:string){
   const [{data:b},{data:f},{data:h}]=await Promise.all([
     supabase.from('bookmarks').select('comic_id').eq('user_id',id),
     supabase.from('comic_follows').select('comic_id').eq('user_id',id),
     supabase.from('history').select('user_id,comic_id,episode_id,last_read_at').eq('user_id',id).order('last_read_at',{ascending:false}).limit(50),
   ])
   setHistory((h||[]) as HistoryRow[])
   if(selected){setBookmarked(Boolean((b||[]).some(x=>x.comic_id===selected.id)));setFollowed(Boolean((f||[]).some(x=>x.comic_id===selected.id)))}
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>{setSession(data.session);if(data.session){loadProfile(data.session.user.id);loadUserData(data.session.user.id)}})
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);if(s){loadProfile(s.user.id);loadUserData(s.user.id)}else{setProfile(null);setHistory([]);setBookmarked(false);setFollowed(false)}})
   refreshComics()
   return()=>subscription.unsubscribe()
 },[])

 async function openComic(c:Comic){
   setSelected(c);setView('detail');setNavOpen(false);setMessage('')
   const [{data:eps,error:e1},{data:cms,error:e2},{data:rvs,error:e3}]=await Promise.all([
     supabase.from('episodes').select('id,comic_id,episode_number,title,description,content_status,published_at,views,created_by').eq('comic_id',c.id).eq('content_status','published').order('episode_number',{ascending:true}),
     supabase.from('comments').select('id,user_id,comic_id,episode_id,parent_id,body,created_at').eq('comic_id',c.id).order('created_at',{ascending:false}).limit(100),
     supabase.from('reviews').select('id,user_id,comic_id,body,created_at,updated_at').eq('comic_id',c.id).order('created_at',{ascending:false}).limit(50),
   ])
   if(e1||e2||e3)notify((e1||e2||e3)?.message||'Unable to load comic')
   setEpisodes((eps||[]) as Episode[]);setComments((cms||[]) as Comment[]);setReviews((rvs||[]) as Review[])
   if(session){
     const [{data:b},{data:f},{data:r},{data:l}]=await Promise.all([
       supabase.from('bookmarks').select('comic_id').eq('user_id',session.user.id).eq('comic_id',c.id).maybeSingle(),
       supabase.from('comic_follows').select('comic_id').eq('user_id',session.user.id).eq('comic_id',c.id).maybeSingle(),
       supabase.from('ratings').select('rating').eq('user_id',session.user.id).eq('comic_id',c.id).maybeSingle(),
       supabase.from('comment_likes').select('comment_id').eq('user_id',session.user.id),
     ])
     setBookmarked(Boolean(b));setFollowed(Boolean(f));setMyRating(r?.rating||null);setLikedComments(new Set((l||[]).map(x=>x.comment_id)))
   }
 }
 async function recordView(c:Comic,e?:Episode){
   try{await supabase.from('comic_views').insert({comic_id:c.id,viewer_id:session?.user.id||null})}catch{}
   if(e)await supabase.from('episodes').select('id').eq('id',e.id).maybeSingle()
 }
 async function openEpisode(e:Episode){
   setEpisode(e);setView('reader');setMessage('')
   const {data,error}=await supabase.from('episode_pages').select('id,episode_id,page_number,storage_path,alt_text').eq('episode_id',e.id).order('page_number',{ascending:true})
   if(error){notify(error.message);return}
   setPages((data||[]) as Page[])
   if(selected)void recordView(selected,e)
   if(session){
     await supabase.from('reading_progress').upsert({user_id:session.user.id,comic_id:e.comic_id,episode_id:e.id,page_number:1,scroll_percent:0})
     await supabase.from('history').upsert({user_id:session.user.id,comic_id:e.comic_id,episode_id:e.id,last_read_at:new Date().toISOString()})
   }
 }
 async function saveProgress(page:number,percent:number){
   if(!session||!episode)return
   const safe=Math.max(0,Math.min(100,percent))
   await supabase.from('reading_progress').upsert({user_id:session.user.id,comic_id:episode.comic_id,episode_id:episode.id,page_number:page,scroll_percent:Number(safe.toFixed(2))})
   await supabase.from('history').upsert({user_id:session.user.id,comic_id:episode.comic_id,episode_id:episode.id,last_read_at:new Date().toISOString()})
 }
 async function signIn(){setBusy(true);setMessage('');const{error}=await supabase.auth.signInWithOAuth({provider:'github',options:{redirectTo:window.location.origin}});if(error)notify(error.message);setBusy(false)}
 async function signOut(){await supabase.auth.signOut();setView('home')}
 async function requireAuth(action:()=>Promise<void>){if(!session){await signIn();return}await action()}
 async function toggleBookmark(){if(!selected)return;await requireAuth(async()=>{setBusy(true);const q=supabase.from('bookmarks');const res=bookmarked?await q.delete().eq('user_id',session!.user.id).eq('comic_id',selected.id):await q.insert({user_id:session!.user.id,comic_id:selected.id});setBusy(false);if(res.error)notify(res.error.message);else{setBookmarked(!bookmarked);notify(bookmarked?'Removed bookmark.':'Added to bookmarks.')}})}
 async function toggleFollow(){if(!selected)return;await requireAuth(async()=>{setBusy(true);const res=followed?await supabase.from('comic_follows').delete().eq('user_id',session!.user.id).eq('comic_id',selected.id):await supabase.from('comic_follows').insert({user_id:session!.user.id,comic_id:selected.id});setBusy(false);if(res.error)notify(res.error.message);else{setFollowed(!followed);notify(followed?'Unfollowed comic.':'Following comic.')}})}
 async function rate(value:number){if(!selected)return;await requireAuth(async()=>{const res=await supabase.from('ratings').upsert({user_id:session!.user.id,comic_id:selected.id,rating:value});if(res.error)notify(res.error.message);else{setMyRating(value);notify('Rating saved.')}})}
 async function submitReview(){if(!selected||!reviewBody.trim())return;await requireAuth(async()=>{const res=await supabase.from('reviews').upsert({user_id:session!.user.id,comic_id:selected.id,body:reviewBody.trim()},{onConflict:'user_id,comic_id'});if(res.error)notify(res.error.message);else{setReviewBody('');notify('Review published.');openComic(selected)}})}
 async function submitComment(){if(!selected||!commentBody.trim())return;await requireAuth(async()=>{const res=await supabase.from('comments').insert({user_id:session!.user.id,comic_id:selected.id,episode_id:episode?.id||null,parent_id:null,body:commentBody.trim()});if(res.error)notify(res.error.message);else{setCommentBody('');notify('Comment posted.');openComic(selected)}})}
 async function toggleCommentLike(id:string){if(!session){await signIn();return}const liked=likedComments.has(id);const res=liked?await supabase.from('comment_likes').delete().eq('user_id',session.user.id).eq('comment_id',id):await supabase.from('comment_likes').insert({user_id:session.user.id,comment_id:id});if(res.error)notify(res.error.message);else setLikedComments(prev=>{const n=new Set(prev);liked?n.delete(id):n.add(id);return n})}
 async function reportComic(){if(!selected)return;await requireAuth(async()=>{const reason=window.prompt('Why are you reporting this comic?')?.trim();if(!reason)return;const res=await supabase.from('reports').insert({reporter_id:session!.user.id,comic_id:selected.id,reason,status:'pending'});if(res.error)notify(res.error.message);else notify('Report submitted to moderators.')})}
 const list=useMemo(()=>comics.filter(c=>c.title.toLowerCase().includes(query.toLowerCase())||c.description.toLowerCase().includes(query.toLowerCase())),[comics,query])
 const firstEpisode=episodes[0],lastEpisode=episodes[episodes.length-1]
 const historyComics=useMemo(()=>history.map(h=>comics.find(c=>c.id===h.comic_id)).filter(Boolean) as Comic[],[history,comics])

 if(view==='reader'&&episode)return <Reader episode={episode} pages={pages} selected={selected} onBack={()=>{setView('detail');if(selected)openComic(selected)}} onHome={()=>setView('home')} onProgress={saveProgress}/>
 if(view==='studio'&&session)return <Studio session={session} profile={profile} onBack={()=>setView('home')} onRefresh={refreshComics} notify={notify}/>
 if(view==='admin'&&session&&profile?.role==='admin')return <Admin session={session} onBack={()=>setView('home')} notify={notify}/>
 return <div className="app">
   <header className="topbar">
     <button className="brandBtn" onClick={()=>setView('home')}><span className="mark">W</span><div><strong>WebComicWorld</strong><small>Read beyond the panel</small></div></button>
     <button className="mobileMenu" onClick={()=>setNavOpen(!navOpen)} aria-label="Toggle menu">☰</button>
     <nav className={navOpen?'open':''}><button onClick={()=>setView('home')}>Home</button><button onClick={()=>setView('browse')}>Browse</button><button onClick={()=>setView('browse')}>Rankings</button><button onClick={()=>setView('browse')}>Genres</button>{session&&<button onClick={()=>setView('library')}>Library</button>}{profile?.role==='admin'&&<button onClick={()=>setView('admin')}>Admin</button>}{profile&&profile.role!=='reader'&&profile.creator_approved&&<button onClick={()=>setView('studio')}>Creator Studio</button>}</nav>
     <div className="actions"><input value={query} onChange={e=>{setQuery(e.target.value);setView('browse')}} placeholder="Search comics…"/>{session?<><button onClick={()=>setView('profile')}>{profile?.display_name||profile?.username||'Profile'}</button><button onClick={signOut}>Sign out</button></>:<button onClick={signIn} disabled={busy}>{busy?'Connecting…':'Sign in with GitHub'}</button>}</div>
   </header>
   {message&&<div className="notice" role="status">{message}</div>}
   <main>
    {view==='profile'&&session&&profile?<ProfilePage profile={profile} history={historyComics} onBack={()=>setView('home')}/>:view==='library'&&session?<Library session={session} comics={comics} onOpen={openComic} onBack={()=>setView('home')}/>:view==='detail'&&selected?<Detail comic={selected} episodes={episodes} comments={comments} reviews={reviews} likedComments={likedComments} bookmarked={bookmarked} followed={followed} myRating={myRating} reviewBody={reviewBody} commentBody={commentBody} onReviewChange={setReviewBody} onCommentChange={setCommentBody} onBack={()=>setView('browse')} onEpisode={openEpisode} onBookmark={toggleBookmark} onFollow={toggleFollow} onRate={rate} onReview={submitReview} onComment={submitComment} onLikeComment={toggleCommentLike} onReport={reportComic}/>:<>
      <section className="hero"><div><p className="eyebrow">A new home for webcomics</p><h1>Stories that keep<br/><span>you scrolling.</span></h1><p className="lead">Discover original comics, follow creators and read every episode in a beautiful, distraction-free reader.</p><div className="heroBtns"><button className="primary" onClick={()=>setView('browse')}>Explore comics</button><button className="secondary" onClick={()=>session?setView(profile?.role!=='reader'&&profile?.creator_approved?'studio':'profile'):signIn()}>{session?'Open account':'Become a creator'}</button></div></div><div className="heroCard"><div className="fakeCover">✦<br/><b>WEB<br/>COMIC<br/>WORLD</b></div></div></section>
      <section className="section"><div className="sectionHead"><div><p className="eyebrow">{view==='browse'?'Search results':'Curated for you'}</p><h2>{view==='browse'?'Browse comics':'Trending now'}</h2></div></div><div className="grid">{list.map(c=><ComicCard key={c.id} comic={c} onClick={()=>openComic(c)}/>)}</div>{!list.length&&<div className="empty">No comics match your search.</div>}</section>
      <section className="creator"><div><p className="eyebrow">For creators</p><h2>Build your audience.<br/>Own your story.</h2><p>Upload covers and episode pages directly to Supabase Storage, publish on your schedule, and see how readers engage.</p><button className="primary" onClick={()=>session?(profile?.creator_approved&&profile.role!=='reader'?setView('studio'):setView('profile')):signIn()}>Open Creator Studio →</button></div><div className="studio"><div className="studioTop"><span>CREATOR STUDIO</span><span>LIVE</span></div><div className="bars"><i/><i/><i/><i/><i/><i/><i/></div></div></section>
    </>}
   </main><footer><span>© 2026 WebComicWorld</span><span>Discover · Read · Create</span></footer>
 </div>
}

function ComicCard({comic,onClick}:{comic:Comic;onClick:()=>void}){return <article className="comic" onClick={onClick}><div className="cover">{asset('comic-covers',comic.cover_path)?<img src={asset('comic-covers',comic.cover_path)!} alt={comic.title}/>:<div>{comic.title.split(' ').slice(0,2).map(x=>x[0]).join('')}</div>}<span>{comic.status}</span></div><div className="comicInfo"><h3>{comic.title}</h3><p>{comic.description}</p><div className="meta"><span>★ {Number(comic.average_rating||0).toFixed(1)}</span><span>♡ {(comic.followers||0).toLocaleString()}</span><span>◉ {(comic.views||0).toLocaleString()}</span></div></div></article>}

function Detail({comic,episodes,comments,reviews,likedComments,bookmarked,followed,myRating,reviewBody,commentBody,onReviewChange,onCommentChange,onBack,onEpisode,onBookmark,onFollow,onRate,onReview,onComment,onLikeComment,onReport}:{comic:Comic;episodes:Episode[];comments:Comment[];reviews:Review[];likedComments:Set<string>;bookmarked:boolean;followed:boolean;myRating:number|null;reviewBody:string;commentBody:string;onReviewChange:(v:string)=>void;onCommentChange:(v:string)=>void;onBack:()=>void;onEpisode:(e:Episode)=>void;onBookmark:()=>void;onFollow:()=>void;onRate:(n:number)=>void;onReview:()=>void;onComment:()=>void;onLikeComment:(id:string)=>void;onReport:()=>void}){
 return <section className="detail"><button className="secondary" onClick={onBack}>← Browse</button><div className="detailGrid"><div className="detailCover">{asset('comic-covers',comic.cover_path)?<img src={asset('comic-covers',comic.cover_path)!} alt={comic.title}/>:<b>{comic.title}</b>}</div><div><p className="eyebrow">{comic.status}</p><h1>{comic.title}</h1><p className="lead">{comic.description}</p><div className="meta big"><span>★ {Number(comic.average_rating||0).toFixed(1)} ({comic.rating_count||0})</span><span>♡ {(comic.followers||0).toLocaleString()} followers</span><span>◉ {(comic.views||0).toLocaleString()} views</span></div><div className="buttonRow"><button className={bookmarked?'primary':'secondary'} onClick={onBookmark}>{bookmarked?'★ Bookmarked':'☆ Bookmark'}</button><button className={followed?'primary':'secondary'} onClick={onFollow}>{followed?'✓ Following':'Follow'}</button><button className="secondary" onClick={onReport}>Report</button>{episodes[0]&&<button className="primary" onClick={()=>onEpisode(episodes[0])}>Start reading</button>}</div><div className="rating"><strong>Your rating:</strong>{[1,2,3,4,5].map(n=><button key={n} aria-label={`${n} stars`} className={myRating===n?'star selected':'star'} onClick={()=>onRate(n)}>★</button>)}</div></div></div><h2>Episodes</h2><div className="episodes">{episodes.length?episodes.map(e=><button key={e.id} onClick={()=>onEpisode(e)}><b>Episode {e.episode_number}</b><span>{e.title}</span><small>{e.views.toLocaleString()} views</small></button>):<div className="empty">No published episodes yet.</div>}</div><div className="communityGrid"><section><h2>Reviews</h2><div className="composer"><textarea maxLength={5000} placeholder="Share your thoughts…" value={reviewBody} onChange={e=>onReviewChange(e.target.value)}/><button className="primary" onClick={onReview}>Post review</button></div>{reviews.map(r=><article className="communityItem" key={r.id}><strong>{r.user_id.slice(0,8)}</strong><small>{new Date(r.created_at).toLocaleDateString()}</small><p>{r.body}</p></article>)}</section><section><h2>Comments</h2><div className="composer"><textarea maxLength={3000} placeholder="Join the conversation…" value={commentBody} onChange={e=>onCommentChange(e.target.value)}/><button className="primary" onClick={onComment}>Post comment</button></div>{comments.map(c=><article className="communityItem" key={c.id}><strong>{c.user_id.slice(0,8)}</strong><small>{new Date(c.created_at).toLocaleDateString()}</small><p>{c.body}</p><button className="secondary small" onClick={()=>onLikeComment(c.id)}>{likedComments.has(c.id)?'♥ Liked':'♡ Like'}</button></article>)}</section></div></section>
}

function Reader({episode,pages,selected,onBack,onHome,onProgress}:{episode:Episode;pages:Page[];selected:Comic|null;onBack:()=>void;onHome:()=>void;onProgress:(p:number,s:number)=>void}){
 const [current,setCurrent]=useState(1)
 return <div className="app reader"><header className="topbar"><button className="secondary" onClick={onBack}>← Back</button><strong>{selected?.title||'Comic'} · Episode {episode.episode_number}</strong><button className="secondary" onClick={onHome}>Home</button></header><main className="readerMain">{pages.length?pages.map(p=><img key={p.id} loading={p.page_number>2?'lazy':'eager'} onLoad={()=>{if(p.page_number===pages.length)onProgress(p.page_number,100)}} onClick={()=>{setCurrent(p.page_number);onProgress(p.page_number,(p.page_number/pages.length)*100)}} src={asset('comic-pages',p.storage_path)!} alt={p.alt_text||`Page ${p.page_number}`} />):<div className="empty">No pages have been published for this episode yet.</div>}</main><div className="readerFooter"><span>Page {current}/{pages.length}</span><div><button className="secondary" disabled={current<=1} onClick={()=>{const p=current-1;setCurrent(p);document.querySelector(`[data-page="${p}"]`)?.scrollIntoView({behavior:'smooth'});onProgress(p,(p/pages.length)*100)}}>Previous</button><button className="primary" disabled={current>=pages.length} onClick={()=>{const p=current+1;setCurrent(p);onProgress(p,(p/pages.length)*100)}}>Next</button></div></div></div>
}

function Library({session,comics,onOpen,onBack}:{session:Session;comics:Comic[];onOpen:(c:Comic)=>void;onBack:()=>void}){const[tab,setTab]=useState<'bookmarks'|'follows'|'history'>('bookmarks');const[data,setData]=useState<Comic[]>([]);useEffect(()=>{(async()=>{const table=tab==='bookmarks'?'bookmarks':tab==='follows'?'comic_follows':'history';const {data:rows}=await supabase.from(table).select('comic_id').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(100);const ids=(rows||[]).map((r:any)=>r.comic_id);setData(comics.filter(c=>ids.includes(c.id)))})()},[tab,session.user.id,comics]);return <section className="section pagePad"><div className="sectionHead"><div><p className="eyebrow">Your library</p><h1>Library</h1></div><button className="secondary" onClick={onBack}>Back</button></div><div className="tabs">{(['bookmarks','follows','history'] as const).map(x=><button key={x} className={tab===x?'primary':'secondary'} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div><div className="grid">{data.map(c=><ComicCard key={c.id} comic={c} onClick={()=>onOpen(c)}/>)}</div>{!data.length&&<div className="empty">Your {tab} is empty.</div>}</section>}

function ProfilePage({profile,history,onBack}:{profile:Profile;history:Comic[];onBack:()=>void}){return <section className="section pagePad"><div className="sectionHead"><div><p className="eyebrow">Account</p><h1>{profile.display_name||profile.username}</h1><p className="lead">@{profile.username} · {profile.role}</p></div><button className="secondary" onClick={onBack}>Back</button></div><div className="profileCard"><p>{profile.bio||'Welcome to WebComicWorld.'}</p><p>{profile.creator_approved?'Creator approved':'Reader account'} {profile.is_banned?'· Account restricted':''}</p></div><h2>Recent reading</h2><div className="grid">{history.map(c=><ComicCard key={c.id} comic={c} onClick={()=>location.hash=c.slug}/>)}</div></section>}

function Studio({session,profile,onBack,onRefresh,notify}:{session:Session;profile:Profile|null;onBack:()=>void;onRefresh:()=>Promise<void>;notify:(m:string)=>void}){
 const[comics,setComics]=useState<Comic[]>([]),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[cover,setCover]=useState<File|null>(null),[comicId,setComicId]=useState(''),[episodeId,setEpisodeId]=useState(''),[episodeTitle,setEpisodeTitle]=useState(''),[episodeNo,setEpisodeNo]=useState('1'),[pages,setPages]=useState<FileList|null>(null),[busy,setBusy]=useState(false)
 const load=async()=>{const{data,error}=await supabase.from('comics').select('id,title,slug,description,cover_path,average_rating,rating_count,followers,views,status,content_status,is_featured,created_by,chapters_count,last_episode_at').eq('created_by',session.user.id).order('updated_at',{ascending:false});if(error)notify(error.message);setComics((data||[]) as Comic[])}
 useEffect(()=>{load()},[])
 if(!profile||profile.role==='reader'||!profile.creator_approved)return <main className="studioPage"><h1>Creator access</h1><p>Your account must be approved as a creator before publishing content.</p><button className="secondary" onClick={onBack}>Back</button></main>
 async function createComic(){if(!title.trim()||title.trim().length>160){notify('Title is required and must be 160 characters or less.');return}setBusy(true);const slug=slugify(title);const {data,error}=await supabase.from('comics').insert({title:title.trim(),slug,description:description.trim().slice(0,10000),created_by:session.user.id,content_status:'draft',status:'draft',alternative_titles:[],language_code:'en',is_mature:false,is_featured:false}).select('id').single();if(error){notify(error.message);setBusy(false);return}if(cover){if(!validImage(cover,maxCover)){notify('Cover must be JPEG, PNG, WebP or AVIF and no larger than 10 MB.');setBusy(false);return}const path=`${session.user.id}/${data.id}/${Date.now()}-${cover.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;const up=await supabase.storage.from('comic-covers').upload(path,cover,{upsert:false,contentType:cover.type});if(up.error){await supabase.from('comics').delete().eq('id',data.id);notify(up.error.message);setBusy(false);return}const upd=await supabase.from('comics').update({cover_path:path}).eq('id',data.id);if(upd.error){await supabase.storage.from('comic-covers').remove([path]);await supabase.from('comics').delete().eq('id',data.id);notify(upd.error.message);setBusy(false);return}}setComicId(data.id);setTitle('');setDescription('');setCover(null);await load();await onRefresh();notify('Draft comic created.');setBusy(false)}
 async function createEpisode(){const no=Number(episodeNo);if(!comicId||!Number.isFinite(no)||no<1||!episodeTitle.trim()){notify('Select a comic, enter a valid episode number and title.');return}setBusy(true);const {data,error}=await supabase.from('episodes').insert({comic_id:comicId,episode_number:no,title:episodeTitle.trim(),slug:slugify(`${no}-${episodeTitle}`),description:'',content_status:'draft',created_by:session.user.id}).select('id').single();if(error){notify(error.message);setBusy(false);return}setEpisodeId(data.id);setEpisodeTitle('');setEpisodeNo(String(no+1));notify('Episode draft created.');setBusy(false)}
 async function uploadPages(){if(!comicId||!episodeId||!pages?.length){notify('Create/select a comic and episode, then choose pages.');return}if(pages.length>maxPages){notify(`Maximum ${maxPages} pages per episode.`);return}const files=Array.from(pages).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));if(files.some(f=>!validImage(f,maxPage))){notify('Every page must be JPEG, PNG, WebP or AVIF and no larger than 50 MB.');return}setBusy(true);const uploaded:string[]=[];try{for(let i=0;i<files.length;i++){const f=files[i],path=`${session.user.id}/${comicId}/${episodeId}/${String(i+1).padStart(4,'0')}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;const up=await supabase.storage.from('comic-pages').upload(path,f,{upsert:false,contentType:f.type});if(up.error)throw new Error(up.error.message);uploaded.push(path);const ins=await supabase.from('episode_pages').insert({episode_id:episodeId,page_number:i+1,storage_path:path,alt_text:`Episode page ${i+1}`});if(ins.error)throw new Error(ins.error.message)}notify(`${files.length} pages uploaded as draft.`)}catch(e){if(uploaded.length)await supabase.storage.from('comic-pages').remove(uploaded);await supabase.from('episode_pages').delete().eq('episode_id',episodeId);notify(e instanceof Error?e.message:'Upload failed.')}finally{setBusy(false)}}
 async function publishEpisode(id:string){const{error}=await supabase.rpc('publish_episode',{p_episode_id:id});if(error)notify(error.message);else{notify('Episode published.');load();onRefresh()}}
 async function publishComic(id:string){const{error}=await supabase.rpc('publish_comic',{p_comic_id:id});if(error)notify(error.message);else{notify('Comic published.');load();onRefresh()}}
 async function unpublishComic(id:string){const{error}=await supabase.rpc('unpublish_comic',{p_comic_id:id});if(error)notify(error.message);else{notify('Comic unpublished.');load();onRefresh()}}
 return <main className="studioPage"><div className="sectionHead"><div><p className="eyebrow">Creator Studio</p><h1>Your publishing workspace</h1><p className="lead">Create drafts, upload pages, and publish only when the episode is complete.</p></div><button className="secondary" onClick={onBack}>Back</button></div><div className="formGrid"><section><h2>1. Create comic</h2><input maxLength={160} placeholder="Comic title" value={title} onChange={e=>setTitle(e.target.value)}/><textarea maxLength={10000} placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)}/><label>Cover image<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>setCover(e.target.files?.[0]||null)}/></label><button className="primary" disabled={busy||!title.trim()} onClick={createComic}>Create draft</button></section><section><h2>2. Create episode</h2><select value={comicId} onChange={e=>setComicId(e.target.value)}><option value="">Select your comic</option>{comics.map(c=><option key={c.id} value={c.id}>{c.title} · {c.content_status}</option>)}</select><input type="number" min="1" value={episodeNo} onChange={e=>setEpisodeNo(e.target.value)} placeholder="Episode number"/><input placeholder="Episode title" value={episodeTitle} onChange={e=>setEpisodeTitle(e.target.value)}/><button className="primary" disabled={busy||!comicId} onClick={createEpisode}>Create episode draft</button></section><section><h2>3. Upload pages</h2><input placeholder="Episode ID" value={episodeId} onChange={e=>setEpisodeId(e.target.value)}/><label>Pages<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>setPages(e.target.files)}/></label><button className="primary" disabled={busy} onClick={uploadPages}>Upload pages</button></section></div><section><h2>Your comics</h2>{comics.map(c=><article className="manageRow" key={c.id}><div><strong>{c.title}</strong><span>{c.content_status} · {c.chapters_count} published episodes · {c.views.toLocaleString()} views · {c.followers.toLocaleString()} followers</span></div><div><button className="secondary small" onClick={()=>setComicId(c.id)}>Use</button>{c.content_status==='published'?<button className="secondary small" onClick={()=>unpublishComic(c.id)}>Unpublish</button>:<button className="primary small" onClick={()=>publishComic(c.id)}>Publish</button>}</div></article>)}</section></main>
}

function Admin({session,onBack,notify}:{session:Session;onBack:()=>void;notify:(m:string)=>void}){const[profiles,setProfiles]=useState<Profile[]>([]),[comics,setComics]=useState<Comic[]>([]),[reports,setReports]=useState<any[]>([]);const load=async()=>{const[{data:p},{data:c},{data:r}]=await Promise.all([supabase.from('profiles').select('id,username,display_name,avatar_url,bio,role,creator_approved,is_banned,banned_until').order('created_at',{ascending:false}).limit(200),supabase.from('comics').select('id,title,slug,description,cover_path,average_rating,rating_count,followers,views,status,content_status,is_featured,created_by,chapters_count,last_episode_at').order('created_at',{ascending:false}).limit(200),supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(200)]);setProfiles((p||[]) as Profile[]);setComics((c||[]) as Comic[]);setReports(r||[])};useEffect(()=>{load()},[]);const approve=async(id:string,v:boolean)=>{const{error}=await supabase.rpc('admin_set_creator_approval',{p_user_id:id,p_approved:v});if(error)notify(error.message);else{notify(v?'Creator approved.':'Creator approval removed.');load()}};const ban=async(id:string,v:boolean)=>{const{error}=await supabase.rpc('admin_set_banned',{p_user_id:id,p_banned:v});if(error)notify(error.message);else{notify(v?'User banned.':'User unbanned.');load()}};const moderate=async(id:string,s:'published'|'draft'|'archived')=>{const{error}=await supabase.rpc('admin_set_comic_moderation',{p_comic_id:id,p_content_status:s});if(error)notify(error.message);else{notify(`Comic moved to ${s}.`);load()}};const feature=async(id:string,v:boolean)=>{const{error}=await supabase.rpc('admin_feature_comic',{p_comic_id:id,p_featured:v});if(error)notify(error.message);else{notify(v?'Comic featured.':'Comic unfeatured.');load()}};return <main className="section pagePad"><div className="sectionHead"><div><p className="eyebrow">Administration</p><h1>Moderation dashboard</h1></div><button className="secondary" onClick={onBack}>Back</button></div><section><h2>Users</h2>{profiles.map(p=><article className="manageRow" key={p.id}><div><strong>{p.display_name||p.username}</strong><span>@{p.username} · {p.role} · {p.creator_approved?'creator approved':'not approved'}</span></div><div><button className="secondary small" onClick={()=>approve(p.id,!p.creator_approved)}>{p.creator_approved?'Remove creator':'Approve creator'}</button><button className={p.is_banned?'secondary small':'primary small'} onClick={()=>ban(p.id,!p.is_banned)}>{p.is_banned?'Unban':'Ban'}</button></div></article>)}</section><section><h2>Comics</h2>{comics.map(c=><article className="manageRow" key={c.id}><div><strong>{c.title}</strong><span>{c.content_status} · {c.status} · {c.views.toLocaleString()} views</span></div><div>{<button className="secondary small" onClick={()=>feature(c.id,!c.is_featured)}>{c.is_featured?'Unfeature':'Feature'}</button>}<button className="secondary small" onClick={()=>moderate(c.id,c.content_status==='published'?'archived':'published')}>{c.content_status==='published'?'Archive':'Publish'}</button></div></article>)}</section><section><h2>Reports ({reports.length})</h2>{reports.map(r=><article className="manageRow" key={r.id}><div><strong>{r.reason}</strong><span>{r.status} · {new Date(r.created_at).toLocaleString()}</span></div></article>)}</section></main>}
