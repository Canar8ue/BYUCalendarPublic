'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, Expand, Play, X} from 'lucide-react';
import BrandY from './brand-y';
import styles from './campus-explorer.module.css';

const CHANNEL = 'byu-campus-explorer';
const GAME_URL = '/explorer/index.html?v=20261102polish6';
type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function CampusExplorer({missing = false}: {missing?: boolean}) {
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState({message: 'Loading campus…', fraction: 0});
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<number | undefined>(undefined);
  const active = status !== 'idle';

  const exit = useCallback(() => {
    window.clearTimeout(exitTimer.current);
    exitTimer.current = undefined;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setStatus('idle');
    setError('');
    setNotice('');
    requestAnimationFrame(() => play.current?.focus());
  }, []);

  const requestExit = () => {
    if (exitTimer.current !== undefined) return;
    const child = frame.current?.contentWindow;
    if (!child || status !== 'ready') {
      exit();
      return;
    }
    child.postMessage({channel: CHANNEL, type: 'exit'}, window.location.origin);
    exitTimer.current = window.setTimeout(exit, 1000);
  };

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  useEffect(() => {
    if (!active) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message || typeof message !== 'object' || message.channel !== CHANNEL) return;
      if (message.type === 'ready') {
        setStatus('ready');
        setError('');
      } else if (message.type === 'loading') {
        setLoading({message: typeof message.message === 'string' ? message.message.slice(0, 100) : 'Loading campus…', fraction: typeof message.fraction === 'number' && Number.isFinite(message.fraction) ? Math.max(0, Math.min(1, message.fraction)) : 0});
      } else if (message.type === 'error') {
        setError(typeof message.message === 'string' ? message.message.slice(0, 240) : 'The campus could not load in this browser.');
        setStatus('error');
      } else if (message.type === 'exit') {
        exit();
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [active, exit]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = window.setTimeout(() => {
      setError('Loading is taking longer than expected. Check your connection and try again.');
      setStatus('error');
    }, 90000);
    return () => window.clearTimeout(timer);
  }, [status, attempt]);

  const start = () => {
    setError('');
    setNotice('');
    setLoading({message: 'Loading campus…', fraction: 0});
    setAttempt(value => value + 1);
    setStatus('loading');
  };

  const fullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else setNotice('Full screen is unavailable.');
    } catch {
      setNotice('Full screen is unavailable.');
    }
  };

  return <main className={`${styles.page} ${active ? styles.playing : ''}`}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="BYU Calendar home"><BrandY className={styles.brandY}/><span>BYU<span className={styles.brandLight}> Calendar</span></span></Link>
      <Link href="/" className={styles.back}><ArrowLeft size={15}/><span>Back to the calendar</span></Link>
    </header>

    {!active ? <>
      <div className={styles.hero}>
      <section className={styles.intro} aria-labelledby="explorer-title">
        <h1 id="explorer-title">{missing ? 'Page not found' : 'Lost on Campus'}</h1>
        {missing && <h2 className={styles.gameTitle}>Lost on Campus</h2>}
        <div className={styles.actions}>
          <button ref={play} onClick={start} className={styles.play}><Play size={17} fill="currentColor" aria-hidden="true"/> Play</button>
        </div>
        <noscript><p className={styles.notice}>Enable JavaScript to play.</p></noscript>
      </section>

      <div className={styles.poster} aria-hidden="true">
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.sun}/><div className={styles.cloudOne}/><div className={styles.cloudTwo}/>
          <div className={styles.mountainFar}/><div className={styles.mountainNear}/><span className={styles.mountainY}>Y</span>
          <div className={styles.hills}/>
          <div className={styles.campus}>
            <div className={styles.library}><i/><span/><b/></div>
            <div className={styles.tower}><i/><span/></div>
            <div className={styles.hall}><i/><span/></div>
            <div className={styles.bell}><i/><span/><b/></div>
          </div>
          <div className={styles.ground}/><div className={styles.path}/>
          <div className={styles.treeOne}><i/></div><div className={styles.treeTwo}><i/></div>
          <div className={styles.scooter}><i/><b/><span/></div>
        </div>
      </div>
      </div>

    </> : <section ref={stage} className={styles.stage} aria-label="Campus adventure">
      <div className={styles.gameBar}><b>Lost on Campus</b><div><button onClick={fullScreen} aria-label="Toggle full screen"><Expand size={16}/><span>Full screen</span></button><button onClick={requestExit} aria-label="Exit game"><X size={17}/><span>Exit game</span></button></div></div>
      <div className={styles.frameWrap}>
        {status !== 'error' && <iframe key={attempt} ref={frame} className={styles.frame} src={GAME_URL} title="Lost on Campus" allow="autoplay; fullscreen" allowFullScreen onLoad={() => frame.current?.focus()} onError={() => {setError('Campus could not load.'); setStatus('error');}}/>}
        {status === 'loading' && <div className={styles.loading} role="status"><b>{loading.message}</b><progress aria-label="Loading campus" value={loading.fraction} max={1}/></div>}
        {status === 'error' && <div className={styles.error} role="alert"><p>{error}</p><div><button className={styles.play} onClick={start}>Try again</button><Link className={styles.exitButton} href="/">Back to the calendar</Link></div></div>}
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>}

  </main>;
}
