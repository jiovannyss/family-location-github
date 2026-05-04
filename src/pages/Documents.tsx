import { Link } from 'react-router-dom';
import { Shield, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AccountMenuLayout from '@/components/AccountMenuLayout';

export default function Documents() {
  return (
    <AccountMenuLayout title="Документи">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Документи
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            to="/privacy"
            className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Shield className="w-4 h-4" /> Политика за поверителност
            </span>
            <span className="text-xs text-muted-foreground">→</span>
          </Link>
          <Link
            to="/terms"
            className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <FileText className="w-4 h-4" /> Условия за ползване
            </span>
            <span className="text-xs text-muted-foreground">→</span>
          </Link>
        </CardContent>
      </Card>
    </AccountMenuLayout>
  );
}
