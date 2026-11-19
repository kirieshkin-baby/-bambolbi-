import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './dashboard.jsx';
import { Campaigns, Library, Screens } from './catalogs.jsx';
import { Audit, Project, Reports, Schedule } from './operations.jsx';
import EditForm, { ConfirmDelete } from './forms.jsx';
import Player from './player.jsx';
import { Icon, IconButton, LinkButton, fullDate, hm } from './shared.jsx';

const nav = [
  ['overview','Обзор','dashboard',Dashboard],
  ['screens','Билборды','screen',Screens],
  ['campaigns','Кампании','campaign',Campaigns],
  ['media','Медиатека','image',Library],
  ['schedule','Расписание','calendar',Schedule],
  ['reports','Отчёты','chart',Reports],
  ['audit','Журнал изменений','history',Audit],
  ['project','Проект','project',Project],
];
function route() {
  const hash = location.hash.slice(1);
  return nav.some(row => row[0] === hash) ? hash : 'overview';
}
function Shell() {
  const [page,setPage] = useState(route);
  const [sidebar,setSidebar] = useState(false);
  const [revision,setRevision] = useState(0);
  const [editor,setEditor] = useState(null);
  const [toast,setToast] = useState(null);
  const [time,setTime] = useState(Date.now());
  const toastTimer = useRef();
  useEffect(() => {
    const navigate = () => {setPage(route());setSidebar(false);window.scrollTo(0,0);};
    const onKey = event => {if (event.key === 'Escape') setSidebar(false);};
    window.addEventListener('hashchange',navigate);
    window.addEventListener('keydown',onKey);
    const timer = setInterval(() => setTime(Date.now()),15000);
    return () => {
      window.removeEventListener('hashchange',navigate);
      window.removeEventListener('keydown',onKey);
      clearInterval(timer);clearTimeout(toastTimer.current);
    };
  },[]);
  const [,label,,Section] = nav.find(row => row[0] === page);
  useEffect(() => { document.title = label + ' — БАМБОЛБИ'; }, [label]);
  const changed = () => setRevision(v => v + 1);
  const notify = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({message,error});
    toastTimer.current = setTimeout(() => setToast(null),4500);
  };
  const edit = (table,row) => setEditor({table,row});
  const remove = (table,row) => setEditor({table,row,delete:true});
  const close = () => setEditor(null);
  const saved = message => {changed();close();notify(message);};
  const navItem = ([key,name,icon]) => <a key={key} href={'#' + key} aria-current={page === key ? 'page' : undefined} onClick={() => setSidebar(false)}>
    <Icon name={icon} size={19}/><span>{name}</span>{page === key && <span className="active-mark"/>}</a>;
  return <div className="layout">
    {sidebar && <button type="button" className="scrim" aria-label="Закрыть меню" onClick={() => setSidebar(false)}/>}
    <aside className={'sidebar ' + (sidebar ? 'open' : '')}>
      <a className="brand" href="#overview" onClick={() => setSidebar(false)}><img src="/static/mark.svg" alt=""/><span>БАМБОЛБИ<small>Управление билбордами</small></span></a>
      <nav aria-label="Основная навигация">
        <div className="nav-label">Управление</div>{nav.slice(0,5).map(navItem)}
        <div className="nav-label">Аналитика и проект</div>{nav.slice(5).map(navItem)}
      </nav>
      <div className="sidebar-foot">
        <a className="sidebar-player" href="/player" target="_blank" rel="noopener"><span><Icon name="play" size={18}/></span><b>Виртуальный плеер</b><Icon name="expand" size={15}/></a>
        <div className="profile"><span>А</span><div><b>Администратор</b><small>Демо-среда</small></div></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><IconButton icon="menu" label="Открыть меню" onClick={() => setSidebar(!sidebar)} aria-expanded={sidebar}/>
          <span>Рабочая область</span><Icon name="chevron" size={14}/><b>{label}</b></div>
        <div className="topbar-right"><time><Icon name="calendar" size={16}/><span>{fullDate(time)}</span></time><span className="time-pill"><Icon name="clock" size={15}/> {hm(time)} МСК</span></div>
      </header>
      <main className="content" id="main">
        <Section revision={revision} edit={edit} openForm={edit} remove={remove} changed={changed} notify={notify}/>
      </main>
    </div>
    {editor && (editor.delete ? <ConfirmDelete {...editor} close={close} saved={saved}/> : <EditForm {...editor} close={close} saved={saved}/>)}
    {toast && <div role={toast.error ? 'alert' : 'status'} className={'toast ' + (toast.error ? 'toast-error' : '')}>
      <Icon name={toast.error ? 'warning' : 'check'} size={19}/>{toast.message}<IconButton icon="close" label="Скрыть уведомление" onClick={() => setToast(null)}/>
    </div>}
  </div>;
}
const player = location.pathname === '/player';
if (player) document.title = 'Виртуальный билборд — БАМБОЛБИ';
createRoot(document.getElementById('root')).render(player ? <Player/> : <Shell/>);
