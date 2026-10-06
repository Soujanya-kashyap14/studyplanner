import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="glass mx-auto mt-10 max-w-lg">
      <EmptyState
        art="lost"
        title="Drifted out of orbit"
        description="This page is somewhere past the edge of the map."
        action={
          <Link to="/">
            <Button>Return to your sky</Button>
          </Link>
        }
      />
    </div>
  );
}
