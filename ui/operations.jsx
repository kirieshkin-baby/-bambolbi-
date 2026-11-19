import React, { useEffect, useState } from 'react';
import { Actions } from './catalogs.jsx';
import { Badge, Button, Chart, Empty, Icon, IconButton, LinkButton, PageTitle, Panel, Progress, Search, Select, State, Table, api, dayLabel, dayStart, hm, instant, num, percent, taskStatuses, useData } from './shared.jsx';

const DAY = 86400000;
const tabs = (value, set, options) => <div className="segments">{options.map(([key,label,icon]) =>
  <Button key={key} icon={icon} aria-pressed={value === key} onClick={() => set(key)}>{label}</Button>)}</div>;
const optionsFor = (screens) => [{value:'',label:'Все экраны'}, ...(screens || []).map(row => ({value:row.id,label:row.name}))];
const slotStatus = (row, now) => row.ends <= now ? 'Завершён' : row.starts > now ? 'Запланирован' :
  row.screen_status === 'В сети' && row.campaign_status === 'Активна' && row.media_status === 'Согласован' ? 'Идёт показ' : 'На паузе';
function startOfWeek(now) {
  const today = dayStart(now);
  return today - ((new Date(today + 10800000).getUTCDay() + 6) % 7) * DAY;
}
export function Schedule({ revision, edit, remove }) {
  const {data,error} = useData('/api/slots',revision,5000);
  const screens = useData('/api/screens',revision);
  const [view,setView] = useState('week');
  const [screen,setScreen] = useState('');
  const [week,setWeek] = useState(() => startOfWeek(Date.now()));
  const now = Date.now();
  const rows = (data || []).filter(row => !screen || row.screen_id === Number(screen));
  const days = Array.from({length:7}, (_, i) => week + DAY * i);
  return <>
    <PageTitle title="Расписание" description="Планируйте слоты показов по московскому времени"><Button primary icon="plus" onClick={() => edit('slots')}>Создать слот</Button></PageTitle>
    <Panel title={view === 'week' ? 'Недельный календарь' : 'Список слотов'}
        subtitle={view === 'week' ? dayLabel(week) + ' — ' + dayLabel(week + 6 * DAY) + ' · МСК' : 'Время начала и окончания · МСК'}
        action={tabs(view,setView,[['week','Неделя','calendar'],['list','Список','list']])}>
      <div className="filters schedule-filters">
        <Select label="Фильтр по экрану" options={optionsFor(screens.data)} value={screen} onChange={setScreen}/>
        {view === 'week' && <div className="week-nav"><IconButton icon="back" label="Предыдущая неделя" onClick={() => setWeek(week - 7 * DAY)}/>
          <Button className="small" onClick={() => setWeek(startOfWeek(Date.now()))}>Сегодня</Button><IconButton icon="chevron" label="Следующая неделя" onClick={() => setWeek(week + 7 * DAY)}/></div>}
      </div>
      <State error={error || screens.error} loading={!data}/>
      {data && view === 'week' && <div className="week-scroll"><div className="week-grid">
        {days.map((day,i) => <div className="week-day" key={day}>
          <div className={'week-date ' + (day === dayStart(now) ? 'current-day' : '')}><span>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</span><b>{dayLabel(day)}</b></div>
          {rows.filter(row => row.starts < day + DAY && row.ends > day).map(row =>
            <button key={row.id} type="button" className={'slot-tile ' + (slotStatus(row, now) === 'Идёт показ' ? 'playing' : '')} onClick={() => edit('slots',row)}>
              <time>{row.starts < day ? '00:00' : hm(row.starts)}–{row.ends >= day + DAY ? '24:00' : hm(row.ends)}</time>
              <b>{row.campaign}</b><span>{row.screen}</span>
            </button>)}
        </div>)}
      </div></div>}
      {data && view === 'list' && (rows.length ? <Table headers={['Период · МСК','Билборд и кампания','Материал','Цикл','Статус','Действия']}>{rows.map(row => <tr key={row.id}>
        <td className="nowrap"><b>{dayLabel(row.starts)} · {hm(row.starts)}</b><small>до {dayLabel(row.ends)} · {hm(row.ends)}</small></td>
        <td><b>{row.screen}</b><small>{row.campaign}</small></td>
        <td>{row.media}</td><td className="nowrap">{row.cycle} сек.</td><td><Badge>{slotStatus(row,now)}</Badge></td>
        <td><Actions table="slots" row={row} edit={edit} remove={remove}/></td>
      </tr>)}</Table> : <Empty icon="calendar">В расписании пока нет слотов.</Empty>)}
    </Panel>
  </>;
}

