import React, { useState } from 'react';
import { Badge, Button, Empty, Icon, IconButton, LinkButton, MediaView, Modal, PageTitle, Panel, Progress, Search, Select, State, Table, api, campaignStatuses, humanSize, num, percent, screenStatuses, useData } from './shared.jsx';

const all = (label) => ({ value:'', label });
export function Actions({ table, row, edit, remove }) {
  return <div className="row-actions"><IconButton icon="edit" label="Редактировать" onClick={() => edit(table,row)}/>
    <IconButton icon="trash" label="Удалить" onClick={() => remove(table,row)}/></div>;
}
export function Screens({ revision, edit, remove }) {
  const {data, error} = useData('/api/screens',revision);
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('');
  const [selected,setSelected] = useState(null);
  const rows = (data || []).filter(row => (!status || row.status === status) && (row.name + ' ' + row.address).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  const map = data?.find(row => row.id === selected);
  const mapLocation = map ? new URLSearchParams({mlat:map.lat, mlon:map.lon,
    bbox:[Math.max(-180,map.lon-.03), Math.max(-85,map.lat-.018), Math.min(180,map.lon+.03), Math.min(85,map.lat+.018)].join(','), layer:'mapnik'}) : null;
  return <>
    <PageTitle title="Билборды" description="Реестр экранов рекламной сети"><Button primary icon="plus" onClick={() => edit('screens')}>Добавить билборд</Button></PageTitle>
    <Panel title="Все экраны" subtitle={data && num(data.length) + ' в реестре'}>
      <div className="filters"><Search value={search} onChange={setSearch} placeholder="Поиск по названию или адресу"/><Select label="Статус экрана" value={status} onChange={setStatus} options={[all('Все статусы'),...screenStatuses]}/></div>
      <State error={error} loading={!data}/>
      {rows.length > 0 && <Table headers={['Билборд','Разрешение','Статус','Действия']}>{rows.map(row => <tr key={row.id}>
        <td><div className="cell-combo"><span className="entity-icon"><Icon name="screen" size={18}/></span><div><b>{row.name}</b><small>{row.address}</small></div></div></td>
        <td className="nowrap">{row.resolution}</td><td><Badge>{row.status}</Badge></td>
        <td><div className="row-actions"><IconButton icon="pin" label={'На карте: ' + row.name} onClick={() => setSelected(row.id)}/>
          <a className="icon-button" href={'/player?screen=' + row.id} aria-label={'Плеер: ' + row.name} title="Открыть плеер" target="_blank" rel="noopener"><Icon name="play" size={17}/></a>
          <Actions table="screens" row={row} edit={edit} remove={remove}/></div></td>
      </tr>)}</Table>}
      {data && !rows.length && <Empty icon="screen">Экраны по этому запросу не найдены.</Empty>}
    </Panel>
    {map && <Modal title={map.name} close={() => setSelected(null)}
      footer={<LinkButton icon="pin" href={'https://www.openstreetmap.org/?mlat=' + map.lat + '&mlon=' + map.lon + '#map=15/' + map.lat + '/' + map.lon} target="_blank" rel="noopener">Открыть OpenStreetMap</LinkButton>}>
      <div className="map-info"><b>{map.address}</b><p>{map.lat}, {map.lon} · Для внешней карты нужен интернет.</p></div>
      {Math.abs(map.lat) < 85 && <iframe className="map" title={'Карта: ' + map.name} src={'https://www.openstreetmap.org/export/embed.html?' + mapLocation} referrerPolicy="no-referrer"/>}
    </Modal>}
  </>;
}
export function Campaigns({ revision, edit, remove, notify, changed }) {
  const {data, error} = useData('/api/campaigns',revision,5000);
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(null);
  const rows = (data || []).filter(row => !status || row.status === status);
  async function toggle(row) {
    setBusy(row.id);
    try {
      const next = row.status === 'Активна' ? 'На паузе' : 'Активна';
      await api('/api/campaigns/' + row.id,{method:'PATCH',body:{...row,status:next}});
      changed(); notify(next === 'Активна' ? 'Кампания возобновлена.' : 'Кампания поставлена на паузу.');
    } catch (e) { notify(e.message,true); }
    finally { setBusy(null); }
  }
  return <>
    <PageTitle title="Кампании" description="Управляйте кампаниями и отслеживайте выполнение плана"><Button primary icon="plus" onClick={() => edit('campaigns')}>Создать кампанию</Button></PageTitle>
    <div className="filters standalone"><Select label="Статус кампании" value={status} onChange={setStatus} options={[all('Все статусы'),...campaignStatuses]}/></div>
    <State error={error} loading={!data}/>
    <div className="cards-grid">{rows.map(row => <Panel className="campaign-card" key={row.id}>
      <div className="card-top"><span className="entity-icon"><Icon name="campaign" size={20}/></span><Badge>{row.status}</Badge></div>
      <h2>{row.name}</h2><p>{row.customer}</p>
      <div className="campaign-totals"><div><span>Показы</span><b>{num(row.impressions)} / {num(row.target)}</b></div><div><span>Слоты</span><b>{num(row.slots)}</b></div></div>
      <Progress value={percent(row.impressions,row.target)}/>
      <div className="card-footer"><div>{['Активна','На паузе'].includes(row.status) && <Button className="small" icon={row.status === 'Активна' ? 'pause' : 'play'} disabled={busy === row.id} onClick={() => toggle(row)}>{row.status === 'Активна' ? 'На паузу' : 'Возобновить'}</Button>}</div>
        <Actions table="campaigns" row={row} edit={edit} remove={remove}/></div>
    </Panel>)}</div>
    {data && !rows.length && <Panel><Empty icon="campaign">Кампаний с этим статусом пока нет.</Empty></Panel>}
  </>;
}
export function Library({ revision, edit, remove, notify, changed }) {
  const {data, error} = useData('/api/media',revision);
  const [preview,setPreview] = useState(null);
  const [busy,setBusy] = useState(null);
  const item = data?.find(row => row.id === preview);
  async function approve(row) {
    setBusy(row.id);
    try {
      await api('/api/media/' + row.id,{method:'PATCH',body:{name:row.name,status:'Согласован'}});
      changed(); notify('Материал согласован для показа.');
    } catch (e) { notify(e.message,true); }
    finally { setBusy(null); }
  }
  return <>
    <PageTitle title="Медиатека" description="Материалы для рекламных кампаний"><Button primary icon="upload" onClick={() => edit('media')}>Загрузить материал</Button></PageTitle>
    <State error={error} loading={!data}/>
    <div className="cards-grid">{data?.map(row => <Panel className="media-card" key={row.id}>
      <button type="button" className="media-cover" onClick={() => setPreview(row.id)} aria-label={'Предпросмотр: ' + row.name}><MediaView item={row}/><span><Icon name="expand" size={17}/></span></button>
      <div className="media-body"><div className="media-meta"><span>{row.mime.split('/')[1].toUpperCase()} · {humanSize(row.size)}</span><Badge>{row.status}</Badge></div>
        <h2>{row.name}</h2><div className="card-footer"><div>{row.status !== 'Согласован' && <Button className="small" icon="check" disabled={busy === row.id} onClick={() => approve(row)}>Согласовать</Button>}</div>
        <Actions table="media" row={row} edit={edit} remove={remove}/></div></div>
    </Panel>)}</div>
    {data && !data.length && <Panel><Empty icon="image">Загрузите первый рекламный материал.</Empty></Panel>}
    {item && <Modal title={item.name} close={() => setPreview(null)}><div className="media-preview"><MediaView item={item} controls/></div></Modal>}
  </>;
}
