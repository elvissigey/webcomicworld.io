import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'

type Comic = { id:string; title:string; slug:string; description:string; cover_path:string|null; average_rating:number; followers:number; views:number; status:string }

const demo: Comic[] = [
  {id:'1',title:'Neon Hearts',slug:'neon-hearts',description:'A runaway android and a street artist uncover a conspiracy hidden beneath the city.',cover_path:null,average_rating:4.8,followers:18200,views:92000,status:'ongoing'},
  {id:'2',title:'Kingdom of Ash',slug:'kingdom-of-ash',description:'An exiled heir returns to a kingdom where magic has become a weapon.',cover_path:null,average_rating:4.7,followers:14300,views:81000,status:'ongoing'},
  {id:'3',title:'Midnight Classroom',slug:'midnight-classroom',description:'Every night at midnight, one classroom opens to students from another world.',cover_path:null,average_rating:4.6,followers:9700,views:54000,status:'ongoing'},
  {id:'4',title:'After the Rain',slug:'after-the-rain',description:'Two strangers rebuild their lives in a coastal town where everyone has a secret.',cover_path:null,average_rating:4.5,followers:7600,views:41000,status:'completed'}
]

export default function App(){
  const [session,setSession]=useState<Session|null>(null)
  const [comics,setComics]=useState<Comic[]>([])
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next))
    loadComics()
    return ()=>subscription.unsubscribe()
  },[])

  async function loadComics(){
    const {data,error}=await supabase.from('comics').select('id,title,slug,description,cover_path,average_rating,followers,views,status').eq('content_status','published').order('ranking_score',{ascending:false}).limit(12)
    if(!error && data?.length) setComics(data as Comic[])
    else setComics(demo)
  }

  async function signIn(){
    setBusy(true)
    await supabase.auth.signInWithOAuth({provider:'github',options:{redirectTo:window.location.origin}})
    setBusy(false)
  }
  async function signOut(){ await supabase.auth.signOut() }
  const list=(comics.length?comics:demo).filter(c=>c.title.toLowerCase().includes(query.toLowerCase()))

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="mark">W</span><div><strong>WebComicWorld</strong><small>Read beyond the panel</small></div></div>
      <nav><a>Home</a><a>Browse</a><a>Rankings</a><a>Genres</a><a>Creators</a></nav>
      <div className="actions"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search comics…" />{session?<button onClick={signOut}>Sign out</button>:<button onClick={signIn} disabled={busy}>{busy?'Connecting…':'Sign in with GitHub'}</button>}</div>
    </header>
    <main>
      <section className="hero"><div><p className="eyebrow">A new home for webcomics</p><h1>Stories that keep<br/><span>you scrolling.</span></h1><p className="lead">Discover original comics, follow creators and read every episode in a beautiful, distraction-free reader.</p><div className="heroBtns"><button className="primary">Explore comics</button><button className="secondary">Become a creator</button></div></div><div className="heroCard"><div className="fakeCover">✦<br/><b>WEB<br/>COMIC<br/>WORLD</b></div></div></section>
      <section className="section"><div className="sectionHead"><div><p className="eyebrow">Curated for you</p><h2>Trending now</h2></div><button className="linkBtn">View all →</button></div><div className="grid">{list.map(c=><article className="comic" key={c.id}><div className="cover"><span>{c.status}</span><div>{c.title.split(' ').slice(0,2).map(x=>x[0]).join('')}</div></div><div className="comicInfo"><h3>{c.title}</h3><p>{c.description}</p><div className="meta"><span>★ {Number(c.average_rating).toFixed(1)}</span><span>♡ {c.followers.toLocaleString()}</span></div></div></article>)}</div></section>
      <section className="creator"><div><p className="eyebrow">For creators</p><h2>Build your audience.<br/>Own your story.</h2><p>Upload covers and episode pages directly to secure Supabase Storage, publish on your schedule, and see how readers engage.</p><button className="primary">Open Creator Studio →</button></div><div className="studio"><div className="studioTop"><span>CREATOR STUDIO</span><span>LIVE</span></div><div className="bars"><i/><i/><i/><i/><i/><i/><i/></div><div className="studioStats"><b>12.8K<br/><small>READERS</small></b><b>4.9<br/><small>RATING</small></b><b>38<br/><small>EPISODES</small></b></div></div></section>
    </main>
    <footer><span>© 2026 WebComicWorld</span><span>Discover · Read · Create</span></footer>
  </div>
}