function EventsTable({ rows }) {
  return <Table headers={['Время · МСК','Билборд','Кампания','Материал']}>{rows.map(row => <tr key={row.id}>
    <td className="nowrap">{instant(row.at)}</td><td><b>{row.screen}</b></td><td>{row.campaign}</td><td>{row.media}</td>
  </tr>)}</Table>;
}
export function Reports({ revision, notify }) {
  const [screen,setScreen] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const [printRows,setPrintRows] = useState(null);
  const [printing,setPrinting] = useState(false);
  const filters = new URLSearchParams({ screen, q: search.trim() });
  const screens = useData('/api/screens',revision);
  const {data,error} = useData('/api/report?' + filters + '&page=' + page,revision,5000);
  useEffect(() => {
    if (!printRows) return;
    const timer = setTimeout(() => {
      window.print();
      setPrintRows(null);
      setPrinting(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [printRows]);
  async function print() {
    setPrinting(true);
    try { setPrintRows((await api('/api/report?' + filters + '&print=1')).events); }
    catch (e) { notify(e.message, true); setPrinting(false); }
  }
  return <>
    <PageTitle title="Отчёты" description="Динамика показов, выполнение планов и журнал событий">
      <Button icon="print" onClick={print} disabled={printing || !data}>Печать / PDF</Button>
      <LinkButton primary icon="download" href={'/api/report/csv?' + filters}>Скачать CSV</LinkButton>
    </PageTitle>
    <State error={error || screens.error} loading={!data}/>
    {data && <>
      <div className="reports-top">
        <Panel title="Динамика показов" subtitle="Зарегистрировано за последние 7 дней" className="chart-panel"><Chart rows={data.timeline}/></Panel>
        <Panel title="План кампаний" subtitle="Зарегистрировано / запланировано"><div className="report-campaigns">{data.campaigns.map(row =>
          <div key={row.id}><div><b>{row.name}</b><span>{num(row.impressions)} / {num(row.target)}</span></div><Progress value={percent(row.impressions,row.target)}/></div>)}
          {!data.campaigns.length && <Empty icon="campaign">Кампаний пока нет.</Empty>}</div></Panel>
      </div>
      <Panel title="Журнал показов" subtitle={num(data.total) + ' записей по заданным фильтрам'}>
        <div className="filters"><Search value={search} onChange={value => {setSearch(value);setPage(1);}} placeholder="Поиск по журналу"/>
          <Select label="Фильтр журнала по экрану" options={optionsFor(screens.data)} value={screen} onChange={value => {setScreen(value);setPage(1);}}/></div>
        <div className={printRows ? 'screen-events' : ''}>{data.events.length ? <EventsTable rows={data.events}/> : <Empty icon="history">По этому запросу нет показов.</Empty>}</div>
        {printRows && <div className="print-events"><EventsTable rows={printRows}/></div>}
        {data.total > 20 && <div className="pagination"><IconButton icon="back" label="Предыдущая страница" disabled={page <= 1} onClick={() => setPage(page-1)}/>
          <span>{page} / {Math.ceil(data.total/20)}</span><IconButton icon="chevron" label="Следующая страница" disabled={page * 20 >= data.total} onClick={() => setPage(page+1)}/></div>}
      </Panel>
    </>}
  </>;
}
export function Audit({ revision }) {
  const {data,error} = useData('/api/audit',revision);
  return <>
    <PageTitle title="Журнал изменений" description="История действий администратора и системы"/>
    <Panel title="История операций" subtitle="Время указано по Москве">
      <State error={error} loading={!data}/>
      {data && (data.length ? <Table headers={['Дата и время · МСК','Пользователь','Действие','Объект']}>{data.map(row =>
        <tr key={row.id}><td className="nowrap">{instant(row.at)}</td><td>{row.actor}</td><td>{row.action}</td><td><b>{row.object}</b></td></tr>)}</Table> : <Empty icon="history"/>)}
    </Panel>
  </>;
}
export function Project({ revision, edit, remove, changed, notify }) {
  const [view,setView] = useState('tasks');
  const [busy,setBusy] = useState(null);
  const tasks = useData('/api/tasks',revision);
  const risks = useData('/api/risks',revision);
  async function move(row,status) {
    setBusy(row.id);
    try {
      await api('/api/tasks/' + row.id,{method:'PATCH',body:{...row,status}});
      changed(); notify('Статус задачи обновлён.');
    } catch (error) { notify(error.message,true); }
    finally { setBusy(null); }
  }
  return <>
    <PageTitle title="Проект" description="Задачи внедрения, сроки и риски">
      <Button primary icon="plus" onClick={() => edit(view)}>{view === 'tasks' ? 'Добавить задачу' : 'Добавить риск'}</Button>
    </PageTitle>
    <div className="filters standalone">{tabs(view,setView,[['tasks','Доска задач','project'],['risks','Реестр рисков','warning']])}</div>
    {view === 'tasks' ? <>
      <State error={tasks.error} loading={!tasks.data}/>
      {tasks.data && <div className="kanban">{taskStatuses.map(status => {
        const bucket = tasks.data.filter(row => row.status === status);
        return <section className="kanban-col" key={status}><div className="kanban-head"><Badge>{status}</Badge><span>{num(bucket.length)}</span></div>
          {bucket.map(row => <article className="task" key={row.id}><h2>{row.name}</h2><div className="task-detail"><Icon name="user" size={16}/>{row.owner}</div>
            <div className="task-detail"><Icon name="calendar" size={16}/>{row.due.split('-').reverse().join('.')}</div>
            <div className="task-actions"><Select label={'Статус: ' + row.name} options={taskStatuses} value={row.status} onChange={status => {if (busy !== row.id) move(row,status);}}/>
              <Actions table="tasks" row={row} edit={edit} remove={remove}/></div>
          </article>)}
          {!bucket.length && <p className="bucket-empty">Задач пока нет</p>}
        </section>;
      })}</div>}
    </> : <Panel title="Реестр рисков" subtitle="Значимость и меры реагирования">
      <State error={risks.error} loading={!risks.data}/>
      {risks.data && (risks.data.length ? <Table headers={['Риск','Значимость','Меры реагирования','Действия']}>{risks.data.map(row =>
        <tr key={row.id}><td><b>{row.name}</b></td><td><Badge>{row.severity}</Badge></td><td className="wrap">{row.response}</td>
          <td><Actions table="risks" row={row} edit={edit} remove={remove}/></td></tr>)}</Table> : <Empty icon="warning">Рисков пока нет.</Empty>)}
    </Panel>}
  </>;
}
