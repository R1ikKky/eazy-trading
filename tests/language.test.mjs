import test from 'node:test';
import assert from 'node:assert/strict';
import {currentLanguage,initializeLanguage,setLanguage,t,tr,locale} from '../frontend/src/i18n/language.ts';

test('English is the default even without browser storage',()=>{
 initializeLanguage();assert.equal(currentLanguage(),'en');assert.equal(locale(),'en-US');
 assert.equal(t('Журнал сделок'),'Trade journal');
 assert.equal(t('<button aria-label="Следующая свеча">Следующая свеча</button>'),'<button aria-label="Next candle">Next candle</button>');
});
test('template interpolation preserves user content and escaped HTML exactly',()=>{
 setLanguage('en');const name='Новая сессия <b>Сделка</b>',notes='Сессии · мои решения';
 assert.equal(tr`Название сессии: ${name} · Заметка: ${notes}`,`Session name: ${name} · Note: ${notes}`);
 assert.equal(tr`<span>${'&lt;Сессии&gt;'}</span> Сессии`,'<span>&lt;Сессии&gt;</span> Sessions');
});
test('Russian restores the original interface copy and date locale',()=>{
 setLanguage('ru');assert.equal(locale(),'ru-RU');assert.equal(t('Настройки профиля'),'Настройки профиля');assert.equal(tr`Свеча ${4} из ${20}`,'Свеча 4 из 20');setLanguage('en');
});
test('English phrases respect word boundaries and punctuation',()=>{
 setLanguage('en');assert.equal(t('Паттерн XABCD'),'Pattern XABCD');assert.equal(t('Линия тренда · Esc — отмена'),'Trend line · Esc — cancel');assert.equal(t('АвторскийСессииТекст'),'АвторскийСессииТекст');
});
