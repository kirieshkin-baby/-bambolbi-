import React, { useState } from 'react';
import { api, Button, campaignStatuses, Icon, Modal, moscowInput, screenStatuses, State, taskStatuses, useData } from './shared.jsx';

const fields = {
  screens: [['name','Название'],['address','Адрес','text',250],['lat','Широта','number',-90,90,'any'],['lon','Долгота','number',-180,180,'any'],['resolution','Разрешение','text',16],['status','Статус',screenStatuses]],
  campaigns: [['name','Название'],['customer','Заказчик'],['target','План показов','number',1,1000000000,1],['status','Статус',campaignStatuses]],
  media: [['name','Название'],['status','Статус',['На согласовании','Согласован']]],
  slots: [['screen_id','Билборд','screens'],['campaign_id','Кампания','campaigns'],['media_id','Материал','media'],['starts','Начало · МСК','datetime-local'],['ends','Окончание · МСК','datetime-local'],['cycle','Цикл показа, сек.','number',3,120,1]],
  tasks: [['name','Название'],['owner','Ответственный'],['due','Срок','date'],['status','Статус',taskStatuses]],
  risks: [['name','Название'],['severity','Значимость',['Низкий','Средний','Высокий']],['response','Меры реагирования','textarea',2000]],
};
const titles = {
  screens:['Добавить билборд','Редактировать билборд'], campaigns:['Создать кампанию','Редактировать кампанию'],
  media:['Загрузить материал','Редактировать материал'], slots:['Создать слот','Редактировать слот'],
  tasks:['Добавить задачу','Редактировать задачу'], risks:['Добавить риск','Редактировать риск']
};
function initial(table, row, defaults) {
  if (row) return table === 'slots' ? { ...row, starts: moscowInput(row.starts), ends: moscowInput(row.ends) } : row;
  const now = Math.floor(Date.now() / 60000) * 60000;
  return {
    screens: { status:'В сети', resolution:'1920×1080' },
    campaigns: { status:'Черновик' },
    media: {},
    slots: { starts: moscowInput(defaults?.starts ?? now), ends: moscowInput((defaults?.starts ?? now) + 3600000), cycle: 10, screen_id: defaults?.screen_id },
    tasks: { due: moscowInput(now).slice(0,10), status:'К выполнению' },
    risks: { severity:'Средний' }
  }[table];
}
export default function EditForm({ table, row, defaults, close, saved }) {
  const [values, setValues] = useState(() => initial(table, row, defaults));
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const screenData = useData(table === 'slots' ? '/api/screens' : null);
  const campaignData = useData(table === 'slots' ? '/api/campaigns' : null);
  const mediaData = useData(table === 'slots' ? '/api/media' : null);
  const sources = { screens: screenData.data, campaigns: campaignData.data, media: mediaData.data?.filter(m => m.status === 'Согласован') };
  const loadError = screenData.error || campaignData.error || mediaData.error;
  const isUpload = table === 'media' && !row;
  const currentFields = isUpload ? [['name','Название (необязательно)']] : fields[table];
  const update = (key, value) => setValues(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (isUpload && !file) { setError('Выберите файл для загрузки.'); return; }
    if (isUpload && file.size > 30 * 1024 * 1024) { setError('Размер файла превышает 30 МБ.'); return; }
    setBusy(true);
    try {
      if (isUpload) {
        const query = new URLSearchParams({ filename: file.name, name: values.name?.trim() || '' });
        await api('/api/media?' + query, {method:'POST', body:file});
      } else {
        const body = Object.fromEntries(currentFields.map(([key]) => [key, values[key]]));
        await api('/api/' + table + (row ? '/' + row.id : ''), { method: row ? 'PATCH' : 'POST', body });
      }
      saved(isUpload ? 'Материал загружен на согласование.' : 'Изменения сохранены.');
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return <Modal title={titles[table][row ? 1 : 0]} close={() => { if (!busy) close(); }}
    footer={<><Button onClick={close} disabled={busy}>Отмена</Button><Button primary type="submit" form="edit-form" disabled={busy}>{busy ? 'Сохраняем…' : isUpload ? 'Загрузить' : 'Сохранить'}</Button></>}>
    <form id="edit-form" onSubmit={submit} className="edit-form">
      {isUpload && <label className="file-picker"><Icon name="upload" size={25}/><b>{file?.name || 'Выберите файл'}</b><span>PNG, JPEG, WebP, MP4 или WebM · до 30 МБ</span>
        <input type="file" aria-label="Медиафайл" accept=".png,.jpg,.jpeg,.webp,.mp4,.webm" onChange={e => setFile(e.target.files[0] || null)}/></label>}
      {currentFields.map(([key,label,type='text',size,minOrMax,step]) => {
        const collection = Object.hasOwn(sources, type);
        const options = collection ? sources[type]?.map(r => ({value:r.id, label:r.name})) || [] :
          Array.isArray(type) ? type.map(value => ({value,label:value})) : null;
        return <label key={key} className={'form-field ' + (['name','address','customer','response'].includes(key) ? 'full' : '')}>
          <span>{label}</span>
          {options ? <span className="select-wrap"><select value={values[key] ?? ''} required onChange={e => update(key,e.target.value)}>
            {collection && <option value="" disabled>{sources[type] ? 'Выберите запись' : 'Загрузка…'}</option>}
            {options.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}
          </select><Icon name="down" size={15}/></span> :
            type === 'textarea' ? <textarea rows="4" maxLength={size} required value={values[key] ?? ''} onChange={e => update(key, e.target.value)}/> :
            <input type={type} value={values[key] ?? ''} required={!isUpload} maxLength={type === 'text' ? size || 140 : undefined}
              min={type === 'number' ? size : undefined} max={type === 'number' ? minOrMax : undefined}
              step={step} onChange={e => update(key,e.target.value)}/>}
        </label>;
      })}
      {table === 'slots' && sources.media?.length === 0 && <p className="form-note">Согласуйте хотя бы один материал в медиатеке.</p>}
      <State error={error || loadError}/>
    </form>
  </Modal>;
}
export function ConfirmDelete({ table, row, close, saved }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api('/api/' + table + '/' + row.id, {method:'DELETE'});
      saved('Запись удалена.');
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <Modal title="Удалить запись?" close={() => { if (!busy) close(); }}
    footer={<><Button disabled={busy} onClick={close}>Отмена</Button><Button className="danger" disabled={busy} icon="trash" onClick={remove}>{busy ? 'Удаляем…' : 'Удалить'}</Button></>}>
    <p>Будет удалена запись «{row.name || row.screen + ' · ' + row.campaign}».</p><State error={error}/>
  </Modal>;
}
