import { CircleCheck, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from './components/ui/alert';

export type FeedbackTone = 'success' | 'error' | 'info' | 'warning';

export function FeedbackBanner({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: FeedbackTone;
}) {
  if (!message) return null;
  const Icon =
    tone === 'success'
      ? CircleCheck
      : tone === 'error'
        ? CircleAlert
        : tone === 'warning'
          ? TriangleAlert
          : Info;
  return (
    <Alert
      variant={tone === 'error' ? 'destructive' : tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
