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
              <ArrowLeft className="w-4 h-4" /> Назад / Back
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
      <p className="text-sm text-muted-foreground">Последно обновяване: май 2026 г. · Версия 1.0</p>

      <p>
        „Семейна Локация" („приложението", „ние") е мобилно и уеб приложение за доброволно
        споделяне на местоположение между членове на семейство или близки кръгове. Тази
        политика обяснява какви данни събираме, защо ги събираме, с кого ги споделяме и
        какви права имате.
      </p>

      <h2 className="text-xl font-semibold mt-6">1. Администратор на данни</h2>
      <p>
        Администратор: екипът на „Семейна Локация".<br />
        Имейл за контакт: <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a><br />
        Поддръжка: <a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a>
      </p>

      <h2 className="text-xl font-semibold mt-6">2. Какви данни събираме</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Данни за акаунта:</strong> имейл адрес, име за показване, парола (хеширана).</li>
        <li><strong>Точно местоположение (GPS):</strong> географски координати, точност, ниво на батерията — <em>само когато сте включили споделянето</em>.</li>
        <li><strong>Background местоположение:</strong> само ако изрично сте дали „Винаги" разрешение и сте активирали споделянето.</li>
        <li><strong>Идентификатори на устройство:</strong> локално генериран device ID за разпознаване на различни телефони на един акаунт.</li>
        <li><strong>Push токени:</strong> от Firebase Cloud Messaging (Android) / Apple Push Notification Service (iOS) — само на нативните приложения.</li>
        <li><strong>Съобщения:</strong> кратки съобщения, които изпращате до членове на вашите кръгове.</li>
        <li><strong>Членство в кръгове:</strong> кои кръгове създавате/в които участвате и статус (поканен/приет).</li>
      </ul>
      <p>Не събираме: контакти, снимки, медия, микрофон, рекламни идентификатори, история на сърфирането.</p>

      <h2 className="text-xl font-semibold mt-6">3. Кога и защо събираме данни</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Foreground location</strong> — когато сте отворили картата и сте активирали споделянето, за да виждат близките ви къде сте.</li>
        <li><strong>Background location</strong> — само когато <u>сами</u> сте включили споделянето и сте дали „Винаги" разрешение, за да продължи актуализацията при заключен екран или минимизирано приложение (основна функция за безопасност на семейството).</li>
        <li><strong>Push токени</strong> — за да доставяме известия за нови съобщения от членове на кръга.</li>
        <li><strong>Съобщения и членство</strong> — за да работи функцията „кръгове".</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">4. С кого споделяме данните</h2>
      <p>Вашите лични данни се виждат <strong>само от приети членове на кръговете</strong>, в които вие сте се включили доброволно. Никой друг потребител няма достъп.</p>
      <p>Използваме следните доставчици на инфраструктура (data processors), които обработват данни от наше име по силата на договор:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> (Supabase Inc., AWS EU регион) — база данни, автентикация, real-time, edge функции, файлове.</li>
        <li><strong>Firebase Cloud Messaging</strong> (Google LLC) — доставка на push известия на Android.</li>
        <li><strong>Apple Push Notification Service</strong> (Apple Inc.) — доставка на push известия на iOS.</li>
        <li><strong>Lovable / Хостинг доставчик</strong> — хостинг на уеб приложението.</li>
      </ul>
      <p>Ние <strong>не продаваме</strong> вашите данни. Не ги използваме за реклама. Не ги предоставяме на брокери или трети страни за маркетинг.</p>

      <h2 className="text-xl font-semibold mt-6">5. Сигурност</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Всички данни се предават по криптирана връзка (HTTPS/TLS 1.2+).</li>
        <li>Достъпът до базата е защитен с Row-Level Security политики — всеки потребител вижда само своите данни и тези на членовете на своите кръгове.</li>
        <li>Паролите се съхраняват хеширани (никога в чист вид).</li>
        <li>Edge функциите за известия са защитени с вътрешен secret срещу неоторизиран достъп.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">6. Срок на съхранение</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Историята на местоположенията: до 100 точки на устройство; по-стари записи се изтриват автоматично.</li>
        <li>Съобщения: до изтриването им от подателя/получателя или до изтриване на акаунта.</li>
        <li>Данни за акаунта: до изтриване на акаунта.</li>
        <li>Push токени: до logout или uninstall.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">7. Изтриване на акаунт</h2>
      <p>
        Можете да изтриете акаунта си по всяко време от <strong>Настройки → Изтрий акаунта</strong>. Всички свързани с вас
        данни (профил, локации, съобщения, push токени, членство в кръгове, кръгове, на които сте собственик) се
        изтриват необратимо в рамките на 30 дни. Резервните копия се ротират и презаписват в рамките на 30 дни.
      </p>
      <p>
        Алтернатива: изпратете заявка на <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a> от регистрирания имейл.
      </p>

      <h2 className="text-xl font-semibold mt-6">8. Вашите права (GDPR / ЗЗЛД)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Достъп до данните си.</li>
        <li>Корекция на неточни данни.</li>
        <li>Изтриване („право да бъдеш забравен").</li>
        <li>Преносимост на данните.</li>
        <li>Възражение и ограничаване на обработката (спрете споделянето или изтрийте акаунта).</li>
        <li>Жалба до Комисията за защита на личните данни (КЗЛД).</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">9. Деца и безопасност</h2>
      <p>
        Услугата не е предназначена за деца под 13 години без надзор и съгласие на родител/настойник.
        Приложението <strong>не</strong> трябва да се използва за неоторизирано проследяване на хора без тяхно
        изрично съгласие. Споделянето на местоположение винаги е <strong>opt-in</strong> и може да бъде
        прекратено от потребителя по всяко време с един бутон.
      </p>

      <h2 className="text-xl font-semibold mt-6">10. Промени в политиката</h2>
      <p>При значителни промени ще ви уведомим в приложението преди влизането им в сила.</p>

      <h2 className="text-xl font-semibold mt-6">11. Контакт</h2>
      <p><a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a></p>
    </article>
  );
}

