import React, { useEffect, useRef, useState } from 'react';

const paths = {
  bolt: 'm13 2-9 12h7l-1 8 10-12h-7l1-8z',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  screen: 'M4 4h16a1 1 0 0 1 1 1v12H3V5a1 1 0 0 1 1-1z M8 21h8 M12 17v4',
  campaign: 'm3 10 15-5v14L3 14z M3 10H2v4h1 M7 15l2 5h3l-2-4 M22 9v6',
  image: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1z M3 9h18 M8 3v4 M16 3v4 M7 13h2 M12 13h2 M7 16h2',
  chart: 'M3 3v18h18 M8 16v-3 M13 16V8 M18 16V5',
  project: 'M3 5h7l2 2h9v13H3z M3 9h18',
  history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8 M3 3v5h5 M12 7v5l3 2',
  play: 'm8 5 12 7-12 7z',
  pause: 'M8 5v14 M16 5v14',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M20 12a8 8 0 0 0-14-5 M4 12a8 8 0 0 0 14 5',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'm9 6 6 6-6 6',
  down: 'm6 9 6 6 6-6',
  back: 'm15 6-6 6 6 6',
  warning: 'M12 8v5 M12 17h.01 M10.3 4a2 2 0 0 1 3.4 0l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3z',
  pulse: 'M2 12h4l3-7 4 14 3-7h6',
  check: 'm5 12 4 4L19 6',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 6v6l4 2',
  pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M15 15l5 5',
  edit: 'm14 5 5 5 M4 20l4-1 12-12-4-4L4 15z',
  trash: 'M3 6h18 M5 6l1 15h12l1-15 M9 6V3h6v3 M10 10v7 M14 10v7',
  close: 'm6 6 12 12 M18 6 6 18',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 16v4h16v-4',
  print: 'M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z M17 12h1',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  expand: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  film: 'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4'
};

export function Icon({ name, size = 20, ...attributes }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'bolt' ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...attributes}><path d={paths[name]}/></svg>;
}

export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const response = await fetch(path, body instanceof File ? { ...rest, body, headers: {'Content-Type': body.type || 'application/octet-stream'} } :
    { ...rest, ...(body ? { body: JSON.stringify(body), headers: {'Content-Type': 'application/json'} } : {}) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Запрос не выполнен. Попробуйте ещё раз.');
  }
  return response.json();
}

