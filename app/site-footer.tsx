import Link from 'next/link';

export default function SiteFooter({className='site-footer'}:{className?:string}){
 return <footer className={className}><span>Independent student project · Not an official BYU service · <span className="site-footer-links"><Link prefetch={false} href="/privacy">Privacy</Link> · <Link prefetch={false} href="/about">About Us</Link></span></span></footer>;
}
