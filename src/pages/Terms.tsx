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
      <h1 className="text-3xl font-bold">Условия за ползване</h1>
      <p className="text-sm text-muted-foreground">Последно обновяване: май 2026 г. · Версия 1.0</p>

      <h2 className="text-xl font-semibold mt-6">1. Приемане на условията</h2>
      <p>Като създавате акаунт или използвате „Семейна Локация", потвърждавате, че сте прочели, разбрали и приели тези условия. Ако не сте съгласни — не използвайте услугата.</p>

      <h2 className="text-xl font-semibold mt-6">2. Описание на услугата</h2>
      <p>Приложението позволява на потребители доброволно да споделят местоположението си с приети членове на семейни или близки кръгове и да обменят кратки съобщения. Споделянето е винаги opt-in и може да бъде спряно по всяко време.</p>

      <h2 className="text-xl font-semibold mt-6">3. Изисквания към акаунта</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Минимална възраст 13 г. (с надзор от родител/настойник под тази възраст).</li>
        <li>Един акаунт на човек; забранено е създаване на акаунти от името на други лица без тяхно съгласие.</li>
        <li>Вие отговаряте за безопасността на паролата си и за всички действия от вашия акаунт.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">4. Допустимо ползване — задължителни правила</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Без stalking.</strong> Забранено е използването на услугата за следене, преследване или контрол над лица без тяхно изрично, информирано съгласие.</li>
        <li><strong>Без неоторизирано проследяване.</strong> Не инсталирайте приложението на чуждо устройство, за да следите собственика му без знанието и съгласието му. Това е незаконно в повечето юрисдикции.</li>
        <li><strong>Изисква се съгласие.</strong> Всеки член на кръг трябва сам да създаде акаунт, сам да приеме поканата и сам да включи споделянето.</li>
        <li><strong>Само законно ползване.</strong> Не използвайте услугата за нарушение на закона, тормоз, заплахи, реч на омраза, спам или мошеничество.</li>
        <li><strong>Без злоупотреба с инфраструктурата.</strong> Не се опитвайте да получите неоторизиран достъп, да правите reverse engineering, да претоварвате системата или да заобикаляте сигурността.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">5. Поверителност</h2>
      <p>Обработката на лични данни е описана в <Link to="/privacy" className="text-primary">Политиката за поверителност</Link>, която е неразделна част от тези условия.</p>

      <h2 className="text-xl font-semibold mt-6">6. Без гаранции / ограничение на отговорност</h2>
      <p>Услугата се предоставя „както е" и „според наличността". Не гарантираме непрекъсната работа, точност на местоположението или доставка на известия. <strong>Не разчитайте на приложението при животозастрашаващи ситуации</strong> — за спешна помощ се обадете на 112.</p>
      <p>В максимално допустимата от закона степен ние не носим отговорност за непреки, случайни или последващи вреди, произтичащи от използването или невъзможността за използване на услугата.</p>

      <h2 className="text-xl font-semibold mt-6">7. Прекратяване при злоупотреба</h2>
      <p>Запазваме си правото да спрем или изтрием акаунти, които нарушават тези условия — особено при сигнали за stalking, неоторизирано проследяване или незаконно използване — без предварително предизвестие. Можете да изтриете своя акаунт по всяко време от Настройки.</p>

      <h2 className="text-xl font-semibold mt-6">8. Промени в условията</h2>
      <p>Можем да актуализираме тези условия. При значителни промени ще ви уведомим в приложението преди влизането им в сила.</p>

      <h2 className="text-xl font-semibold mt-6">9. Приложимо право</h2>
      <p>Тези условия се тълкуват според законите на Република България. Спорове се решават по подсъдност в българските съдилища, освен ако императивна норма не предвижда друго.</p>

      <h2 className="text-xl font-semibold mt-6">10. Контакт</h2>
      <p><a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a></p>
    </article>
  );
}

function ContentEN() {
  return (
    <article className="space-y-4">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026 · Version 1.0</p>

      <h2 className="text-xl font-semibold mt-6">1. Acceptance</h2>
      <p>By creating an account or using "Family Location", you confirm that you have read, understood, and accepted these terms. If you disagree — do not use the service.</p>

      <h2 className="text-xl font-semibold mt-6">2. Service description</h2>
      <p>The app lets users voluntarily share their location with accepted members of family or close circles and exchange short messages. Sharing is always opt-in and can be stopped at any time.</p>

      <h2 className="text-xl font-semibold mt-6">3. Account requirements</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Minimum age 13 (with parental/guardian supervision below that age).</li>
        <li>One account per person; creating accounts on behalf of others without their consent is prohibited.</li>
        <li>You are responsible for keeping your password safe and for all activity on your account.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">4. Acceptable use — mandatory rules</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>No stalking.</strong> The service must not be used to monitor, stalk, or control people without their explicit, informed consent.</li>
        <li><strong>No unauthorized tracking.</strong> Do not install the app on someone else's device to track its owner without their knowledge and consent. This is illegal in most jurisdictions.</li>
        <li><strong>Consent required.</strong> Each circle member must create their own account, accept the invite themselves, and turn on sharing themselves.</li>
        <li><strong>Lawful use only.</strong> Do not use the service to break the law or for harassment, threats, hate speech, spam, or fraud.</li>
        <li><strong>No abuse of infrastructure.</strong> No unauthorized access, reverse engineering, denial-of-service, or bypassing security.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6">5. Privacy</h2>
      <p>Personal data handling is described in the <Link to="/privacy" className="text-primary">Privacy Policy</Link>, which is an integral part of these terms.</p>

      <h2 className="text-xl font-semibold mt-6">6. No warranty / limitation of liability</h2>
      <p>The service is provided "as is" and "as available". We do not guarantee uninterrupted service, location accuracy, or notification delivery. <strong>Do not rely on the app in life-threatening situations</strong> — call your local emergency number.</p>
      <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from use of, or inability to use, the service.</p>

      <h2 className="text-xl font-semibold mt-6">7. Termination for misuse</h2>
      <p>We reserve the right to suspend or delete accounts that violate these terms — particularly in case of reports of stalking, unauthorized tracking, or unlawful use — without prior notice. You may delete your own account at any time from Settings.</p>

      <h2 className="text-xl font-semibold mt-6">8. Changes</h2>
      <p>We may update these terms. We will notify you in-app of any material changes before they take effect.</p>

      <h2 className="text-xl font-semibold mt-6">9. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of Bulgaria. Disputes are subject to the jurisdiction of the Bulgarian courts unless mandatory law provides otherwise.</p>

      <h2 className="text-xl font-semibold mt-6">10. Contact</h2>
      <p><a href="mailto:support@glowter.com" className="text-primary">support@glowter.com</a></p>
    </article>
  );
}