export function useData(path, revision = 0, interval = 0) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    let timer;
    async function load() {
      try {
        const data = await api(path, { signal: abort.signal });
        if (!abort.signal.aborted) setState({ data, error: '' });
      } catch (error) {
        if (!abort.signal.aborted) setState(previous => ({ ...previous, error: error.message }));
      } finally {
        if (interval && !abort.signal.aborted) timer = setTimeout(load, interval);
      }
    }
    load();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [path, revision, interval]);
  return state;
}
const locale = (options) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...options });
const number = new Intl.NumberFormat('ru-RU');
export const num = value => number.format(value || 0);
export const hm = value => locale({hour:'2-digit',minute:'2-digit'}).format(value);
export const dayLabel = value => locale({day:'numeric', month:'short'}).format(value).replace('.', '');
export const fullDate = value => locale({weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(value).replace(' г.', '');
export const instant = value => locale({day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(value);
export const moscowInput = value => new Date(value + 10800000).toISOString().slice(0, 16);
export const dayStart = value => Math.floor((value + 10800000) / 86400000) * 86400000 - 10800000;
export const percent = (actual, target) => Math.round(actual / target * 100);
export function humanSize(bytes) {
  return bytes >= 1024 * 1024 ? new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024)) + ' МБ' : num(Math.max(1, Math.round(bytes / 1024))) + ' КБ';
}

export const screenStatuses = ['В сети', 'Нет связи', 'Обслуживание'];
export const campaignStatuses = ['Черновик', 'Активна', 'На паузе', 'Завершена'];
export const taskStatuses = ['К выполнению', 'В работе', 'Готово'];
export const tones = {
  'В сети':'green', 'Активна':'green', 'Согласован':'green', 'Готово':'green',
  'Нет связи':'red', 'Высокий':'red', 'Обслуживание':'orange', 'На паузе':'orange', 'На согласовании':'orange', 'Средний':'orange',
  'Завершена':'blue', 'В работе':'blue', 'Идёт показ':'green', 'Запланирован':'blue', 'Завершён':'neutral'
};
export const Badge = ({ children }) => <span className={'badge ' + (tones[children] || 'neutral')}><i/>{children}</span>;
export function Button({ icon, primary, children, className = '', ...props }) {
  return <button className={`button ${primary ? 'primary' : ''} ${className}`} type="button" {...props}>
    {icon && <Icon name={icon} size={17}/>} {children}
  </button>;
}
export function LinkButton({ icon, primary, children, className = '', ...props }) {
  return <a className={`button ${primary ? 'primary' : ''} ${className}`} {...props}>{icon && <Icon name={icon} size={17}/>} {children}</a>;
}
export function IconButton({ icon, label, ...props }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon} size={17}/></button>;
}
export function PageTitle({ title, description, children }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
export function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={'panel ' + className}>{title && <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
export function Empty({ icon = 'list', children = 'Здесь пока нет записей.' }) {
  return <div className="empty"><Icon name={icon} size={26}/><p>{children}</p></div>;
}
export function State({ error, loading }) {
  return error ? <div className="alert" role="alert"><Icon name="warning"/>{error}</div> : loading ? <p className="loading">Загрузка…</p> : null;
}
export function Search({ value, onChange, placeholder = 'Поиск…' }) {
  return <label className="search"><Icon name="search" size={17}/><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/></label>;
}
export function Select({ label, options, value, onChange }) {
  return <label className="select-wrap"><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
    {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
  </select><Icon name="down" size={15}/></label>;
}
export function Table({ headers, children }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map((h, index) => <th scope="col" key={index}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function MediaView({ item, className = '', controls = false, onLoad, onError, onPlaying, onWaiting, videoRef }) {
  const url = item.url || '/media/' + item.file;
  return item.mime?.startsWith('video/') ?
    <video className={className} src={url} controls={controls} muted={!controls} autoPlay={!controls && Boolean(onLoad)} loop={!controls}
      playsInline preload={controls || onLoad ? 'auto' : 'metadata'} onLoadedData={onLoad}
      onPlaying={onPlaying} onWaiting={onWaiting} onError={onError} ref={videoRef}/> :
    <img className={className} src={url} alt={item.name || item.media} onLoad={onLoad} onError={onError}/>;
}
export function Modal({ title, children, close, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog className="modal" ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); close(); }}
      onClick={e => { if (e.target === ref.current) {
        const bounds = ref.current.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close();
      }}}>
    <div className="modal-head"><h2>{title}</h2><IconButton icon="close" label="Закрыть" onClick={close}/></div>
    <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{footer}</div>}
  </dialog>;
}
export function Progress({ value }) {
  return <div className="progress-row"><div className="progress" role="progressbar" aria-label="Выполнение плана" aria-valuenow={Math.min(100, value)}><i style={{ width: Math.min(100, value) + '%' }}/></div><b>{value}%</b></div>;
}
export function Chart({ rows }) {
  const [selected, setSelected] = useState(null);
  const max = Math.max(4, ...rows.map(v => v.count));
  const power = 10 ** Math.floor(Math.log10(max / 4));
  const step = Math.ceil(max / 4 / power) * power;
  const ceiling = step * 4;
  const points = rows.map((r, i) => [i * 100 / 6, 100 - r.count * 100 / ceiling]);
  const line = points.map(p => p.join(',')).join(' ');
  return <div className="chart" aria-label="График показов за семь дней">
    <div className="chart-y">{[4,3,2,1,0].map((n, i) => <span className="chart-scale" style={{ top: (i * 25) + '%' }} key={n}>{num(n * step)}</span>)}</div>
    <div className="chart-right">
      <div className="chart-canvas">
        <div className="chart-grid">{[0,1,2,3,4].map(i => <i key={i}/>)}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#c6e65d" stopOpacity=".45"/><stop offset="1" stopColor="#ebf4d1" stopOpacity=".28"/></linearGradient></defs>
          <polygon points={'0,100 ' + line + ' 100,100'} fill="url(#chart-fill)"/>
          <polyline points={line} fill="none" stroke="#819e2e" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
        {points.map(([left, top], index) => <button type="button" key={rows[index].time} className="chart-dot" style={{ left: left + '%', top: top + '%' }}
          aria-label={dayLabel(rows[index].time) + ' · ' + num(rows[index].count) + ' показов'}
          onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)}
          onClick={() => setSelected(selected === index ? null : index)}>
          {selected === index && <span className="chart-tip">{num(rows[index].count)} показов</span>}
        </button>)}
      </div>
      <div className="chart-x">{rows.map(r => <span key={r.time}>{dayLabel(r.time)}</span>)}</div>
    </div>
  </div>;
}
