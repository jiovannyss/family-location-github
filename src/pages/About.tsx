import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AccountMenuLayout from '@/components/AccountMenuLayout';
import { getAppVersionInfo, APP_VERSION, type AppVersionInfo } from '@/lib/version';

export default function About() {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo>({ version: APP_VERSION });

  useEffect(() => {
    getAppVersionInfo().then(setVersionInfo).catch(() => { /* ignore */ });
  }, []);

  return (
    <AccountMenuLayout title="За приложението">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            За приложението
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Версия</span>
            <span className="font-mono font-medium">
              {versionInfo.nativeVersion ?? versionInfo.version}
              {versionInfo.nativeBuild ? ` (${versionInfo.nativeBuild})` : ''}
            </span>
          </div>
          {versionInfo.nativeVersion && versionInfo.nativeVersion !== versionInfo.version && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Web версия</span>
              <span className="font-mono">{versionInfo.version}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </AccountMenuLayout>
  );
}
