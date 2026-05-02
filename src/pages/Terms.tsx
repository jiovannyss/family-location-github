import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Terms() {
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
      <h1 className="text-3xl font-bold">Условия за ползване</h1>
      <p className="text-sm text-muted-foreground">Последно обновяване: май 2026</p>

      <h2 className="text-xl font-semibold mt-6">1. Приемане</h2>
      <p>Използвайки „Семейна Локация“, се съгласявате с настоящите условия. Ако не сте съгласни — моля, не използвайте услугата.</p>

      <h2 className="text-xl font-semibold mt-6">2. Описание на услугата</h2>
      <p>Приложението позволява на потребители да споделят местоположението си с приети членове на семейни или близки кръгове и да обменят кратки съобщения.</p>

      <h2 className="text-xl font-semibold mt-6">3. Акаунт</h2>
      <p>Трябва да сте на 13+ години (под надзор на родител, ако сте по-малки). Отговаряте за безопасността на паролата си и за всички действия от вашия акаунт.</p>

      <h2 className="text-xl font-semibold mt-6">4. Допустимо ползване</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Не споделяйте местоположението на хора без тяхно изрично съгласие.</li>
        <li>Не използвайте услугата за следене, тормоз или незаконни цели.</li>
        <li>Не се опитвайте да получите неоторизиран достъп до системата.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">5. Поверителност</h2>
      <p>Обработката на лични данни е описана в <Link to="/privacy" className="text-primary">Политиката за поверителност</Link>.</p>

      <h2 className="text-xl font-semibold mt-6">6. Без гаранции</h2>
      <p>Услугата се предоставя „както е“. Не гарантираме непрекъсната работа. Не разчитайте на нея за критични за живота ситуации (спешна помощ).</p>

      <h2 className="text-xl font-semibold mt-6">7. Прекратяване</h2>
      <p>Можем да прекратим достъпа при нарушаване на условията. Можете да изтриете акаунта си по всяко време от Настройки.</p>

      <h2 className="text-xl font-semibold mt-6">8. Промени</h2>
      <p>Можем да обновяваме тези условия. Значителни промени ще обявяваме в приложението.</p>

      <h2 className="text-xl font-semibold mt-6">9. Контакт</h2>
      <p><a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a></p>
    </article>
  );
}

function ContentEN() {
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <h2 className="text-xl font-semibold mt-6">1. Acceptance</h2>
      <p>By using "Family Location", you agree to these terms. If you disagree, please do not use the service.</p>

      <h2 className="text-xl font-semibold mt-6">2. Service description</h2>
      <p>The app lets users share their location with accepted members of family or close circles and exchange short messages.</p>

      <h2 className="text-xl font-semibold mt-6">3. Account</h2>
      <p>You must be 13+ (with parental supervision if younger). You are responsible for keeping your password safe and for all activity on your account.</p>

      <h2 className="text-xl font-semibold mt-6">4. Acceptable use</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Do not share other people's location without their explicit consent.</li>
        <li>Do not use the service for stalking, harassment, or illegal purposes.</li>
        <li>Do not attempt unauthorized access to the system.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">5. Privacy</h2>
      <p>Personal data handling is described in the <Link to="/privacy" className="text-primary">Privacy Policy</Link>.</p>

      <h2 className="text-xl font-semibold mt-6">6. No warranty</h2>
      <p>The service is provided "as is". We do not guarantee uninterrupted service. Do not rely on it for life-critical situations (emergency response).</p>

      <h2 className="text-xl font-semibold mt-6">7. Termination</h2>
      <p>We may terminate access for violations. You can delete your account anytime from Settings.</p>

      <h2 className="text-xl font-semibold mt-6">8. Changes</h2>
      <p>We may update these terms. Material changes will be announced in-app.</p>

      <h2 className="text-xl font-semibold mt-6">9. Contact</h2>
      <p><a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a></p>
    </article>
  );
}
