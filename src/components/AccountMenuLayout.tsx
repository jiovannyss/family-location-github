import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';

interface Props {
  title: string;
  children: ReactNode;
}

export default function AccountMenuLayout({ title, children }: Props) {
  const navigate = useNavigate();
  useHardwareBackButton();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-2xl px-4 py-6 pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] sm:pt-[calc(4rem+env(safe-area-inset-top)+1.5rem)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-2 sm:gap-4 sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              aria-label="Назад"
              className="shrink-0 gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Назад</span>
            </Button>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          </div>
          {children}
        </motion.div>
      </main>
    </div>
  );
}
