import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function App() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Project ready</CardTitle>
          <CardDescription>
            Vite + React + Tailwind CSS v4 + shadcn/ui, all in JSX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Edit{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              src/App.jsx
            </code>{' '}
            and save to test HMR.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button asChild>
            <a href="https://ui.shadcn.com" target="_blank" rel="noreferrer">
              shadcn docs
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://vite.dev" target="_blank" rel="noreferrer">
              Vite docs
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default App
