'use client';
// Onboarding chat for "Picked for you". The server (with the configured chat
// model) phrases each question and its clickable suggestions; the member can
// tap those or type their own answer in the free-response box below them.
// Either way answers resolve to the calendar's interest vocabularies on the
// server and build the stored profile. A handful of exchanges, always
// skippable.
import {useEffect, useRef, useState} from 'react';
import {Bot, ChevronRight, MessageCircleQuestion, SendHorizontal, Sparkles} from 'lucide-react';
import {postJSON} from './account-client';

type ChatStep = {question: string; key: string; options: string[]; multiple: boolean};
type ChatAnswer = {question: string; key: string; options: string[]; free?: string};
type ChatResponse = {done: boolean; step?: ChatStep; summary?: string};
type Message = {role: 'bot' | 'you'; text: string};

export default function ProfileChat({onFinished, onUpdated, restartsOnOpen}: {onFinished: () => void; onUpdated?: () => void; restartsOnOpen?: boolean}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<ChatStep | null>(null);
  const [answers, setAnswers] = useState<ChatAnswer[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({top: historyRef.current.scrollHeight});
    if (step && !busy && !error) inputRef.current?.focus();
  }, [messages, busy, step, error]);

  function apply(data: ChatResponse) {
    if (data.done) {
      setStep(null); setFinished(true);
      setMessages(current => [...current, {role: 'bot', text: (data.summary || 'Your picks are ready.') + ' My calendar will keep an eye out for events like these.'}]);
    } else if (data.step) {
      setStep(data.step); setPicked([]); setTyped('');
      setMessages(current => [...current, {role: 'bot', text: data.step!.question}]);
    }
  }

  // Tuning is decided when the dialog opens (hasProfile at that moment) and
  // must not flip mid-conversation — the first stored answer turns hasProfile
  // on — so the opening request and the intro copy freeze the first-render
  // value.
  const [tuningAtMount] = useState(restartsOnOpen === true);
  const restartOnMount = useRef(tuningAtMount);
  // The first question loads with the dialog; state changes only land in the
  // promise callbacks, never synchronously from the effect. Tuning an existing
  // profile opens with restart:true — the server clears the stored profile and
  // taste counters so the conversation rebuilds them from scratch.
  useEffect(() => {
    let active = true;
    postJSON<ChatResponse>('/api/profile/chat', restartOnMount.current ? {answers: [], restart: true} : {answers: []}, 45000)
      .then(data => { if (active) apply(data); })
      .catch(() => { if (active) setError('The picks chat is briefly unavailable.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function ask(next: ChatAnswer[], restart = false) {
    setBusy(true); setError('');
    try {
      apply(await postJSON<ChatResponse>('/api/profile/chat', restart ? {restart: true} : {answers: next}, 45000));
      // The server stores answers progressively, so the picks panel behind
      // the dialog can refresh after every exchange.
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The picks chat is briefly unavailable.');
      onUpdated?.();
    } finally { setBusy(false); }
  }

  function answer(labels: string[], free = '') {
    if (!step) return;
    const text = free.trim().slice(0, 300);
    const entry: ChatAnswer = {question: step.question, key: step.key, options: labels, ...(text ? {free: text} : {})};
    const next = [...answers, entry];
    setAnswers(next);
    const echo = [...labels, ...(text ? [text] : [])];
    setMessages(current => [...current, {role: 'you', text: echo.length ? echo.join(' · ') : 'Skipped'}]);
    void ask(next);
  }

  function restart() {
    setAnswers([]); setMessages([]); setFinished(false); setStep(null); setPicked([]); setTyped('');
    void ask([], true);
  }

  function toggle(option: string) {
    setPicked(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option]);
  }

  const canSend = !busy && !error && step && (picked.length > 0 || typed.trim().length > 0);

  return (
    <div className="profile-dialog">
      <div className="eyebrow">PICKED FOR YOU</div>
      <h2>Tell it what you like.</h2>
      <p className="modal-intro">A few quick questions — tap a suggestion or type your own answer. Your picks also learn from the events you open and save.{tuningAtMount ? ' Tuning starts fresh: your previous answers and taste signals are cleared.' : ''}</p>
      <div className="chat-history" ref={historyRef} aria-live="polite">
        {messages.map((message, index) => (
          <div className={'chat-bubble' + (message.role === 'you' ? ' chat-you' : '')} key={index}>
            {message.role === 'bot' && <Bot size={15}/>}<span>{message.text}</span>
          </div>
        ))}
        {busy && <div className="chat-bubble chat-typing"><Bot size={15}/><span>…</span></div>}
      </div>
      {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => (answers.length ? void ask(answers) : void ask([], tuningAtMount && !messages.length))}>Retry</button></p>}
      {step && !busy && !error && (
        <>
          <div className="chat-replies" aria-label="Suggested answers">
            {step.options.map(option => (
              <button key={option} className={'chat-reply' + (step.multiple && picked.includes(option) ? ' selected' : '')}
                aria-pressed={step.multiple ? picked.includes(option) : undefined}
                onClick={() => (step.multiple ? toggle(option) : answer([option]))}>
                {step.multiple && picked.includes(option) && '✓ '}{option}
              </button>
            ))}
          </div>
          <form className="chat-composer" onSubmit={submitEvent => {submitEvent.preventDefault(); if (canSend) answer(picked, typed);}}>
            <input ref={inputRef} className="chat-input" value={typed} onChange={change => setTyped(change.target.value)}
              maxLength={300} placeholder="…or type your own answer" aria-label="Type your own answer"
              disabled={!step}/>
            {step.multiple
              ? <button className="primary-button chat-next" type="submit" disabled={!canSend}>Next<ChevronRight size={16}/></button>
              : <button className="primary-button chat-next" type="submit" disabled={!canSend} aria-label="Send answer"><SendHorizontal size={16}/></button>}
          </form>
          <button className="text-button chat-skip" onClick={() => answer([])}>Skip this</button>
        </>
      )}
      {finished && (
        <div className="chat-done">
          <button className="primary-button" onClick={onFinished}><Sparkles size={16}/>See my picks</button>
          <button className="text-button" onClick={restart}>Start over</button>
        </div>
      )}
      <p className="chat-footnote"><MessageCircleQuestion size={14}/> Question wording comes from the calendar&apos;s AI assistant; your answers and every pick are computed on our servers.</p>
    </div>
  );
}
