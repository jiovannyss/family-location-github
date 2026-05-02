import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Privacy() {
  const [lang, setLang] = useState<'bg' | 'en'>('bg');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="container max-w-3xl flex items-center justify-between h-14 px-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Назад
            </Button>
          </Link>
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <Button size="sm" variant={lang === 'bg' ? 'default' : 'ghost'} onClick={() => setLang('bg')}>BG</Button>
            <Button size="sm" variant={lang === 'en' ? 'default' : 'ghost'} onClick={() => setLang('en')}>EN</Button>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl px-4 py-8 prose prose-slate dark:prose-invert">
        {lang === 'bg' ? <ContentBG /> : <ContentEN />}
      </main>
    </div>
  );
}

function ContentBG() {
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Политика за поверителност</h1>
      <p className="text-sm text-muted-foreground">Последно обновяване: май 2026</p>

      <h2 className="text-xl font-semibold mt-6">1. Кои сме ние</h2>
      <p>„Семейна Локация“ е приложение за споделяне на местоположение между членове на семейство или близки кръгове. Свържете се с нас на: <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a>.</p>

      <h2 className="text-xl font-semibold mt-6">2. Какви данни събираме</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Имейл адрес и име (при регистрация).</li>
        <li>Местоположение (GPS координати, точност) — само когато сте включили споделянето.</li>
        <li>Идентификатор на устройството (за разпознаване на различни телефони на един акаунт).</li>
        <li>Push token (за известия, само на мобилните приложения).</li>
        <li>Съобщения, които изпращате до членове на вашите кръгове.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">3. Как използваме данните</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>За да показваме вашата позиция на приетите членове на общите кръгове.</li>
        <li>За да доставяме съобщения и известия.</li>
        <li>За поддръжка и сигурност на услугата.</li>
      </ul>
      <p>Ние <strong>не</strong> продаваме вашите данни. Ние <strong>не</strong> ги използваме за реклама.</p>

      <h2 className="text-xl font-semibold mt-6">4. Background местоположение</h2>
      <p>Ако одобрите „Винаги“ за достъп до местоположение, приложението може да изпраща актуализации, докато е минимизирано или екранът е заключен — само ако сте включили споделянето. Можете да го изключите по всяко време от главния екран.</p>

      <h2 className="text-xl font-semibold mt-6">5. Кой вижда вашите данни</h2>
      <p>Само приетите членове на вашите кръгове, които споделяте с тях. Никой друг потребител няма достъп. Ние (екипът) имаме технически достъп само за поддръжка и при законово изискване.</p>

      <h2 className="text-xl font-semibold mt-6">6. Съхранение</h2>
      <p>Историята на местоположенията се пази до 100 точки на устройство. По-стари записи се изтриват автоматично. Можете да изтриете цялата история по всяко време от Настройки.</p>

      <h2 className="text-xl font-semibold mt-6">7. Вашите права (GDPR)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Достъп до данните си.</li>
        <li>Корекция или изтриване.</li>
        <li>Изтегляне (преносимост).</li>
        <li>Отказ от обработка — спрете споделянето или изтрийте акаунта.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">8. Изтриване на акаунт</h2>
      <p>Можете да изтриете акаунта си от Настройки → Изтрий акаунта. Всички ваши данни ще бъдат изтрити безвъзвратно в рамките на 30 дни.</p>

      <h2 className="text-xl font-semibold mt-6">9. Деца</h2>
      <p>Услугата не е предназначена за деца под 13 години без надзор от родител/настойник.</p>

      <h2 className="text-xl font-semibold mt-6">10. Промени</h2>
      <p>При значителни промени ще ви уведомим в приложението.</p>
    </article>
  );
}

function ContentEN() {
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <h2 className="text-xl font-semibold mt-6">1. Who we are</h2>
      <p>"Family Location" is an app for sharing location between members of a family or close circle. Contact us at: <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a>.</p>

      <h2 className="text-xl font-semibold mt-6">2. Data we collect</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Email address and name (on signup).</li>
        <li>Location (GPS coordinates, accuracy) — only while sharing is on.</li>
        <li>Device identifier (to distinguish multiple phones on one account).</li>
        <li>Push token (for notifications, native apps only).</li>
        <li>Messages you send to members of your circles.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">3. How we use it</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>To show your position to accepted members of shared circles.</li>
        <li>To deliver messages and notifications.</li>
        <li>For service operation and security.</li>
      </ul>
      <p>We do <strong>not</strong> sell your data. We do <strong>not</strong> use it for advertising.</p>

      <h2 className="text-xl font-semibold mt-6">4. Background location</h2>
      <p>If you grant "Always" location permission, the app may send updates while minimized or while the screen is locked — but only when sharing is on. You can turn sharing off at any time from the main screen.</p>

      <h2 className="text-xl font-semibold mt-6">5. Who sees your data</h2>
      <p>Only accepted members of circles you share with. No other user has access. Our team has technical access only for support and as required by law.</p>

      <h2 className="text-xl font-semibold mt-6">6. Retention</h2>
      <p>Location history is capped at 100 points per device. Older entries are deleted automatically. You can delete all history any time from Settings.</p>

      <h2 className="text-xl font-semibold mt-6">7. Your rights (GDPR)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Access your data.</li>
        <li>Correction or deletion.</li>
        <li>Portability.</li>
        <li>Object to processing — stop sharing or delete your account.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">8. Account deletion</h2>
      <p>You can delete your account from Settings → Delete account. All your data is irreversibly deleted within 30 days.</p>

      <h2 className="text-xl font-semibold mt-6">9. Children</h2>
      <p>The service is not intended for children under 13 without parental supervision.</p>

      <h2 className="text-xl font-semibold mt-6">10. Changes</h2>
      <p>We will notify you in-app of any material changes.</p>
    </article>
  );
}
