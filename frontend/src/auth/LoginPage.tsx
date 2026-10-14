import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useLogin, useMe } from '../api/hooks'
import { ErrorBox } from '../components/feedback'
import { LogoMark } from '../components/icons'

export function LoginPage() {
  const me = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (me.data) return <Navigate to={from} replace />

  function submit(event: FormEvent) {
    event.preventDefault()
    login.mutate({ username, password }, { onSuccess: () => navigate(from, { replace: true }) })
  }

  return (
    <main className="grid h-full place-items-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--c-accent)_14%,transparent),transparent_60%)] p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-line bg-surface/80 p-7 shadow-[0_0_60px_-20px_var(--c-accent)] backdrop-blur"
      >
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-tight">
              caronte<span className="animate-pulse text-accent">_</span>
            </h1>
            <p className="text-xs text-muted">explorador de bases de datos · solo lectura</p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="font-mono text-xs text-muted">usuario</span>
          <input
            className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-mono text-xs text-muted">contraseña</span>
          <input
            className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {login.isError && <ErrorBox error={login.error} />}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-md bg-accent px-3 py-2 font-mono text-sm font-semibold text-on-accent transition hover:bg-accent-soft disabled:opacity-60"
        >
          {login.isPending ? 'entrando…' : 'entrar →'}
        </button>
      </form>
    </main>
  )
}
