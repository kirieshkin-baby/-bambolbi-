import { statSync } from 'node:fs';
import { join } from 'node:path';

export function seed({ db, put, uploads, root, copyFileSync, now, DAY, MOSCOW }) {
  const screens = [
    ['Тверская · 12', 'Москва, Тверская улица, 12', 55.764, 37.6061, '1920×1080', 'В сети'],
    ['Садовое · Павелецкая', 'Москва, Павелецкая площадь, 2', 55.7295, 37.638, '1920×1080', 'В сети'],
    ['Арбат · Новый', 'Москва, улица Новый Арбат, 24', 55.7523, 37.5889, '2560×1440', 'В сети'],
    ['Ленинградский · 36', 'Москва, Ленинградский проспект, 36', 55.7905, 37.5591, '1920×1080', 'Нет связи'],
    ['Ходынка · Парк', 'Москва, Ходынский бульвар, 4', 55.7906, 37.5256, '3840×2160', 'Обслуживание'],
    ['Цветной · 15', 'Москва, Цветной бульвар, 15', 55.771, 37.6216, '1920×1080', 'В сети']
  ].map(([name, address, lat, lon, resolution, status]) => put('screens', { name, address, lat, lon, resolution, status }));
  const campaigns = [
    ['Город в движении', 'Велоклуб «Ритм»', 1400, 'Активна'],
    ['Кофе по пути', 'Кофейня «Зёрна»', 1000, 'Активна'],
    ['Линии города', 'Студия «Контур»', 850, 'Активна'],
    ['Обновление витрин', 'Магазин «Местное»', 1200, 'Черновик']
  ].map(([name, customer, target, status]) => put('campaigns', { name, customer, target, status }));
  const materials = [
    ['Ритм · Город в движении', 'rhythm.webp', 'Согласован'],
    ['Зёрна · Кофе по пути', 'coffee.webp', 'Согласован'],
    ['Контур · Линии города', 'lines.webp', 'Согласован'],
    ['Местное · Новая коллекция', 'local.webp', 'На согласовании']
  ].map(([name, file, status]) => {
    const target = join(uploads, file);
    copyFileSync(join(root, 'static', 'demo', file), target);
    return put('media', { name, file, mime: 'image/webp', size: statSync(target).size, status });
  });
  const minute = Math.floor(now / 60000) * 60000;
  const cycle = 10;
  const slots = [0, 1, 2].map(index => put('slots', { screen_id: screens[index], campaign_id: campaigns[index], media_id: materials[index],
    starts: minute - (index + 1) * 3600000, ends: minute + (index + 2) * 3600000, cycle }));
  put('slots', { screen_id: screens[5], campaign_id: campaigns[1], media_id: materials[1], starts: minute + 2 * 3600000, ends: minute + 5 * 3600000, cycle: 15 });

  const localDay = Math.floor((now + MOSCOW) / DAY) * DAY - MOSCOW;
  const counts = [112, 171, 145, 238, 207, 274, 186];
  const insertEvent = db.prepare(`INSERT INTO events(at,slot_id,cycle_start,screen_id,campaign_id,media_id,screen,campaign,media)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  const names = ['Тверская · 12', 'Садовое · Павелецкая', 'Арбат · Новый'];
  const titles = ['Город в движении', 'Кофе по пути', 'Линии города'];
  const ads = ['Ритм · Город в движении', 'Зёрна · Кофе по пути', 'Контур · Линии города'];
  counts.forEach((count, day) => {
    const start = localDay - (6 - day) * DAY;
    const end = day === 6 ? now - 1000 : start + 22 * 3600000;
    const spread = Math.max(0, end - start);
    const attainable = Math.min(count, Math.floor(spread / 1000));
    for (let n = 0; n < attainable; n++) {
      const index = n % 3;
      const at = start + Math.floor(spread * (n + 1) / attainable);
      // Imported demo history represents historical slots distinct from today's schedule.
      insertEvent.run(at, -(index + 1), at - cycle * 1000, screens[index], campaigns[index], materials[index],
        names[index], titles[index], ads[index]);
    }
  });

  const due = (offset) => new Date(localDay + MOSCOW + offset * DAY).toISOString().slice(0, 10);
  [
    ['Проверить сценарии приёмки', 'Анна Смирнова', 3, 'К выполнению'],
    ['Подготовить материалы к защите', 'Иван Волков', 5, 'К выполнению'],
    ['Проверить расписание и плеер', 'Иван Волков', 1, 'В работе'],
    ['Настроить демонстрационные экраны', 'Анна Смирнова', 0, 'Готово']
  ].forEach(([name, owner, offset, status]) => put('tasks', { name, owner, due: due(offset), status }));
  put('risks', { name: 'Недоступна внешняя карта', severity: 'Средний', response: 'Сохранить адреса и координаты в реестре для демонстрации без интернета.' });
  put('risks', { name: 'Несовместимый видеокодек', severity: 'Низкий', response: 'Проверить воспроизведение в браузере заранее и подготовить резервный материал PNG.' });
  db.prepare('INSERT INTO audit(at,actor,action,object) VALUES(?,?,?,?)').run(now, 'Система', 'Добавила', 'Демонстрационные данные');
}