function ContentEN() {
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026 · Version 1.0</p>

      <p>
        "Family Location" ("the app", "we", "us") is a mobile and web application for the
        voluntary sharing of location between members of a family or close circle. This
        policy explains what data we collect, why, with whom we share it, and your rights.
      </p>

      <h2 className="text-xl font-semibold mt-6">1. Data controller</h2>
      <p>
        Controller: the "Family Location" team.<br />
        Contact: <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a><br />
        Support: <a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a>
      </p>

      <h2 className="text-xl font-semibold mt-6">2. Data we collect</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Account data:</strong> email address, display name, password (hashed).</li>
        <li><strong>Precise location (GPS):</strong> coordinates, accuracy, battery level — <em>only while sharing is on</em>.</li>
        <li><strong>Background location:</strong> only if you explicitly grant the "Always" permission and turn sharing on.</li>
        <li><strong>Device identifiers:</strong> a locally generated device ID to distinguish multiple phones on one account.</li>
        <li><strong>Push tokens:</strong> from Firebase Cloud Messaging (Android) / Apple Push Notification Service (iOS) — native apps only.</li>
        <li><strong>Messages:</strong> short messages you send to members of your circles.</li>
        <li><strong>Circle membership:</strong> which circles you create or belong to and status (invited / accepted).</li>
      </ul>
      <p>We do <strong>not</strong> collect contacts, photos, media, microphone audio, advertising IDs, or browsing history.</p>

      <h2 className="text-xl font-semibold mt-6">3. When and why we collect data</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Foreground location</strong> — while the map is open and sharing is on, so loved ones can see where you are.</li>
        <li><strong>Background location</strong> — only when <u>you</u> have turned sharing on and granted "Always" permission, so that updates continue while the screen is locked or the app is minimized (the core family-safety feature).</li>
        <li><strong>Push tokens</strong> — to deliver notifications about new messages from circle members.</li>
        <li><strong>Messages and membership</strong> — to make the "circles" feature work.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">4. Who we share data with</h2>
      <p>Your personal data is visible only to <strong>accepted members of circles you joined voluntarily</strong>. No other user has access.</p>
      <p>We use the following infrastructure providers (data processors), bound by contract to process data on our behalf:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> (Supabase Inc., AWS EU region) — database, auth, real-time, edge functions, file storage.</li>
        <li><strong>Firebase Cloud Messaging</strong> (Google LLC) — push delivery on Android.</li>
        <li><strong>Apple Push Notification Service</strong> (Apple Inc.) — push delivery on iOS.</li>
        <li><strong>Lovable / hosting provider</strong> — hosting of the web app.</li>
      </ul>
      <p>We <strong>do not sell</strong> your data. We do not use it for advertising. We do not provide it to data brokers or third parties for marketing.</p>

      <h2 className="text-xl font-semibold mt-6">5. Security</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>All data is transmitted over an encrypted connection (HTTPS / TLS 1.2+).</li>
        <li>Database access is enforced by Row-Level Security policies — each user can only see their own data and that of accepted circle members.</li>
        <li>Passwords are stored hashed (never in plain text).</li>
        <li>Push edge functions are protected by an internal secret against unauthorized access.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">6. Retention</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Location history: up to 100 points per device; older entries are deleted automatically.</li>
        <li>Messages: until deleted by sender/recipient or account deletion.</li>
        <li>Account data: until account deletion.</li>
        <li>Push tokens: until logout or uninstall.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">7. Account deletion</h2>
      <p>
        You can delete your account at any time from <strong>Settings → Delete account</strong>. All associated data
        (profile, locations, messages, push tokens, circle memberships, owned circles) is irreversibly deleted within
        30 days. Backups are rotated and overwritten within 30 days.
      </p>
      <p>
        Alternatively, email <a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a> from your registered address.
      </p>

      <h2 className="text-xl font-semibold mt-6">8. Your rights (GDPR)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Access to your data.</li>
        <li>Rectification of inaccurate data.</li>
        <li>Erasure ("right to be forgotten").</li>
        <li>Data portability.</li>
        <li>Object to and restrict processing (stop sharing or delete the account).</li>
        <li>Lodge a complaint with your data protection authority.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">9. Children & safety</h2>
      <p>
        The service is not intended for children under 13 without supervision and consent of a parent/guardian.
        The app must <strong>not</strong> be used to track people without their explicit consent. Location sharing
        is always <strong>opt-in</strong> and can be stopped by the user at any time with a single tap.
      </p>

      <h2 className="text-xl font-semibold mt-6">10. Changes</h2>
      <p>We will notify you in-app of any material changes before they take effect.</p>

      <h2 className="text-xl font-semibold mt-6">11. Contact</h2>
      <p><a href="mailto:privacy@glowter.com" className="text-primary">privacy@glowter.com</a></p>
    </article>
  );
}
