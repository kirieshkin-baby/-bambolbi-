import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, Icon, LinkButton, MediaView, Select, api, useData } from './shared.jsx';

export default function Player() {
  const initial = new URLSearchParams(location.search).get('screen') || '';
  const [screen, setScreen] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState('');
  const [broken, setBroken] = useState('');
  const [full, setFull] = useState(false);
  const [progress, setProgress] = useState(0);
  const video = useRef(null);
  const stage = useRef(null);
  const timing = useRef(null);
  const screens = useData('/api/screens', 0, 5000);
  const {data,error} = useData(screen ? '/api/playlist?screen=' + encodeURIComponent(screen) : null, 0, 1000);
  const knownScreen = data && Number(screen) === data.screen.id ? data.screen : null;
  const slot = knownScreen ? data.slot : null;
  const key = slot ? [slot.id, slot.file, slot.starts, slot.cycle].join('/') : '';
  const isVideo = slot?.mime.startsWith('video/');
  const canTrack = Boolean(slot && ready === key && broken !== key && !paused && !error);

  useEffect(() => {
    if (!screens.data) return;
    if (!screens.data.some(item => String(item.id) === screen)) {
      setScreen(String(screens.data.find(item => item.status === 'В сети')?.id || screens.data[0]?.id || ''));
    }
  }, [screens.data, screen]);
  useEffect(() => {
    const url = new URL(location.href);
    if (screen) url.searchParams.set('screen', screen);
    else url.searchParams.delete('screen');
    history.replaceState(null, '', url);
  }, [screen]);
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!video.current) return;
    if (paused) video.current.pause();
    else video.current.play().catch(error => { if (error.name !== 'AbortError') setBroken(key); });
  }, [paused, key]);
  useEffect(() => {
    if (!key) { setReady(''); setBroken(''); }
  }, [key]);

  useEffect(() => {
    timing.current = slot ? { slot, offset: data.now - Date.now() } : null;
  }, [data, slot]);
  useEffect(() => {
    setProgress(0);
    if (!canTrack) return;
    let observedAt = null;
    let registeredCycle = null;
    const interval = setInterval(() => {
      const info = timing.current;
      if (!info) return;
      const { slot, offset } = info;
      const now = Date.now() + offset;
      const duration = slot.cycle * 1000;
      const cycle = slot.starts + Math.floor((now - slot.starts) / duration) * duration;
      observedAt ??= now;
      if (now < slot.starts || now >= slot.ends) { setProgress(0); }
      else setProgress(Math.max(0, Math.min(100, (now - cycle) / duration * 100)));
      const completed = cycle - duration;
      if (completed >= observedAt && completed !== registeredCycle && cycle <= slot.ends) {
        registeredCycle = completed;
        api('/api/impressions', { method: 'POST', body: { slot_id: slot.id, screen_id: slot.screen_id, cycle_start: completed } }).catch(() => {});
      }
    }, 120);
    return () => clearInterval(interval);
  }, [key, canTrack]);
  async function toggleFull() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch { /* Browser can disable fullscreen. */ }
  }
  let wait = 'В расписании нет активного показа.';
  if (!screen) wait = 'Добавьте билборд в реестре.';
  else if (error) wait = error;
  else if (!knownScreen) wait = 'Получаем плейлист…';
  else if (knownScreen.status !== 'В сети') wait = 'Состояние экрана: ' + knownScreen.status.toLowerCase() + '.';
  else if (slot && broken === key) wait = 'Не удалось воспроизвести материал. Проверьте файл и поддержку кодека браузером.';
  return <div className="player-page">
    <header className="player-header"><a className="brand" href="/"><img src="/static/mark.svg" alt=""/><span>БАМБОЛБИ<small>Виртуальный билборд</small></span></a>
      <LinkButton href="/">Панель управления</LinkButton></header>
    <main className="player-main">
      <div className="player-title"><div><h1>Виртуальный билборд</h1><p>Предпросмотр показов на выбранном экране</p></div>
        <Select label="Выбрать билборд" value={screen} options={screens.data?.length ?
          screens.data.map(row => ({value:row.id,label:row.name})) : [{value:'',label:'Нет экранов'}]} onChange={value => {setScreen(value);setPaused(false);setReady('');setBroken('');}}/></div>
      <div ref={stage} className="player-stage">
        <div className="player-picture">
          {slot && broken !== key && !error ? <>
            <MediaView key={key} item={slot} className="player-ad" onLoad={isVideo ? () => {} : () => setReady(key)}
              onPlaying={() => setReady(key)} onWaiting={() => setReady('')} onError={() => setBroken(key)} videoRef={video}/>
            {paused && <div className="pause-indicator"><Icon name="pause" size={32}/> На паузе</div>}
          </> : <div className="player-wait"><div><Icon name="screen" size={32}/></div><h2>Ожидание показа</h2><p>{wait}</p></div>}
        </div>
        <div className="cycle-track"><i style={{ width: progress + '%' }}/></div>
        <div className="player-controls"><div className="player-campaign"><b>{slot && !error ? slot.campaign : knownScreen?.name || 'Билборд'}</b>
          {slot && !error && <small>{slot.media} · {slot.cycle} сек.</small>}</div>
          <div><Button icon={paused ? 'play' : 'pause'} disabled={!slot || Boolean(error)} onClick={() => setPaused(!paused)}>{paused ? 'Продолжить' : 'Пауза'}</Button>
            <Button icon="expand" onClick={toggleFull}>{full ? 'Выйти из полного экрана' : 'Полный экран'}</Button></div></div>
      </div>
      <div className="player-foot">{knownScreen && <Badge>{knownScreen.status}</Badge>}<span><Icon name="clock" size={16}/> Расписание · МСК</span></div>
    </main>
  </div>;
}
