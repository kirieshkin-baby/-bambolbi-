import React from 'react';
import { Button, Chart, Empty, Icon, LinkButton, MediaView, PageTitle, Panel, State, Table, hm, num, useData } from './shared.jsx';

export default function Dashboard({ revision, openForm }) {
  const {data, error} = useData('/api/dashboard', revision, 5000);
  const stats = data && [
    ['Всего экранов', data.total, 'screen', 'lime', num(data.online) + ' в сети'],
    ['Экраны с показом', data.active, 'play', 'green-icon', 'Идут сейчас'],
    ['Показы сегодня', data.today, 'pulse', 'purple', 'За текущий день · МСК'],
    ['Требуют внимания', data.offline + data.maintenance, 'warning', 'peach', 'Нет связи или обслуживание'],
  ];
  return <>
    <PageTitle title="Обзор сети" description="Управление цифровыми билбордами и рекламными показами">
      <Button primary icon="plus" onClick={() => openForm('slots')}>Создать слот</Button>
    </PageTitle>
    <State error={error} loading={!data}/>
    {data && <>
      <div className="metrics">{stats.map(([label, value, icon, color, caption]) =>
        <div className="metric panel" key={label}>
          <div className="metric-top"><span>{label}</span><span className={'metric-icon ' + color}><Icon name={icon} size={19}/></span></div>
          <strong>{num(value)}</strong><small>{caption}</small>
        </div>)}</div>
      <div className="overview-grid">
        <Panel title="Динамика показов" subtitle="Зарегистрированные показы за последние 7 дней"
          className="chart-panel" action={<span className="subtle-label"><Icon name="calendar" size={15}/> 7 дней</span>}>
          <Chart rows={data.timeline}/>
        </Panel>
        <Panel title="Состояние сети" subtitle="Статусы виртуальных экранов" className="network-panel">
          <div className="network-body">
            <div className="network-ring" style={{'--ring': data.total ? `conic-gradient(#a9cd48 0% ${data.online / data.total * 100}%, #f3b36c ${data.online / data.total * 100}% ${(data.online + data.maintenance) / data.total * 100}%, #ed8f8c 0 100%)` : '#e9ede5'}}>
              <div><b>{num(data.total)}</b><span>экранов</span></div>
            </div>
            <div className="net-legend">
              {[['В сети', data.online, 'online'], ['Нет связи', data.offline, 'offline'], ['Обслуживание', data.maintenance, 'maintenance']].map(([label, count, color]) =>
                <div key={label}><i className={color}/><span>{label}</span><b>{num(count)}</b></div>)}
            </div>
          </div>
          <a href="#screens" className="panel-link">Открыть реестр<Icon name="chevron" size={15}/></a>
        </Panel>
      </div>
      <div className="overview-grid lower-grid">
        <Panel title="Текущие размещения" subtitle="Кампании, которые идут прямо сейчас" className="placements"
          action={<LinkButton href="#schedule" className="small">Расписание</LinkButton>}>
          {data.current.length ? <Table headers={['Билборд','Кампания','Завершение','Плеер']}>
            {data.current.map(row => <tr key={row.id}>
              <td><div className="cell-combo"><MediaView item={row} className="thumb"/><div><b>{row.screen}</b><small>{row.address}</small></div></div></td>
              <td>{row.campaign}</td><td className="nowrap">{hm(row.ends)} МСК</td>
              <td><a className="table-play" href={'/player?screen=' + row.screen_id} target="_blank" rel="noopener" title="Открыть плеер" aria-label={'Открыть плеер: ' + row.screen}><Icon name="play" size={16}/></a></td>
            </tr>)}
          </Table> : <Empty icon="calendar">Сейчас нет активных размещений.</Empty>}
        </Panel>
        <Panel title="Последние события" subtitle="Показы, полученные от плеера" className="recent-panel">
          {data.latest.length ? <div className="recent-list">{data.latest.slice(0, 3).map(row => <div className="recent-item" key={row.id}>
            <span className="recent-icon"><Icon name="play" size={15}/></span><div><b>{row.campaign}</b><small>{row.screen}</small></div><time>{hm(row.at)}</time>
          </div>)}</div> : <Empty icon="history">Событий пока нет.</Empty>}
          <a href="#reports" className="panel-link">Открыть отчёты<Icon name="chevron" size={15}/></a>
        </Panel>
      </div>
    </>}
  </>;
}
