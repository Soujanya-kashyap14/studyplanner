import { RotateCw } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/** On-brand error state with a retry action. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="glass mx-auto mt-10 max-w-lg">
      <EmptyState
        art="lost"
        title="Lost signal with mission control"
        description={message ?? 'We could not load your universe. Check your connection and try again.'}
        action={
          onRetry && (
            <Button variant="secondary" icon={<RotateCw className="h-4 w-4" />} onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    </div>
  );
}
