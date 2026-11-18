'use client';

import {useEffect, useRef} from 'react';
import Link from 'next/link';
import {ArrowLeft, ArrowUpRight} from 'lucide-react';
import BrandY from '../brand-y';

// Fixed camera matching "2508-08 Campus Aerial 140.jpg":
// Hovering just above the north roof of LSB looking north up the central campus quad.
const STILL_POSE = {pos: [2.6, 4.75, 28.5], target: [2.1, 0.65, -1.2], fov: 42};

const CREATORS = [
  {
    id: 'jarin',
    name: 'Jarin Canar',
    site: 'jarin.dev',
    url: 'https://jarin.dev',
    photo: '/team/jarin-canar.webp',
    tilt: '-4deg',
    pinColor: '#1a73e8',
  },
  {
    id: 'tanner',
    name: 'Tanner Abbott',
    site: 'tannerabbott.com',
    url: 'https://tannerabbott.com',
    photo: '/team/tanner-abbott.webp',
    tilt: '3deg',
    pinColor: '#e8710a',
  },
  {
    id: 'austin',
    name: 'Austin Pence',
    site: 'austin-pence.github.io',
    url: 'https://austin-pence.github.io',
    photo: '/team/austin-pence.webp',
    tilt: '-2.5deg',
    pinColor: '#00796b',
  },
];

export default function AboutCanvas() {
  const stageRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const pinsRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<HTMLDivElement>(null);
  const flyoverRef = useRef<{setMode: (m: string) => void} | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;

    if (!document.querySelector('script[type="importmap"]')) {
      const im = document.createElement('script');
      im.type = 'importmap';
      im.textContent = JSON.stringify({
        imports: {
          three: '/campus/vendor/three.module.js',
          'three/addons/': '/campus/vendor/addons/',
        },
      });
      document.head.appendChild(im);
    }

    const loadFlyover = new Function('u', 'return import(u)');
    loadFlyover('/demo-deck/campus-flyover.js?v=20261117still2')
      .then((mod: {initCampusFlyover: (opts: unknown) => Promise<{setMode: (m: string) => void}>}) => {
        if (cancelled) return;
        return mod.initCampusFlyover({
          stage,
          loadingEl: loadingRef.current,
          pinsEl: pinsRef.current,
          cutEl: cutRef.current,
          still: STILL_POSE,
        });
      })
      .then((ctrl: {setMode: (m: string) => void} | undefined) => {
        if (!cancelled && ctrl) {
          flyoverRef.current = ctrl;
          ctrl.setMode('still');
        }
      })
      .catch(() => {
        if (loadingRef.current) loadingRef.current.hidden = true;
      });

    return () => {
      cancelled = true;
      flyoverRef.current?.setMode('paused');
    };
  }, []);

  return (
    <main className="about-stage-page has-sketch">
      {/* Standstill WebGL 3D BYU Campus Aerial View */}
      <div ref={stageRef} className="about-webgl-stage" aria-hidden="true">
        <div ref={pinsRef} hidden />
        <div ref={cutRef} className="about-webgl-cut" />
        <div ref={loadingRef} className="about-webgl-loading" hidden />
      </div>

      {/* Hand-Drawn Architectural Pencil Sketch Layer */}
      <svg
        className="about-sketch-layer"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <filter id="graphite-wobble" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.038" numOctaves="3" result="noise" seed="11" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <pattern id="sketch-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#174ea6" strokeWidth="0.9" strokeOpacity="0.22" />
          </pattern>
        </defs>

        {/* Architectural Compass & Sightlines */}
        <g stroke="#174ea6" strokeOpacity="0.24" fill="none" strokeDasharray="5 6">
          <circle cx="800" cy="500" r="340" strokeWidth="1.1" />
          <circle cx="800" cy="500" r="470" strokeWidth="0.8" />
          <line x1="800" y1="0" x2="800" y2="1000" strokeWidth="0.9" />
          <line x1="0" y1="500" x2="1600" y2="500" strokeWidth="0.9" />
        </g>

        {/* Hand-Drawn 2B Graphite Sketch of the Wasatch Ridge & Connecting Curve */}
        <g filter="url(#graphite-wobble)" stroke="#202124" fill="none">
          {/* Sketched Timpanogos & Wasatch Horizon matching the standstill angle */}
          <path
            d="M340,295 L470,255 L635,235 L835,168 L965,198 L1035,182 L1195,228 L1390,175 L1595,105"
            strokeWidth="2.1"
            strokeOpacity="0.48"
          />
          <path
            d="M344,298 L473,252 L638,238 L838,165 L962,201 L1038,179 L1198,231 L1393,172 L1592,108"
            strokeWidth="0.95"
            strokeOpacity="0.3"
          />
          <path
            d="M835,168 L915,225 L965,198 Z M1035,182 L1115,235 L1195,228 Z"
            fill="url(#sketch-hatch)"
            stroke="none"
          />

          {/* Hand-drawn pencil curve connecting the 3 Polaroids */}
          <path
            d="M 280,360 C 510,270 670,390 790,500 C 920,610 1120,470 1310,330"
            stroke="#174ea6"
            strokeWidth="2.2"
            strokeDasharray="8 7"
            strokeOpacity="0.6"
          />
        </g>
      </svg>

      {/* Top HUD */}
      <header className="about-hud-top">
        <div className="about-hud-left">
          <Link prefetch={false} href="/" className="about-pill-brand" aria-label="BYU Calendar home">
            <BrandY className="about-brand-y" />
            <span>
              BYU <b>Calendar</b>
            </span>
          </Link>
          <Link prefetch={false} href="/" className="about-hud-btn">
            <ArrowLeft size={14} /> Calendar
          </Link>
        </div>
      </header>

      {/* Freeform Scattered Polaroids */}
      <section className="about-polaroids" aria-label="Creators">
        {CREATORS.map((c) => (
          <a
            key={c.id}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className={`about-polaroid polaroid-${c.id}`}
            style={{'--tilt': c.tilt, '--pin': c.pinColor} as React.CSSProperties}
          >
            <span className="polaroid-tape" aria-hidden="true" />
            <span className="polaroid-pin" aria-hidden="true" />

            <div className="polaroid-photo">
              <img src={c.photo} alt={c.name} />
            </div>

            <div className="polaroid-foot">
              <div>
                <h2>{c.name}</h2>
                <span className="polaroid-url">{c.site}</span>
              </div>
              <span className="polaroid-go" aria-hidden="true">
                <ArrowUpRight size={17} />
              </span>
            </div>
          </a>
        ))}
      </section>

      {/* Minimal Bottom Bar */}
      <footer className="about-hud-bottom">
        <div className="about-dock-meta">
          <Link prefetch={false} href="/privacy">
            Privacy
          </Link>
          <span>·</span>
          <a href="mailto:privacy@byucalendar.com">privacy@byucalendar.com</a>
        </div>
      </footer>
    </main>
  );
}
